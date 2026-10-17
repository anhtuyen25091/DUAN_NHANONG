import { ApiError, smsHref, type PasswordResetRequest } from '@nhanong/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Button, Card, styles } from '../components/ui';
import { api } from '../lib/api';
import { setAuth } from '../lib/auth';
import { deviceName } from '../lib/sync';
import { colors, font } from '../lib/theme';

const messageOf = (error: unknown) => (error instanceof ApiError ? (Object.values(error.errors)[0]?.[0] ?? error.message) : (error as Error).message);

/**
 * Quên mật khẩu: 1) nhập số → 2) nhắn "NN mã" từ chính số đó tới số của hệ thống (người dùng tự trả phí tin nhắn),
 * app tự chờ xác nhận → 3) đặt mật khẩu mới (đăng nhập luôn, các máy khác bị đăng xuất).
 */
export default function ForgotPasswordScreen() {
  const [phone, setPhone] = useState('');
  const [request, setRequest] = useState<PasswordResetRequest | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Chờ người dùng nhắn tin: hỏi 3 giây 1 lần
  useEffect(() => {
    if (!request || request.status !== 'pending') return;
    const timer = setInterval(async () => {
      try {
        const next = await api.forgotPasswordStatus(request.id);
        if (next.status !== 'pending') setRequest((r) => (r ? { ...r, status: next.status } : r));
      } catch {
        // Mất mạng: lần sau hỏi lại
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [request]);

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const input = { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, fontSize: font.body, backgroundColor: colors.surface, color: colors.text };

  if (done)
    return (
      <View style={{ padding: 16, gap: 12 }}>
        <Card>
          <Text style={[styles.body, { fontWeight: '700' }]}>Đã đặt mật khẩu mới ✅</Text>
          <Text style={styles.body}>Bạn đã đăng nhập. Các máy khác đang dùng tài khoản này đã bị đăng xuất, cần đăng nhập lại bằng mật khẩu mới.</Text>
        </Card>
        <Button label="Xong" onPress={() => router.back()} />
      </View>
    );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      {!request && (
        <>
          <Text style={styles.muted}>Để lấy lại mật khẩu, bạn sẽ nhắn 1 tin từ số điện thoại của tài khoản (phí tin nhắn theo nhà mạng của bạn).</Text>
          <Text style={styles.body}>Số điện thoại của tài khoản</Text>
          <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={20} placeholder="0912 345 678" placeholderTextColor={colors.muted} style={input} />
          {error && <Text style={{ color: colors.error }}>{error}</Text>}
          <Button label={busy ? 'Đang gửi…' : 'Tiếp tục'} disabled={busy || phone.trim() === ''} onPress={() => void run(async () => setRequest(await api.forgotPassword(phone.trim())))} />
        </>
      )}

      {request && (request.status === 'pending' || request.status === 'expired') && (
        <>
          <Text style={styles.body}>
            Từ số <Text style={{ fontWeight: '700' }}>{request.phone}</Text>, soạn tin:
          </Text>
          <Text
            selectable
            style={{ fontSize: 30, fontWeight: '700', letterSpacing: 2, textAlign: 'center', padding: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: 12, color: colors.text }}
          >
            {request.sms_text}
          </Text>
          <Text style={styles.body}>
            gửi tới <Text style={{ fontWeight: '700' }}>{request.sms_to}</Text>
          </Text>
          <Button label="✉️ Mở tin nhắn soạn sẵn" onPress={() => void Linking.openURL(smsHref(request.sms_to!, request.sms_text!, Platform.OS === 'ios'))} />
          {request.status === 'pending' ? (
            <Text style={styles.muted}>⏳ Đang chờ tin nhắn… (thường dưới 1 phút). Nhắn xong quay lại đây, app tự chuyển bước.</Text>
          ) : (
            <>
              <Text style={{ color: colors.error }}>Mã đã hết hạn.</Text>
              <Button label="Làm lại" variant="outline" onPress={() => setRequest(null)} />
            </>
          )}
        </>
      )}

      {request?.status === 'verified' && (
        <>
          <Card>
            <Text style={styles.body}>✅ Đã nhận tin nhắn từ số {request.phone}. Đặt mật khẩu mới:</Text>
          </Card>
          <TextInput value={password} onChangeText={setPassword} secureTextEntry maxLength={100} placeholder="Ít nhất 6 ký tự" placeholderTextColor={colors.muted} style={input} />
          {error && <Text style={{ color: colors.error }}>{error}</Text>}
          <Button
            label={busy ? 'Đang lưu…' : 'Lưu mật khẩu mới'}
            disabled={busy || password.length < 6}
            onPress={() =>
              void run(async () => {
                setAuth(await api.resetPassword({ id: request.id, password, device_name: deviceName() }));
                setDone(true);
              })
            }
          />
        </>
      )}
    </ScrollView>
  );
}
