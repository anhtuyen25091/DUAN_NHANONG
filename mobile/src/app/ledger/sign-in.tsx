import { CLOUD_PRIVACY_NOTE, ApiError, previousAccount, type AccountUser, type LedgerSnapshot } from '@nhanong/shared';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Button, Card, Chip, styles } from '../../components/ui';
import { api } from '../../lib/api';
import { setAuth, useAuth } from '../../lib/auth';
import { useLedger } from '../../lib/ledger';
import { deviceName, getSync } from '../../lib/sync';
import { colors, font } from '../../lib/theme';
import { showToast } from '../../lib/toast';

type Tab = 'register' | 'login';

/** Đăng nhập / tạo tài khoản bằng số điện thoại để bật "lưu cả trên mạng" */
export default function SignInScreen() {
  const state = useLedger();
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  return <SignInForm data={state.data} />;
}

function SignInForm({ data }: { data: LedgerSnapshot }) {
  const account = data.meta.account;
  const signedIn = useAuth();
  // Phiên hết hạn thì đăng nhập lại, số điện thoại điền sẵn
  const [tab, setTab] = useState<Tab>(account ? 'login' : 'register');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState(account?.phone ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // Đăng nhập tài khoản khác trên máy đang có sổ của tài khoản trước: hỏi gộp hay bỏ sổ trên máy
  const [conflict, setConflict] = useState<{ token: string; user: AccountUser; previous: string; fresh: boolean } | null>(null);
  const hasData = data.transactions.length > 0 || data.gardens.length > 0;

  const submit = async () => {
    setSending(true);
    setErrors({});
    setMessage(null);
    try {
      const input = { phone: phone.trim(), password, device_name: deviceName() };
      const { token, user } = tab === 'register' ? await api.register({ ...input, name: name.trim() }) : await api.login(input);
      const previous = previousAccount(data, user);
      if (previous) setConflict({ token, user, previous, fresh: true });
      else await finish(token, user);
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.errors);
      setMessage((error as Error).message);
    } finally {
      setSending(false);
    }
  };

  const finish = async (token: string, user: AccountUser, discardLocal = false, fresh = true) => {
    await getSync().enable(token, user, { discardLocal });
    // Dùng luôn tài khoản này để xem lịch sử giá dài hơn
    setAuth(fresh || !signedIn ? { token, user, shared: true } : { ...signedIn, shared: true });
    showToast({ message: `Đã bật lưu cả trên mạng cho tài khoản ${user.phone ?? user.name}.` });
    router.back();
  };

  const choose = async (discardLocal: boolean | null) => {
    if (!conflict) return;
    setSending(true);
    setMessage(null);
    try {
      if (discardLocal === null) {
        // Thôi: không đổi gì, hủy phiên vừa đăng nhập (trừ khi đó là phiên đang dùng để xem giá)
        if (conflict.fresh) await api.logout(conflict.token).catch(() => {});
        setConflict(null);
        return;
      }
      await finish(conflict.token, conflict.user, discardLocal, conflict.fresh);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
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

  const enableWithSignedIn = async () => {
    if (!signedIn) return;
    const previous = previousAccount(data, signedIn.user);
    if (previous) {
      setConflict({ token: signedIn.token, user: signedIn.user, previous, fresh: false });
      return;
    }
    setSending(true);
    setMessage(null);
    try {
      await finish(signedIn.token, signedIn.user, false, false);
    } catch (error) {
      setMessage((error as Error).message);
      setSending(false);
    }
  };

  if (conflict) {
    const next = conflict.user.phone ?? conflict.user.name;
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
        <Stack.Screen options={{ title: 'Máy đang có sổ khác' }} />
        <Text style={styles.body}>
          Sổ trên máy đang gắn với tài khoản <Text style={{ fontWeight: '700' }}>{conflict.previous}</Text>. Bạn vừa đăng nhập{' '}
          <Text style={{ fontWeight: '700' }}>{next}</Text>. Bạn muốn làm gì với sổ đang có trên máy?
        </Text>
        <Button label={`Gộp sổ trên máy vào tài khoản ${next}`} onPress={() => choose(false)} disabled={sending} />
        <Text style={styles.muted}>Các khoản thu chi trên máy được gửi lên tài khoản {next}, cộng chung với sổ đã có của tài khoản đó.</Text>
        <Button
          label={`Bỏ sổ trên máy, chỉ dùng sổ của ${next}`}
          variant="danger"
          disabled={sending}
          onPress={() =>
            Alert.alert('Bỏ sổ trên máy?', `Xóa sổ đang có trên máy này và chỉ dùng sổ của tài khoản ${next}? Sổ của ${conflict.previous} đã lưu trên mạng vẫn còn, đăng nhập lại là có.`, [
              { text: 'Không', style: 'cancel' },
              { text: 'Bỏ sổ trên máy', style: 'destructive', onPress: () => void choose(true) },
            ])
          }
        />
        <Text style={styles.muted}>Hợp khi máy này dùng chung, hoặc sổ trên máy là của người khác.</Text>
        <Button label="Thôi, không đổi gì" variant="outline" onPress={() => choose(null)} disabled={sending} />
        {message && <Text style={[styles.body, { color: colors.error }]}>{message}</Text>}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 6 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Lưu cả trên mạng' }} />
      <Text style={[styles.muted, { marginBottom: 6 }]}>
        Dùng số điện thoại để đăng nhập. Đổi máy hoặc mất máy chỉ cần đăng nhập lại là có đủ sổ.
        {hasData ? ' Sổ đang có trên máy này sẽ được gửi lên tài khoản.' : ''}
      </Text>
      <Text style={[styles.muted, { marginBottom: 6 }]}>🔒 {CLOUD_PRIVACY_NOTE}</Text>
      {signedIn && !account && (
        <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primary, gap: 10 }}>
          <Text style={styles.body}>
            Bạn đang đăng nhập tài khoản <Text style={{ fontWeight: '700' }}>{signedIn.user.phone ?? signedIn.user.name}</Text>.
          </Text>
          <Button label="Dùng tài khoản này" onPress={enableWithSignedIn} disabled={sending} />
        </Card>
      )}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
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
      {tab === 'register' && <Text style={[styles.muted, { marginBottom: 6 }]}>Ít nhất 6 ký tự. Ghi lại ở chỗ an toàn để không quên.</Text>}
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

      {generalMessage && (
        <Card style={{ borderColor: colors.error }}>
          <Text style={[styles.body, { color: colors.error }]}>{generalMessage}</Text>
        </Card>
      )}
      <Button label={sending ? 'Đang gửi…' : tab === 'register' ? 'Tạo tài khoản và bật lưu trên mạng' : 'Đăng nhập'} onPress={submit} disabled={!canSubmit} />
    </ScrollView>
  );
}
