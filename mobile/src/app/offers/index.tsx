import { BID_STATUS_LABELS, formatDate, formatQuantity, formatVnd, OFFER_STATUS_LABELS, RADIUS_OPTIONS, type ProduceOffer } from '@nhanong/shared';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { DealsSignIn } from '../../components/deals';
import { RowCard } from '../../components/ledger';
import { LocationBar } from '../../components/LocationPicker';
import { Button, Card, Chip, Status, styles } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useMyLocation } from '../../lib/myLocation';
import { colors } from '../../lib/theme';
import { useAsync } from '../../lib/useAsync';

type Tab = 'mine' | 'market' | 'bids';

/**
 * Chào bán: nông dân đăng lô sắp thu hoạch, điểm mua / lái quanh đó trả giá, nông dân chọn 1 giá.
 * ?tab=market: mở thẳng chợ lô hàng (từ sổ giao dịch).
 */
export default function OffersScreen() {
  const auth = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'market' || params.tab === 'bids' ? params.tab : 'mine');
  if (!auth) return <DealsSignIn />;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Text style={[styles.muted, { marginBottom: 10 }]}>Nông dân đăng lô sắp thu hoạch, các điểm mua / lái quanh vườn trả giá, nông dân chọn 1 giá. Chọn xong 2 bên mới thấy số điện thoại của nhau.</Text>
      <View style={{ marginBottom: 12 }}>
        <Button label="＋ Chào bán lô hàng" onPress={() => router.push('/offers/form')} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        <Chip label="Lô của tôi" active={tab === 'mine'} onPress={() => setTab('mine')} />
        <Chip label="Chợ lô hàng" active={tab === 'market'} onPress={() => setTab('market')} />
        <Chip label="Tôi đã trả giá" active={tab === 'bids'} onPress={() => setTab('bids')} />
      </View>
      {tab === 'mine' && <OfferList load={() => api.myOffers(auth.token)} empty={'Bạn chưa chào bán lô nào. Bấm "＋ Chào bán lô hàng" khi sắp thu hoạch để các điểm mua trả giá.'} />}
      {tab === 'market' && <Market token={auth.token} />}
      {tab === 'bids' && <OfferList load={() => api.myOfferBids(auth.token)} empty="Bạn chưa trả giá lô nào." />}
    </ScrollView>
  );
}

export function OfferRow({ offer: o }: { offer: ProduceOffer }) {
  const place = o.place_label ?? o.province_name ?? '';
  const tag = o.my_bid ? `Giá của tôi ${formatVnd(o.my_bid.price)}: ${BID_STATUS_LABELS[o.my_bid.status]}` : o.status !== 'open' ? OFFER_STATUS_LABELS[o.status] : null;
  return (
    <RowCard
      title={`🌾 ${o.product_name} · ${formatQuantity(o.quantity_kg)}`}
      sub={`Thu hoạch ${formatDate(o.harvest_date, true)}${place ? ` · ${place}` : ''}${o.distance_km != null ? ` · cách ${o.distance_km} km` : ''}\n${
        o.bids_count > 0 ? `${o.bids_count} giá · cao nhất ${formatVnd(o.best_price ?? 0)}/kg` : 'Chưa có ai trả giá'
      }`}
      right={o.expected_price ? `${formatVnd(o.expected_price)}/kg` : ''}
      tag={tag}
      onPress={() => router.push({ pathname: '/offers/[id]', params: { id: o.id } })}
    />
  );
}

function OfferList({ load, empty }: { load: () => Promise<ProduceOffer[]>; empty: string }) {
  const offers = useAsync(load, []);
  const { refetch } = offers;
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );
  return (
    <View>
      <Status state={offers.state} retry={offers.reload} />
      {offers.state.status === 'ok' && offers.state.data.length === 0 && <Text style={styles.muted}>{empty}</Text>}
      {offers.state.status === 'ok' && offers.state.data.map((o) => <OfferRow key={o.id} offer={o} />)}
    </View>
  );
}

/** Điểm mua / lái: các lô đang nhận giá quanh "Khu vực của tôi" */
function Market({ token }: { token: string }) {
  const location = useMyLocation();
  const [radius, setRadius] = useState(location?.radius ?? 30);
  const market = useAsync(
    () => (location ? api.offerMarket(token, { lat: location.lat, lng: location.lng, radius }) : Promise.resolve(null)),
    [token, location?.lat, location?.lng, radius],
  );
  return (
    <View>
      <LocationBar title="Tìm lô hàng quanh" />
      {location && (
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
          {RADIUS_OPTIONS.map((r) => (
            <Chip key={r} label={`${r} km`} active={r === radius} onPress={() => setRadius(r)} />
          ))}
        </View>
      )}
      <Status state={market.state} retry={market.reload} />
      {market.state.status === 'ok' && market.state.data && (
        <>
          {!market.state.data.meta.can_bid && (
            <Card style={{ backgroundColor: colors.primarySoft }}>
              <Text style={styles.body}>Muốn trả giá: đăng ký hồ sơ điểm mua (chờ duyệt) ở mục Tài khoản, hoặc vào doanh nghiệp thu mua bằng mã mời của chủ.</Text>
              <View style={{ marginTop: 8 }}>
                <Button label="🏪 Đăng ký điểm mua" variant="outline" onPress={() => router.push('/buyer')} />
              </View>
            </Card>
          )}
          {market.state.data.data.length === 0 && <Text style={styles.muted}>Chưa có lô nào đang chào bán trong {radius} km.</Text>}
          {market.state.data.data.map((o) => (
            <OfferRow key={o.id} offer={o} />
          ))}
        </>
      )}
    </View>
  );
}
