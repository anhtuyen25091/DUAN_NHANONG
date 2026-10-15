import { ApiError, formatDate, formatVnd } from '@nhanong/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Button, Card, Chip, Status, styles } from '../components/ui';
import { api } from '../lib/api';
import { setAuth, updateAuthUser, useAuth } from '../lib/auth';
import { adoptAccountLocation } from '../lib/myLocation';
import { deviceName } from '../lib/sync';
import { colors, font } from '../lib/theme';
import { useAsync } from '../lib/useAsync';

/**
 * Tài khoản: đăng nhập / đăng ký bằng số điện thoại, xem mức xem giá và các gói.
 * ?back=1: mở từ trang biểu đồ giá, đăng nhập xong thì quay lại trang đó.
 */
export default function AccountScreen() {
  const auth = useAuth();
  const { back } = useLocalSearchParams<{ back?: string }>();
  const plans = useAsync(() => api.plans(), []);

  // Cập nhật mức xem / hạn gói mới nhất (admin vừa kích hoạt gói…)
  useEffect(() => {
    if (!auth) return;
    api.me(auth.token).then((user) => {
      updateAuthUser(user);
      adoptAccountLocation(user.location);
    }, (error) => {
      if (error instanceof ApiError && error.status === 401) setAuth(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.token]);

  const limits = plans.state.status === 'ok' ? plans.state.data.limits : { guest_days: 10, member_days: 30 };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={plans.refreshing} onRefresh={plans.reload} colors={[colors.primary]} />}
    >
      {auth ? (
        <SignedIn />
      ) : (
        <SignInForm memberDays={limits.member_days} guestDays={limits.guest_days} onDone={back && router.canGoBack() ? () => router.back() : undefined} />
      )}

      <Text style={sectionTitle}>Xem lịch sử giá</Text>
      <Card style={{ gap: 6 }}>
        <Text style={styles.body}>
          <Text style={{ fontWeight: '700' }}>Chưa đăng nhập:</Text> xem {limits.guest_days} ngày gần nhất
        </Text>
        <Text style={styles.body}>
          <Text style={{ fontWeight: '700' }}>Đăng ký miễn phí:</Text> xem {limits.member_days} ngày gần nhất
        </Text>
        <Text style={styles.body}>
          <Text style={{ fontWeight: '700' }}>Có gói:</Text> xem toàn bộ lịch sử (tới 5 năm), so sánh giá các năm
        </Text>
      </Card>

      <Status state={plans.state} retry={plans.reload} />
      {plans.state.status === 'ok' &&
        plans.state.data.data.map((p) => (
          <Card key={p.code} style={{ gap: 2 }}>
            <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text }}>{p.name}</Text>
            <Text style={{ fontSize: font.title, fontWeight: '700', color: colors.primary }}>{formatVnd(p.price)}</Text>
            <Text style={styles.muted}>{p.months === 1 ? '1 tháng' : `${p.months} tháng`}</Text>
            {p.description ? <Text style={styles.body}>{p.description}</Text> : null}
          </Card>
        ))}
      <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }}>
        <Text style={styles.body}>
          Thanh toán trong app sẽ có ở bản sau. Hiện tại: liên hệ Nhà Nông, báo số điện thoại{auth?.user.phone ? ` ${auth.user.phone}` : ' đã đăng ký'} và gói muốn mua để được kích hoạt.
        </Text>
      </Card>
    </ScrollView>
  );
}

const sectionTitle = { fontSize: font.body + 1, fontWeight: '700' as const, color: colors.text, marginTop: 8, marginBottom: 8 };

function SignedIn() {
  const auth = useAuth()!;
  const { user } = auth;
  const premium = user.tier === 'premium';
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    setBusy(true);
    // Token dùng chung với "lưu cả trên mạng" của sổ thì không hủy trên server (sổ vẫn đồng bộ được)
    if (!auth.shared) await api.logout(auth.token).catch(() => {});
    setAuth(null);
  };

  return (
    <Card style={{ gap: 8 }}>
      <Text style={styles.body}>
        <Text style={{ fontWeight: '700' }}>{user.name}</Text>
        {user.phone ? <Text style={{ color: colors.muted }}> · {user.phone}</Text> : null}
      </Text>
      <Text style={[styles.body, premium && { color: colors.primary, fontWeight: '700' }]}>
        {premium ? `⭐ Có gói xem giá${user.premium_until ? ` đến ${formatDate(user.premium_until)}` : ''}` : 'Tài khoản thường (chưa có gói)'}
      </Text>
      <Button
        label={`🏪 ${user.buyer_status === 'approved' ? 'Đăng giá của điểm mua' : user.buyer_status ? 'Hồ sơ điểm mua' : 'Tôi là đại lý / thương lái: đăng giá'}`}
        variant="outline"
        onPress={() => router.push('/buyer')}
      />
      <Button label="📍 Khu vực của tôi & giá quanh tôi" variant="outline" onPress={() => router.push('/local-prices')} />
      <Button label="Đăng xuất" variant="outline" onPress={logout} disabled={busy} />
    </Card>
  );
}

type Tab = 'register' | 'login';

function SignInForm({ memberDays, guestDays, onDone }: { memberDays: number; guestDays: number; onDone?: () => void }) {
  const [tab, setTab] = useState<Tab>('register');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    setSending(true);
    setErrors({});
    setMessage(null);
    try {
      const input = { phone: phone.trim(), password, device_name: deviceName() };
      const result = tab === 'register' ? await api.register({ ...input, name: name.trim() }) : await api.login(input);
      setAuth(result);
      onDone?.();
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.errors);
      setMessage((error as Error).message);
      setSending(false);
    }
  };

  const error = (key: string) => (errors[key] ? <Text style={{ color: colors.error, fontSize: font.small, marginBottom: 6 }}>{errors[key][0]}</Text> : null);
  const field = (label: string, value: string, onChange: (v: string) => void, props: TextInputProps = {}) => (
    <>
      <Text style={styles.body}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholderTextColor={colors.muted}
        style={{ minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, fontSize: font.body, backgroundColor: colors.surface, color: colors.text, marginBottom: 6 }}
        {...props}
      />
    </>
  );
  // Lỗi đã hiện dưới ô nhập thì không lặp lại ở cuối form
  const generalMessage = message && Object.keys(errors).length === 0 ? message : null;
  const canSubmit = !sending && phone.trim() !== '' && password !== '' && (tab === 'login' || name.trim() !== '');

  return (
    <Card style={{ gap: 4 }}>
      <Text style={[styles.muted, { marginBottom: 6 }]}>
        Đăng ký miễn phí bằng số điện thoại để xem giá {memberDays} ngày gần nhất (chưa đăng nhập chỉ xem {guestDays} ngày).
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <Chip label="Tạo tài khoản mới" active={tab === 'register'} onPress={() => setTab('register')} />
        <Chip label="Đã có tài khoản" active={tab === 'login'} onPress={() => setTab('login')} />
      </View>

      {tab === 'register' && field('Tên của bạn', name, setName, { maxLength: 100, placeholder: 'Ví dụ: Chú Ba Tâm', autoComplete: 'name' })}
      {tab === 'register' && error('name')}
      {field('Số điện thoại', phone, setPhone, { keyboardType: 'phone-pad', maxLength: 20, placeholder: '0912 345 678', autoComplete: 'tel' })}
      {error('phone')}
      {field('Mật khẩu', password, setPassword, {
        secureTextEntry: !showPassword,
        maxLength: 100,
        autoCapitalize: 'none',
        autoComplete: tab === 'register' ? 'new-password' : 'current-password',
      })}
      {tab === 'register' && <Text style={[styles.muted, { marginBottom: 6 }]}>Ít nhất 6 ký tự.</Text>}
      {error('password')}
      <Pressable
        onPress={() => setShowPassword(!showPassword)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: showPassword }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, marginBottom: 6 }}
      >
        <Text style={{ fontSize: 22 }}>{showPassword ? '☑️' : '⬜️'}</Text>
        <Text style={styles.body}>Hiện mật khẩu</Text>
      </Pressable>

      {generalMessage && <Text style={[styles.body, { color: colors.error, marginBottom: 6 }]}>{generalMessage}</Text>}
      <Button label={sending ? 'Đang gửi…' : tab === 'register' ? 'Tạo tài khoản' : 'Đăng nhập'} onPress={submit} disabled={!canSubmit} />
    </Card>
  );
}
