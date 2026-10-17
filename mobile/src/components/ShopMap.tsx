import { directionsUrl, geoNote, SHOP_TYPE_COLORS, SHOP_TYPE_LABELS, telHref, type ShopFilters } from '@nhanong/shared';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Linking, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { api } from '../lib/api';
import { mapHtml, type MapShop } from '../lib/shopMapHtml';
import { colors } from '../lib/theme';
import { useAsync } from '../lib/useAsync';
import { Status, styles } from './ui';

/**
 * Bản đồ điểm bán (cùng bộ lọc với danh sách): chấm màu theo loại, bấm chấm xem thông tin, gọi / chỉ đường / báo sai.
 * Dùng WebView + Leaflet (Expo Go có sẵn WebView, không cần khóa bản đồ).
 */
export function ShopMap({ filters, position }: { filters: ShopFilters; position: { lat: number; lng: number } | null }) {
  const result = useAsync(() => api.shops({ ...filters, map: 1 }), [filters.type, filters.province, filters.q, filters.lat, filters.lng]);
  const page = result.state.status === 'ok' ? result.state.data : null;

  const html = useMemo(() => {
    if (!page) return null;
    const shops: MapShop[] = page.data
      .filter((s) => s.lat !== null && s.lng !== null)
      .map((s) => ({
        id: s.id,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        phone: s.phone,
        address: s.address,
        province_name: s.province_name,
        goods: s.goods,
        note: geoNote(s.geo_precision),
        is_verified: s.is_verified,
        color: SHOP_TYPE_COLORS[s.types[0] ?? 'thu_mua'],
        types: s.types.map((t) => SHOP_TYPE_LABELS[t]).join(' · '),
      }));
    return mapHtml(shops, position, page.meta.radius_km ?? 30);
  }, [page, position]);

  const onMessage = (event: WebViewMessageEvent) => {
    const { action, id } = JSON.parse(event.nativeEvent.data) as { action: string; id: number };
    const shop = page?.data.find((s) => s.id === id);
    if (!shop) return;
    if (action === 'call' && shop.phone) void Linking.openURL(telHref(shop.phone));
    if (action === 'directions') void Linking.openURL(directionsUrl(shop));
    if (action === 'report') router.push({ pathname: '/shop/new', params: { shopId: String(shop.id), name: shop.name } });
  };

  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Status state={result.state} retry={result.reload} />
      {page && (
        <Text style={styles.muted}>
          {page.meta.total} điểm có vị trí{page.meta.has_more ? ' (đang hiện 500 điểm đầu, hãy chọn tỉnh hoặc loại)' : ''} · chụm 2 ngón để phóng to
        </Text>
      )}
      {html && (
        <View style={{ flex: 1, minHeight: 280, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
          <WebView originWhitelist={['*']} source={{ html }} onMessage={onMessage} style={{ flex: 1 }} setSupportMultipleWindows={false} />
        </View>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {(Object.keys(SHOP_TYPE_COLORS) as (keyof typeof SHOP_TYPE_COLORS)[]).map((t) => (
          <Text key={t} style={styles.muted}>
            <Text style={{ color: SHOP_TYPE_COLORS[t] }}>●</Text> {SHOP_TYPE_LABELS[t]}
          </Text>
        ))}
      </View>
    </View>
  );
}
