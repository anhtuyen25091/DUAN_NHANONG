import { ApiError } from '@nhanong/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput } from 'react-native';
import { DealsSignIn } from '../../components/deals';
import { ErrorNote, Field, inputStyle } from '../../components/fields';
import { Button, styles } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { colors } from '../../lib/theme';

/** Nhập mã 6 ký tự bên kia gửi (?code= để điền sẵn): mã đơn thì tham gia đơn, mã phiếu thì nhận phiếu (chỉ xem) */
export default function DealJoinScreen() {
  const auth = useAuth();
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState((params.code ?? '').toUpperCase());
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  if (!auth) return <DealsSignIn />;

  const submit = async () => {
    if (sending || code.replace(/[^A-Za-z0-9]/g, '').length < 6) return;
    setSending(true);
    setError(null);
    try {
      const deal = await api.joinDeal(auth.token, code.trim());
      router.replace({ pathname: '/deals/[id]', params: { id: deal.uuid } });
    } catch (err) {
      // Không phải mã đơn: thử mã phiếu (điểm thu mua gửi phiếu cho khách xem)
      if (err instanceof ApiError && err.errors.code?.[0]?.startsWith('Không tìm thấy')) {
        try {
          const received = await api.receivePurchase(auth.token, code.trim());
          router.replace({ pathname: '/trade/received/[id]', params: { id: received.id } });
          return;
        } catch {
          setError('Không tìm thấy đơn hoặc phiếu với mã này. Kiểm tra lại mã.');
          setSending(false);
          return;
        }
      }
      setError(err instanceof ApiError && err.errors.code ? err.errors.code[0] : (err as Error).message);
      setSending(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text style={[styles.muted, { marginBottom: 12 }]}>Nhập mã 6 ký tự bên kia gửi (ví dụ NN7K3P). Mã đơn: 2 bên cùng xem và xác nhận các đợt cân, tiền cọc, tiền trả. Mã phiếu: xem và tải phiếu mua / bán điểm thu mua gửi cho bạn.</Text>
      <Field label="Mã đơn / phiếu">
        <TextInput
          accessibilityLabel="Mã đơn hoặc mã phiếu"
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          maxLength={12}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect={false}
          placeholder="NN7K3P"
          placeholderTextColor={colors.muted}
          onSubmitEditing={submit}
          style={[inputStyle, { fontSize: 26, letterSpacing: 4, fontWeight: '700', textAlign: 'center' }]}
        />
      </Field>
      <ErrorNote message={error} />
      <Button label={sending ? 'Đang mở…' : 'Mở'} onPress={submit} disabled={code.replace(/[^A-Za-z0-9]/g, '').length < 6 || sending} />
    </ScrollView>
  );
}
