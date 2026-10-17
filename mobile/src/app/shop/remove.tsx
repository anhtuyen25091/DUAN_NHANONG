import { ApiError, SHOP_REMOVE_REASONS, type ShopRemoveReason } from '@nhanong/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Button, Card, Chip, styles } from '../../components/ui';
import { api } from '../../lib/api';
import { colors, font } from '../../lib/theme';

const REASONS = Object.keys(SHOP_REMOVE_REASONS) as ShopRemoveReason[];

/** Chủ điểm xin gỡ điểm khỏi danh sách (params shopId, name): admin gọi lại số để kiểm tra rồi ẩn điểm */
export default function RemoveShopScreen() {
  const params = useLocalSearchParams<{ shopId?: string; name?: string }>();
  const shopId = Number(params.shopId) || null;
  const [reason, setReason] = useState<ShopRemoveReason>('owner');
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    setSending(true);
    setErrors({});
    try {
      await api.submitShop({ shop_id: shopId, remove: true, remove_reason: reason, contact: contact.trim(), note: note.trim() || null });
      setMessage({ ok: true, text: 'Đã gửi yêu cầu. Nhà Nông sẽ gọi lại số bạn để lại để kiểm tra, rồi ẩn điểm khỏi danh sách.' });
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.errors);
      setMessage({ ok: false, text: (error as Error).message });
    } finally {
      setSending(false);
    }
  };

  if (message?.ok)
    return (
      <View style={{ padding: 16, gap: 12 }}>
        <Card>
          <Text style={styles.body}>{message.text}</Text>
        </Card>
        <Button label="Về danh sách" onPress={() => router.back()} />
      </View>
    );

  const inputStyle = (key: string) => ({
    minHeight: 48,
    borderWidth: 1,
    borderColor: errors[key] ? colors.error : colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: font.body,
    backgroundColor: colors.surface,
    color: colors.text,
  });
  const error = (key: string) => errors[key] && <Text style={{ color: colors.error, fontSize: font.small }}>{errors[key][0]}</Text>;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Text style={[styles.body, { fontWeight: '700' }]}>{params.name}</Text>
      <Text style={styles.muted}>
        Thông tin điểm này lấy từ danh sách công khai (vd danh sách cơ sở được cấp phép của Sở NN&MT). Nếu bạn là chủ điểm và không muốn hiện ở đây, hoặc điểm đã
        đóng cửa, hãy gửi yêu cầu. Không cần đăng nhập.
      </Text>

      <View style={{ gap: 8 }}>
        <Text style={styles.body}>Lý do</Text>
        {REASONS.map((r) => (
          <Chip key={r} label={SHOP_REMOVE_REASONS[r]} active={reason === r} onPress={() => setReason(r)} />
        ))}
        {error('remove_reason')}
      </View>

      <View style={{ gap: 4 }}>
        <Text style={styles.body}>Số điện thoại để gọi lại kiểm tra *</Text>
        <TextInput value={contact} onChangeText={setContact} keyboardType="phone-pad" maxLength={50} style={inputStyle('contact')} />
        {error('contact')}
      </View>
      <View style={{ gap: 4 }}>
        <Text style={styles.body}>Ghi chú</Text>
        <TextInput value={note} onChangeText={setNote} multiline maxLength={500} style={[inputStyle('note'), { minHeight: 80, textAlignVertical: 'top', paddingTop: 10 }]} />
        {error('note')}
      </View>

      {message && !message.ok && <Text style={{ color: colors.error }}>{message.text}</Text>}
      <Button label={sending ? 'Đang gửi…' : 'Gửi yêu cầu gỡ'} disabled={sending || contact.trim() === '' || !shopId} onPress={submit} />
    </ScrollView>
  );
}
