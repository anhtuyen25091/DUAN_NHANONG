import { CATEGORY_TYPE_LABELS, compareToReference, formatDate, formatPercent, formatDistance, formatVnd, SHOP_TYPE_LABELS, telHref, type CategoryType, type LocalPriceProduct } from '@nhanong/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { api } from '../lib/api';
import { confirmAsync } from '../lib/confirm';
import { useMyLocation } from '../lib/myLocation';
import { colors, font } from '../lib/theme';
import { useAsync } from '../lib/useAsync';
import { Button, Card, Status, styles } from './ui';

/** Giá các điểm mua quanh khu vực của tôi (theo nhóm hàng, hoặc 1 mặt hàng) */
export function LocalPriceList({ type, product }: { type?: CategoryType; product?: string }) {
  const location = useMyLocation()!;
  const prices = useAsync(
    () => api.localPrices({ lat: location.lat, lng: location.lng, province: location.province, radius: location.radius, type, product }),
    [location.lat, location.lng, location.radius, location.province, type, product],
  );
  if (prices.state.status !== 'ok') return <Status state={prices.state} retry={prices.reload} />;
  if (prices.state.data.data.length === 0)
    return (
      <Card>
        <Text style={styles.body}>
          Chưa có điểm mua nào trong {location.radius} km đăng giá {type ? CATEGORY_TYPE_LABELS[type].toLowerCase() : 'mặt hàng này'} gần đây.
        </Text>
        <Text style={[styles.muted, { marginTop: 4 }]}>Thử tăng bán kính, hoặc xem giá chung ở tab Bảng giá.</Text>
      </Card>
    );
  return (
    <>
      {prices.state.data.data.map((p) => (
        <LocalPriceCard key={p.product.code} item={p} />
      ))}
    </>
  );
}

function LocalPriceCard({ item }: { item: LocalPriceProduct }) {
  const [showAll, setShowAll] = useState(false);
  const [flagged, setFlagged] = useState<Record<number, string>>({});
  const produce = item.product.type === 'nong_san';
  const compare = compareToReference(item.median, item.reference?.price, item.product.type);
  const entries = showAll ? item.entries : item.entries.slice(0, 3);

  const flag = async (id: number) => {
    if (!(await confirmAsync('Báo giá này sai?', 'Đủ nhiều người báo thì giá sẽ được kiểm tra lại.', 'Báo sai'))) return;
    const message = await api.flagLocalPrice(id).catch((e: Error) => e.message);
    setFlagged({ ...flagged, [id]: message });
  };

  return (
    <Card>
      <Pressable onPress={() => router.push({ pathname: '/product/[code]', params: { code: item.product.code } })} accessibilityRole="link">
        <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.primary }}>{item.product.name}</Text>
      </Pressable>
      <Text style={styles.muted}>
        {item.count} điểm {produce ? 'mua' : 'bán'} · cập nhật {formatDate(item.latest_date, true)}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginVertical: 6 }}>
        <View>
          <Text style={styles.muted}>Giá giữa</Text>
          <Text style={{ fontSize: 26, fontWeight: '800', color: colors.text }}>
            {formatVnd(item.median)}
            <Text style={styles.muted}>/{item.product.unit}</Text>
          </Text>
          {item.count > 1 && (
            <Text style={styles.muted}>
              {formatVnd(item.min)} – {formatVnd(item.max)}
            </Text>
          )}
        </View>
        {item.reference && (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.muted}>Giá chung {item.reference.region}</Text>
            <Text style={styles.body}>{formatVnd(item.reference.price)}</Text>
            {compare && compare.diff !== 0 && (
              <Text style={{ fontSize: font.small, color: compare.good ? colors.gain : colors.loss }}>
                Quanh đây {compare.diff > 0 ? 'cao' : 'thấp'} hơn {formatPercent(compare.percent)}% ({compare.diff > 0 ? '+' : '-'}
                {formatVnd(Math.abs(compare.diff))})
              </Text>
            )}
          </View>
        )}
      </View>
      <Text style={styles.muted}>{produce ? 'Điểm trả giá cao xếp trước' : 'Điểm bán rẻ xếp trước'}</Text>
      {entries.map((e) => (
        <View key={e.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 10, gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font.body, fontWeight: '700', color: colors.text }}>
                {e.buyer.name}
                {e.buyer.is_verified ? <Text style={{ color: colors.primary }}> ✓</Text> : null}
              </Text>
              <Text style={styles.muted}>
                {e.buyer.kind_label} · {formatDistance(e.distance_km)} · {formatDate(e.date, true)}
                {e.note ? ` · ${e.note}` : ''}
              </Text>
              {flagged[e.id] ? <Text style={styles.muted}>{flagged[e.id]}</Text> : null}
            </View>
            <Text style={{ fontSize: font.body + 1, fontWeight: '800', color: colors.text }}>{formatVnd(e.price)}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button label="📞 Gọi" onPress={() => Linking.openURL(telHref(e.buyer.phone))} />
            </View>
            {!flagged[e.id] && (
              <View style={{ flex: 1 }}>
                <Button label="Báo giá sai" variant="outline" onPress={() => flag(e.id)} />
              </View>
            )}
          </View>
        </View>
      ))}
      {item.entries.length > 3 && (
        <Pressable onPress={() => setShowAll(!showAll)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: colors.primary, fontSize: font.body }}>{showAll ? 'Thu gọn' : `Xem cả ${item.entries.length} điểm ›`}</Text>
        </Pressable>
      )}
    </Card>
  );
}

/** Điểm thu mua, bán phân, bán thuốc gần khu vực của tôi */
export function NearbyServices() {
  const location = useMyLocation()!;
  const shops = useAsync(() => api.shops({ lat: location.lat, lng: location.lng, radius: location.radius }), [location.lat, location.lng, location.radius]);
  return (
    <>
      <Text style={{ fontSize: font.title - 2, fontWeight: '700', color: colors.text, marginTop: 8, marginBottom: 6 }}>🏪 Dịch vụ quanh đây</Text>
      {shops.state.status !== 'ok' ? (
        <Status state={shops.state} retry={shops.reload} />
      ) : shops.state.data.data.length === 0 ? (
        <Card>
          <Text style={styles.body}>Chưa có điểm bán / thu mua nào trong {location.radius} km.</Text>
        </Card>
      ) : (
        shops.state.data.data.slice(0, 6).map((s) => (
          <Card key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font.body, fontWeight: '700', color: colors.text }}>
                {s.name}
                {s.is_verified ? <Text style={{ color: colors.primary }}> ✓</Text> : null}
              </Text>
              <Text style={styles.muted}>{s.types.map((t) => SHOP_TYPE_LABELS[t]).join(', ')}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              {s.distance_km !== undefined && <Text style={styles.muted}>{formatDistance(s.distance_km)}</Text>}
              {s.phone ? (
                <Text onPress={() => Linking.openURL(telHref(s.phone!))} accessibilityRole="button" style={{ color: colors.primary, fontSize: font.body }}>
                  📞 Gọi
                </Text>
              ) : null}
            </View>
          </Card>
        ))
      )}
      {shops.state.status === 'ok' && shops.state.data.meta.total > 6 && <Button label={`Xem cả ${shops.state.data.meta.total} điểm ›`} variant="outline" onPress={() => router.push('/shops')} />}
    </>
  );
}
