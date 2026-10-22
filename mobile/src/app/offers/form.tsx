import { ApiError, describeLocation, kgInputText, parseKgText, today, type ProduceOffer } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { DealsSignIn } from '../../components/deals';
import { DateField, ErrorNote, MoneyField, QtyField, TextField } from '../../components/fields';
import { LocationBar } from '../../components/LocationPicker';
import { SmallTitle } from '../../components/trade';
import { Button, Chip, Status, styles } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useMyLocation } from '../../lib/myLocation';
import { colors } from '../../lib/theme';
import { showToast } from '../../lib/toast';
import { useAsync } from '../../lib/useAsync';

/** Đăng lô hàng mới, hoặc sửa lô (?id=uuid) */
export default function OfferFormScreen() {
  const auth = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useAsync(() => (auth && id ? api.offer(auth.token, id) : Promise.resolve(null)), [auth?.token, id]);
  if (!auth) return <DealsSignIn />;
  if (existing.state.status !== 'ok') return <Status state={existing.state} retry={existing.reload} />;
  return <OfferForm token={auth.token} offer={existing.state.data} />;
}

function OfferForm({ token, offer }: { token: string; offer: ProduceOffer | null }) {
  const location = useMyLocation();
  const categories = useAsync(() => api.categories(), []);
  const [productCode, setProductCode] = useState(offer?.product?.code ?? '');
  const [name, setName] = useState(offer?.product_name ?? '');
  const [kg, setKg] = useState(offer ? kgInputText(offer.quantity_kg) : '');
  const [expected, setExpected] = useState(offer?.expected_price ?? 0);
  const [harvest, setHarvest] = useState(offer?.harvest_date ?? today());
  const [note, setNote] = useState(offer?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const products = categories.state.status === 'ok' ? categories.state.data.filter((c) => c.type === 'nong_san').flatMap((c) => c.products) : [];
  // Sửa lô: giữ vị trí cũ; lô mới: lấy Khu vực của tôi
  const place = offer
    ? { lat: offer.lat, lng: offer.lng, province: offer.province, label: offer.place_label }
    : location
      ? { lat: location.lat, lng: location.lng, province: location.province, label: describeLocation(location) }
      : null;

  const save = async () => {
    if (!place) return setError('Hãy chọn vị trí vườn ở trên.');
    setSending(true);
    setError(null);
    try {
      const saved = await api.saveOffer(
        token,
        {
          product_code: productCode || null,
          product_name: name.trim(),
          quantity_kg: parseKgText(kg),
          expected_price: expected || null,
          harvest_date: harvest,
          province_code: place.province,
          lat: place.lat,
          lng: place.lng,
          place_label: place.label,
          note: note.trim() || null,
        },
        offer?.id,
      );
      showToast({ message: offer ? 'Đã lưu lô hàng' : 'Đã chào bán. Các điểm mua quanh vườn sẽ nhận thông báo.' });
      router.replace({ pathname: '/offers/[id]', params: { id: saved.id } });
    } catch (err) {
      setError(err instanceof ApiError ? (Object.values(err.errors)[0]?.[0] ?? err.message) : (err as Error).message);
      setSending(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: offer ? 'Sửa lô hàng' : '📣 Chào bán lô hàng' }} />
      {!offer && <LocationBar title="Vị trí vườn (để điểm mua gần đó thấy)" />}
      {!offer && location && !location.gps && <Text style={{ color: colors.loss, marginBottom: 8 }}>Đang dùng trung tâm tỉnh. Bấm "Đổi" và tìm xã / phường để điểm mua gần vườn thấy lô của bạn.</Text>}
      <SmallTitle>Mặt hàng</SmallTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {products.map((p) => (
          <Chip
            key={p.code}
            label={p.name}
            active={p.code === productCode}
            onPress={() => {
              setProductCode(p.code);
              setName(p.name);
            }}
          />
        ))}
      </View>
      <TextField
        label="Tên hàng *"
        value={name}
        onChange={(t) => {
          setName(t);
          setProductCode('');
        }}
        maxLength={120}
        placeholder="Ví dụ: Sầu riêng Ri6 loại 1"
      />
      <QtyField label="Số lượng ước tính (kg) *" text={kg} onText={setKg} suffix="kg" />
      <DateField label="Ngày thu hoạch dự kiến" value={harvest} onChange={setHarvest} min={today()} />
      <MoneyField label="Giá mong muốn (đ/kg, không bắt buộc)" value={expected} onChange={setExpected} />
      <TextField label="Ghi chú" value={note} onChange={setNote} maxLength={500} placeholder="Ví dụ: hàng loại 1, bán cả vườn, xe tải vào được" />
      <ErrorNote message={error} />
      <Text style={[styles.muted, { marginBottom: 8 }]}>Lô tự hết hạn 7 ngày sau ngày thu hoạch.</Text>
      <Button label={sending ? 'Đang lưu…' : offer ? 'Lưu' : 'Chào bán'} onPress={save} disabled={sending || !name.trim() || parseKgText(kg) <= 0 || !place} />
    </ScrollView>
  );
}
