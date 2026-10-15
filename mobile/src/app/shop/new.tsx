import { ApiError, SHOP_TYPE_LABELS, type ShopType } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Button, Card, Chip, styles } from '../../components/ui';
import { api } from '../../lib/api';
import { colors, font } from '../../lib/theme';
import { useAsync } from '../../lib/useAsync';

const TYPES = Object.keys(SHOP_TYPE_LABELS) as ShopType[];

type Field = 'name' | 'phone' | 'address' | 'goods' | 'note';

/** Đề xuất điểm mới, hoặc báo sửa điểm đã có (params shopId, name) */
export default function NewShopScreen() {
  const params = useLocalSearchParams<{ shopId?: string; name?: string }>();
  const shopId = Number(params.shopId) || null;
  const [types, setTypes] = useState<ShopType[]>([]);
  const [province, setProvince] = useState('');
  const [form, setForm] = useState<Record<Field, string>>({ name: '', phone: '', address: '', goods: '', note: '' });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  const provinces = useAsync(() => api.provinces(), []);

  const toggle = (t: ShopType) => setTypes(types.includes(t) ? types.filter((x) => x !== t) : [...types, t]);

  const submit = async () => {
    setSending(true);
    setErrors({});
    try {
      const filled = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null]));
      const text = await api.submitShop({ ...filled, shop_id: shopId, province_code: province || null, types: types.length ? types : undefined });
      setMessage({ ok: true, text });
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.errors);
      setMessage({ ok: false, text: (error as Error).message });
    } finally {
      setSending(false);
    }
  };

  const title = shopId ? 'Báo sai thông tin' : 'Thêm điểm';

  if (message?.ok)
    return (
      <View style={{ padding: 16 }}>
        <Stack.Screen options={{ title }} />
        <Card>
          <Text style={styles.body}>{message.text}</Text>
        </Card>
        <Button label="Về danh sách" onPress={() => router.back()} />
      </View>
    );

  const input = (key: Field, label: string, props: TextInputProps = {}) => (
    <View style={{ gap: 4 }}>
      <Text style={styles.body}>{label}</Text>
      <TextInput
        value={form[key]}
        onChangeText={(value) => setForm({ ...form, [key]: value })}
        placeholderTextColor={colors.muted}
        style={{ minHeight: 48, borderWidth: 1, borderColor: errors[key] ? colors.error : colors.border, borderRadius: 10, paddingHorizontal: 12, fontSize: font.body, backgroundColor: colors.surface, color: colors.text }}
        {...props}
      />
      {errors[key] && <Text style={{ color: colors.error, fontSize: font.small }}>{errors[key][0]}</Text>}
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title }} />
      <Text style={styles.muted}>
        {shopId ? `${params.name ?? ''}: chỉ cần điền phần bị sai.` : 'Điểm mới sẽ hiện sau khi được kiểm tra.'} Không cần đăng nhập.
      </Text>

      <View style={{ gap: 6 }}>
        <Text style={styles.body}>Loại điểm{shopId ? '' : ' *'}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TYPES.map((t) => (
            <Chip key={t} label={SHOP_TYPE_LABELS[t]} active={types.includes(t)} onPress={() => toggle(t)} />
          ))}
        </View>
        {errors.types && <Text style={{ color: colors.error, fontSize: font.small }}>{errors.types[0]}</Text>}
      </View>

      {input('name', `Tên cửa hàng / đại lý${shopId ? '' : ' *'}`, { maxLength: 255 })}
      {input('phone', 'Số điện thoại', { keyboardType: 'phone-pad', maxLength: 50 })}
      {input('address', 'Địa chỉ', { placeholder: 'Số nhà, đường, xã', maxLength: 255 })}

      <View style={{ gap: 6 }}>
        <Text style={styles.body}>Tỉnh/thành</Text>
        {provinces.state.status === 'ok' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {provinces.state.data.map((p) => (
              <Chip key={p.code} label={p.name} active={p.code === province} onPress={() => setProvince(p.code === province ? '' : p.code)} />
            ))}
          </ScrollView>
        )}
      </View>

      {input('goods', 'Mặt hàng', { placeholder: 'Ví dụ: thu mua cà phê, tiêu; bán phân NPK', maxLength: 255 })}
      {input('note', 'Ghi chú cho người kiểm tra', { multiline: true, maxLength: 500, textAlignVertical: 'top' })}

      {message && !message.ok && <Text style={{ color: colors.error, fontSize: font.body }}>{message.text}</Text>}

      <Button label={sending ? 'Đang gửi…' : 'Gửi'} onPress={submit} disabled={sending || (!shopId && (types.length === 0 || !form.name.trim()))} />
    </ScrollView>
  );
}
