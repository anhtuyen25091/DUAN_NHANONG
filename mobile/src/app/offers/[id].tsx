import { ApiError, BID_STATUS_LABELS, formatDate, formatQuantity, formatVnd, kgInputText, OFFER_STATUS_LABELS, offerValue, parseKgText, telHref, type ProduceOffer } from '@nhanong/shared';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, ScrollView, Text, View } from 'react-native';
import { DealsSignIn } from '../../components/deals';
import { MoneyField, QtyField, TextField } from '../../components/fields';
import { SmallTitle } from '../../components/trade';
import { Button, Card, Status, styles } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { confirmAsync } from '../../lib/confirm';
import { colors, font } from '../../lib/theme';
import { showToast } from '../../lib/toast';
import { useAsync } from '../../lib/useAsync';

type Act = (action: () => Promise<ProduceOffer>, message: string) => Promise<void>;

const errorText = (err: unknown) => (err instanceof ApiError ? (Object.values(err.errors)[0]?.[0] ?? err.message) : (err as Error).message);

/** 1 lô hàng: nông dân xem các giá và chọn 1 giá; điểm mua / lái trả giá */
export default function OfferScreen() {
  const auth = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const loaded = useAsync(() => (auth ? api.offer(auth.token, id) : Promise.resolve(null)), [auth?.token, id]);
  const { refetch } = loaded;
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );
  if (!auth) return <DealsSignIn />;
  if (loaded.state.status !== 'ok' || !loaded.state.data) return <Status state={loaded.state} retry={loaded.reload} />;
  const data = loaded.state.data;
  return <OfferView key={`${data.id}|${data.status}|${data.bids_count}`} token={auth.token} initial={data} />;
}

function OfferView({ token, initial }: { token: string; initial: ProduceOffer }) {
  const [o, setO] = useState(initial);
  const act: Act = async (action, message) => {
    try {
      setO(await action());
      showToast({ message });
    } catch (err) {
      Alert.alert('Chưa làm được', errorText(err));
    }
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `🌾 ${o.product_name}` }} />
      <Text style={{ fontSize: font.title, fontWeight: '800', color: colors.text }}>
        {o.product_name} · {formatQuantity(o.quantity_kg)}
      </Text>
      <Text style={[styles.muted, { marginBottom: 8 }]}>
        Thu hoạch {formatDate(o.harvest_date)} · {o.place_label ?? o.province_name ?? ''}
        {o.distance_km != null ? ` · cách ${o.distance_km} km` : ''} · {OFFER_STATUS_LABELS[o.status]}
      </Text>
      <Card style={{ gap: 4 }}>
        <Text style={styles.body}>
          Nông dân: <Text style={{ fontWeight: '700' }}>{o.farmer.name}</Text>
        </Text>
        {o.farmer.phone && !o.is_mine ? (
          <Text style={{ color: colors.primary, fontWeight: '700' }} onPress={() => Linking.openURL(telHref(o.farmer.phone!))}>
            📞 {o.farmer.phone}
          </Text>
        ) : null}
        {o.expected_price ? <Text style={styles.body}>Giá mong muốn: {formatVnd(o.expected_price)}/kg</Text> : null}
        <Text style={styles.body}>
          {o.bids_count} người trả giá{o.best_price ? ` · cao nhất ${formatVnd(o.best_price)}/kg` : ''}
        </Text>
        {o.note ? <Text style={styles.muted}>Ghi chú: {o.note}</Text> : null}
      </Card>
      {o.is_mine ? <OwnerBids token={token} offer={o} act={act} /> : <BidBox token={token} offer={o} act={act} />}
    </ScrollView>
  );
}

/** Nông dân: các giá được trả (cao trước), chọn 1 giá; sửa / đóng / mở lại / gỡ lô */
function OwnerBids({ token, offer: o, act }: { token: string; offer: ProduceOffer; act: Act }) {
  const bids = o.bids ?? [];
  return (
    <View>
      <SmallTitle>Giá các điểm mua trả</SmallTitle>
      {bids.length === 0 && <Text style={styles.muted}>Chưa có ai trả giá. Các điểm mua trong 30 km đã nhận thông báo; khi có giá bạn sẽ được báo.</Text>}
      {bids.map((b) => (
        <Card key={b.id} style={{ gap: 4, borderLeftWidth: 6, borderLeftColor: b.status === 'accepted' ? colors.gain : b.status === 'pending' ? colors.primary : colors.border }}>
          <Text style={{ fontSize: font.title, fontWeight: '800', color: colors.text }}>{formatVnd(b.price)}/kg</Text>
          <Text style={styles.muted}>Cả lô ≈ {formatVnd(offerValue(o, b.price))}</Text>
          <Text style={styles.body}>
            {b.buyer?.name}
            {b.buyer?.verified ? ' ✓' : ''}
            {b.quantity_kg ? ` · lấy ${formatQuantity(b.quantity_kg)}` : ''}
          </Text>
          {b.note ? <Text style={styles.muted}>{b.note}</Text> : null}
          {b.status !== 'pending' && <Text style={{ fontWeight: '700', color: b.status === 'accepted' ? colors.gain : colors.muted }}>{BID_STATUS_LABELS[b.status]}</Text>}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {b.buyer?.phone ? (
              <View style={{ flex: 1 }}>
                <Button label={`📞 Gọi`} variant="outline" onPress={() => Linking.openURL(telHref(b.buyer!.phone!))} />
              </View>
            ) : null}
            {o.status === 'open' && b.status === 'pending' ? (
              <View style={{ flex: 1 }}>
                <Button
                  label="✅ Chọn giá này"
                  onPress={async () => {
                    if (!(await confirmAsync(`Chọn ${formatVnd(b.price)}/kg?`, `Của ${b.buyer?.name}. Các giá khác sẽ bị từ chối.`, 'Chọn'))) return;
                    void act(() => api.acceptBid(token, o.id, b.id), 'Đã chọn giá. Hãy gọi người mua để hẹn ngày cân.');
                  }}
                />
              </View>
            ) : null}
          </View>
        </Card>
      ))}
      <View style={{ gap: 8, marginTop: 8 }}>
        {o.status === 'open' && (
          <>
            <Button label="Sửa lô" variant="outline" onPress={() => router.push({ pathname: '/offers/form', params: { id: o.id } })} />
            <Button label="Đóng (ngừng nhận giá)" variant="outline" onPress={() => act(() => api.setOfferStatus(token, o.id, 'closed'), 'Đã đóng, điểm mua không trả giá được nữa')} />
          </>
        )}
        {o.status === 'closed' && <Button label="Mở lại" variant="outline" onPress={() => act(() => api.setOfferStatus(token, o.id, 'open'), 'Đã mở lại')} />}
        <Button
          label="Gỡ lô"
          variant="danger"
          onPress={async () => {
            if (!(await confirmAsync('Gỡ hẳn lô hàng này?', 'Người đã trả giá sẽ được báo.', 'Gỡ'))) return;
            await api.deleteOffer(token, o.id);
            showToast({ message: 'Đã gỡ lô hàng' });
            router.back();
          }}
        />
      </View>
    </View>
  );
}

/** Điểm mua / lái: trả giá (sửa được tới khi nông dân chọn), rút giá */
function BidBox({ token, offer: o, act }: { token: string; offer: ProduceOffer; act: Act }) {
  const mine = o.my_bid;
  const [price, setPrice] = useState(mine?.price ?? 0);
  const [kg, setKg] = useState(mine?.quantity_kg ? kgInputText(mine.quantity_kg) : '');
  const [note, setNote] = useState(mine?.note ?? '');

  if (mine?.status === 'accepted')
    return (
      <Card style={{ backgroundColor: colors.primarySoft }}>
        <Text style={styles.body}>✅ Nông dân đã chọn giá {formatVnd(mine.price)}/kg của bạn. Gọi nông dân để hẹn ngày cân.</Text>
      </Card>
    );
  if (o.status !== 'open') return <Text style={styles.muted}>{mine ? `Giá của bạn: ${formatVnd(mine.price)}/kg · ${BID_STATUS_LABELS[mine.status]}` : 'Lô này đã ngừng nhận giá.'}</Text>;

  const pending = mine?.status === 'pending';
  return (
    <Card>
      <SmallTitle>{pending ? `Giá của bạn: ${formatVnd(mine.price)}/kg` : 'Trả giá'}</SmallTitle>
      <Text style={[styles.muted, { marginBottom: 8 }]}>Nông dân chỉ thấy giá và tên của bạn. Khi nông dân chọn giá của bạn, 2 bên thấy số điện thoại của nhau.</Text>
      <MoneyField label="Giá trả (đ/kg) *" value={price} onChange={setPrice} />
      {price > 0 && <Text style={[styles.body, { marginTop: -6, marginBottom: 8 }]}>Cả lô ≈ {formatVnd(offerValue(o, price))}</Text>}
      <QtyField label="Lấy bao nhiêu (để trống: cả lô)" text={kg} onText={setKg} suffix="kg" />
      <TextField label="Ghi chú cho nông dân" value={note} onChange={setNote} maxLength={300} placeholder="Ví dụ: cân tại vườn, trả tiền mặt ngay" />
      <View style={{ gap: 8 }}>
        <Button
          label={pending ? 'Sửa giá' : 'Gửi giá'}
          disabled={price <= 0}
          onPress={() => act(() => api.bidOffer(token, o.id, { price, quantity_kg: parseKgText(kg) || null, note: note.trim() || null }), pending ? 'Đã sửa giá' : 'Đã gửi giá cho nông dân')}
        />
        {pending && <Button label="Rút giá" variant="danger" onPress={() => act(() => api.withdrawBid(token, o.id), 'Đã rút giá')} />}
      </View>
    </Card>
  );
}
