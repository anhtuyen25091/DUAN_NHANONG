import { ApiError, canControl, canManage, planLabel, ROLE_LABELS } from '@nhanong/shared';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Text, TextInput } from '../../components/AppText';
import { inputStyle } from '../../components/fields';
import { AlertCard, SectionTitle } from '../../components/iot';
import { WeatherCard } from '../../components/iotWeather';
import { Button, Card, Chip, Status, styles } from '../../components/ui';
import { flushDeviceFiles, iotApi, linkNhanongIfPossible, setIotAuth, signOutIot, syncIotPush, useIotAuth, usePendingDeviceFiles } from '../../lib/iot';
import { confirmAsync } from '../../lib/confirm';
import { registerPush } from '../../lib/push';
import { colors, font } from '../../lib/theme';
import { showToast } from '../../lib/toast';
import { useAsync } from '../../lib/useAsync';

/** Cảm biến ruộng / ao: đăng nhập tài khoản cảm biến, danh sách lô, cảnh báo đang mở */
export default function IotHomeScreen() {
  const auth = useIotAuth();
  return (
    <>
      <Stack.Screen options={{ title: '📡 Cảm biến ruộng · ao' }} />
      {auth ? <Farms /> : <SignIn />}
    </>
  );
}

function SignIn() {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    setSending(true);
    setErrors({});
    setMessage(null);
    try {
      const result = tab === 'login' ? await iotApi.login(email.trim(), password) : await iotApi.register(name.trim(), email.trim(), password);
      setIotAuth(result);
      // Hỏi quyền thông báo để báo khi số đo vượt ngưỡng (cả khi app đóng)
      registerPush(true)
        .then(syncIotPush)
        .catch(() => {});
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.errors);
      setMessage((error as Error).message);
    } finally {
      setSending(false);
    }
  };

  const error = (key: string) => (errors[key] ? <Text style={{ color: colors.error, fontSize: font.small, marginTop: -6, marginBottom: 6 }}>{errors[key][0]}</Text> : null);
  const canSubmit = !sending && email.trim() !== '' && password !== '' && (tab === 'login' || name.trim() !== '');

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }} keyboardShouldPersistTaps="handled">
      <Card>
        <Text style={[styles.body, { fontWeight: '700', marginBottom: 4 }]}>Theo dõi ruộng, ao bằng cảm biến</Text>
        <Text style={styles.muted}>
          Xem độ ẩm, pH, độ mặn, mực nước, oxy trong ao… do thiết bị gửi về, và nhận thông báo khi vượt ngưỡng. Tài khoản cảm biến dùng email, riêng với tài khoản Nhà Nông.
        </Text>
      </Card>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
        <Chip label="Đăng nhập" active={tab === 'login'} onPress={() => setTab('login')} />
        <Chip label="Tạo tài khoản" active={tab === 'register'} onPress={() => setTab('register')} />
      </View>
      {tab === 'register' && (
        <>
          <Text style={styles.body}>Tên</Text>
          <TextInput value={name} onChangeText={setName} style={[inputStyle, { marginBottom: 6 }]} placeholderTextColor={colors.muted} />
          {error('name')}
        </>
      )}
      <Text style={styles.body}>Email</Text>
      <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" style={[inputStyle, { marginBottom: 6 }]} />
      {error('email')}
      <Text style={styles.body}>Mật khẩu</Text>
      <TextInput value={password} onChangeText={setPassword} secureTextEntry style={[inputStyle, { marginBottom: 6 }]} />
      {error('password')}
      <Button label={sending ? 'Đang gửi…' : tab === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'} onPress={submit} disabled={!canSubmit} />
      {message && Object.keys(errors).length === 0 && <Text style={[styles.body, { color: colors.error }]}>{message}</Text>}
    </ScrollView>
  );
}

function Farms() {
  const auth = useIotAuth();
  const pending = usePendingDeviceFiles();
  const farms = useAsync(() => iotApi.farms(), []);
  const alerts = useAsync(() => iotApi.alerts(true), []);
  const [sending, setSending] = useState(false);

  const sendPending = useCallback(async (quiet: boolean) => {
    setSending(true);
    const result = await flushDeviceFiles();
    setSending(false);
    if (result.sent > 0) showToast({ message: `Đã gửi ${result.sent} file, nhận ${result.accepted} số đo mới.` });
    else if (result.failed && !quiet) showToast({ message: result.failed });
  }, []);

  // Mở lại màn hình (vd vừa tải file ở ruộng về, đã có mạng): gửi file đang chờ, tải lại số liệu
  useFocusEffect(
    useCallback(() => {
      if (pending.length > 0) void sendPending(true);
      // Đã đăng nhập Nhà Nông trên máy: dùng chung gói (xem lượng mưa 1 năm)
      void linkNhanongIfPossible();
      farms.refetch();
      alerts.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const reload = () => {
    farms.reload();
    alerts.reload();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={farms.refreshing} onRefresh={reload} />}>
      {pending.length > 0 && (
        <Card style={{ borderLeftWidth: 6, borderLeftColor: colors.star }}>
          <Text style={[styles.body, { fontWeight: '700' }]}>
            📥 {pending.length} file dữ liệu chưa gửi ({pending.reduce((n, f) => n + f.rows, 0)} số đo)
          </Text>
          <Text style={[styles.muted, { marginBottom: 8 }]}>Đã tải từ thiết bị ở ruộng. App tự gửi khi có mạng.</Text>
          <Button label={sending ? 'Đang gửi…' : 'Gửi ngay'} onPress={() => sendPending(false)} disabled={sending} variant="outline" />
        </Card>
      )}

      {alerts.state.status === 'ok' && alerts.state.data.length > 0 && (
        <>
          <SectionTitle text={`⚠️ ${alerts.state.data.length} cảnh báo đang mở`} />
          {alerts.state.data.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              canResolve={canControl(farms.state.status === 'ok' ? farms.state.data.find((f) => f.id === alert.plot.farm_id)?.role : undefined)}
              onResolved={alerts.refetch}
            />
          ))}
        </>
      )}

      <Status state={farms.state} retry={farms.reload} />
      {farms.state.status === 'ok' && farms.state.data.length === 0 && (
        <Card>
          <Text style={[styles.body, { marginBottom: 8 }]}>Chưa có trang trại nào. Thêm trang trại, rồi thêm lô (ruộng, ao…) và thiết bị đo.</Text>
        </Card>
      )}
      {farms.state.status === 'ok' &&
        farms.state.data.map((farm) => (
          <View key={farm.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <SectionTitle text={`${farm.name}${farm.province ? ` · ${farm.province}` : ''}`} />
              </View>
              <Text
                onPress={() => router.push({ pathname: '/iot/members', params: { farm: String(farm.id), name: farm.name } })}
                accessibilityRole="button"
                style={{ color: colors.primary, fontWeight: '700', padding: 8 }}
              >
                👥 {canManage(farm.role) ? 'Chia sẻ' : 'Người dùng chung'}
              </Text>
              {canManage(farm.role) && (
                <Text
                  onPress={() => router.push({ pathname: '/iot/farm-form', params: { id: String(farm.id) } })}
                  accessibilityRole="button"
                  style={{ color: colors.primary, fontWeight: '700', padding: 8 }}
                >
                  Sửa
                </Text>
              )}
            </View>
            {!canManage(farm.role) && (
              <Text style={[styles.muted, { marginBottom: 6, marginLeft: 4 }]}>
                👥 {farm.owner_name} chia sẻ cho bạn · {ROLE_LABELS[farm.role]}
              </Text>
            )}
            <WeatherCard farm={farm} />
            {farm.plots.map((plot) => (
              <Pressable key={plot.id} onPress={() => router.push({ pathname: '/iot/plot/[id]', params: { id: String(plot.id), name: plot.name } })} accessibilityRole="button">
                <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 28 }}>{plot.type === 'pond' ? '🦐' : plot.type === 'field' ? '🌾' : plot.type === 'greenhouse' ? '🏠' : '🌳'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text }}>{plot.name}</Text>
                    <Text style={styles.muted}>
                      {plot.type_label}
                      {plot.crop ? ` · ${plot.crop}` : ''}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 22, color: colors.primary }}>›</Text>
                </Card>
              </Pressable>
            ))}
            {canManage(farm.role) && (
              <Text
                onPress={() => router.push({ pathname: '/iot/plot-form', params: { farm: String(farm.id) } })}
                accessibilityRole="button"
                style={{ color: colors.primary, fontWeight: '700', fontSize: font.body, paddingVertical: 10, paddingHorizontal: 4, marginBottom: 8 }}
              >
                ＋ Thêm lô / ruộng / ao
              </Text>
            )}
          </View>
        ))}
      {farms.state.status === 'ok' && <Button label="＋ Thêm trang trại" onPress={() => router.push('/iot/farm-form')} variant={farms.state.data.length === 0 ? 'primary' : 'outline'} />}
      <View style={{ height: 12 }} />

      <Card>
        <Text style={[styles.body, { fontWeight: '700' }]}>Ruộng không có mạng?</Text>
        <Text style={[styles.muted, { marginBottom: 8 }]}>Ra tận nơi, lấy dữ liệu từ thiết bị bằng điện thoại, về nhà app tự gửi lên.</Text>
        <Button label="📥 Lấy dữ liệu từ thiết bị" onPress={() => router.push('/iot/collect')} variant="outline" />
      </Card>

      <PlanCard />
      <Text style={[styles.muted, { textAlign: 'center', marginTop: 8 }]}>Đăng nhập: {auth?.user.email}</Text>
      <Text onPress={() => void signOutIot()} accessibilityRole="button" style={{ color: colors.error, textAlign: 'center', padding: 12, fontSize: font.body }}>
        Đăng xuất tài khoản cảm biến
      </Text>
    </ScrollView>
  );
}

/** Gói đang dùng (dùng chung với tài khoản Nhà Nông đã nối) */
function PlanCard() {
  const me = useAsync(() => iotApi.me(), []);
  const [busy, setBusy] = useState(false);
  if (me.state.status !== 'ok') return null;
  const plan = me.state.data.plan;
  return (
    <Card>
      <Text style={[styles.body, { fontWeight: '700' }]}>⭐ {planLabel(plan)}</Text>
      <Text style={[styles.muted, { marginBottom: plan.linked ? 6 : 0 }]}>
        {plan.linked
          ? `Đã nối tài khoản Nhà Nông ${plan.phone ?? ''}: dùng chung gói trả phí.`
          : 'Đăng nhập tài khoản Nhà Nông (mục 👤 Tài khoản) trên máy này để dùng chung gói (xem lượng mưa 1 năm).'}
      </Text>
      {plan.linked && (
        <Text
          onPress={async () => {
            if (!(await confirmAsync('Bỏ nối tài khoản Nhà Nông?', 'Tài khoản cảm biến sẽ về gói miễn phí.', 'Bỏ nối'))) return;
            setBusy(true);
            await iotApi.unlinkNhanong().catch(() => {});
            setBusy(false);
            me.refetch();
          }}
          accessibilityRole="button"
          style={{ color: colors.error, opacity: busy ? 0.5 : 1 }}
        >
          Bỏ nối tài khoản
        </Text>
      )}
    </Card>
  );
}
