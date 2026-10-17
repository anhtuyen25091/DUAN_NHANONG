import { directionsUrl, geoNote, PROVINCE_CENTERS, spreadPoint, SHOP_TYPE_COLORS, SHOP_TYPE_LABELS, telHref, VIETNAM_CENTER, type Shop, type ShopFilters, type ShopMapView } from '@nhanong/shared';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { api } from '../lib/api';
import { mapHtml, type MapRender, type MapShop } from '../lib/shopMapHtml';
import { colors } from '../lib/theme';
import { styles } from './ui';

const toMapShop = (s: Shop): MapShop => {
  // Điểm vị trí gần đúng chồng lên nhau ở tâm xã: dàn nhẹ ra để bấm được từng điểm
  const [lat, lng] = spreadPoint(s.lat!, s.lng!, s.id, s.geo_precision);
  return {
    id: s.id,
    name: s.name,
    lat,
    lng,
    phone: s.phone,
    address: s.address,
    province_name: s.province_name,
    goods: s.goods,
    note: geoNote(s.geo_precision),
    source: s.source,
    is_verified: s.is_verified,
    color: SHOP_TYPE_COLORS[s.types[0] ?? 'thu_mua'],
    types: s.types.map((t) => SHOP_TYPE_LABELS[t]).join(' · '),
  };
};

/**
 * Bản đồ điểm bán (cùng bộ lọc với danh sách), chỉ tải phần đang xem: nhiều điểm thì máy chủ gom thành cụm ghi số
 * (bấm để phóng to), ít điểm thì hiện từng chấm màu theo loại; bấm chấm xem thông tin, gọi / chỉ đường / báo sai.
 * Dùng WebView + Leaflet (Expo Go có sẵn WebView, không cần khóa bản đồ).
 */
export function ShopMap({ filters, position }: { filters: ShopFilters; position: { lat: number; lng: number } | null }) {
  const web = useRef<WebView>(null);
  const shops = useRef(new Map<number, Shop>());
  const request = useRef(0);
  const [view, setView] = useState<ShopMapView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastView = useRef<{ bbox: string; zoom: number } | null>(null);

  // Khung xem ban đầu theo bộ lọc; đổi bộ lọc thì dựng lại bản đồ
  const html = useMemo(() => {
    const province = filters.province ? PROVINCE_CENTERS[filters.province] : undefined;
    if (position) return mapHtml({ center: [position.lat, position.lng], zoom: 11 });
    if (province) return mapHtml({ center: province, zoom: 9 });
    return mapHtml({ center: VIETNAM_CENTER, zoom: null });
  }, [filters.type, filters.province, filters.q, position?.lat, position?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = async (bbox: string, zoom: number) => {
    lastView.current = { bbox, zoom };
    const id = ++request.current;
    try {
      const data = await api.shopMap({ bbox, zoom, type: filters.type, province: filters.province, q: filters.q || undefined });
      if (id !== request.current) return;
      setError(null);
      setView(data);
      data.shops.forEach((s) => shops.current.set(s.id, s));
      const render: MapRender = {
        shops: data.shops.filter((s) => s.lat !== null && s.lng !== null).map(toMapShop),
        clusters: data.clusters,
        position,
        radiusKm: filters.radius ?? 30,
      };
      web.current?.injectJavaScript(`window.render(${JSON.stringify(render).replace(/</g, '\\u003c')});true;`);
    } catch (e) {
      if (id === request.current) setError((e as Error).message);
    }
  };

  const onMessage = (event: WebViewMessageEvent) => {
    const message = JSON.parse(event.nativeEvent.data) as { action: string; id?: number; bbox?: string; zoom?: number };
    if (message.action === 'view' && message.bbox) {
      void load(message.bbox, message.zoom ?? 5);
      return;
    }
    const shop = message.id !== undefined ? shops.current.get(message.id) : undefined;
    if (!shop) return;
    if (message.action === 'call' && shop.phone) void Linking.openURL(telHref(shop.phone));
    if (message.action === 'directions') void Linking.openURL(directionsUrl(shop));
    if (message.action === 'report') router.push({ pathname: '/shop/new', params: { shopId: String(shop.id), name: shop.name } });
    if (message.action === 'remove') router.push({ pathname: '/shop/remove', params: { shopId: String(shop.id), name: shop.name } });
  };

  return (
    <View style={{ flex: 1, gap: 6 }}>
      {error ? (
        <Pressable onPress={() => lastView.current && void load(lastView.current.bbox, lastView.current.zoom)}>
          <Text style={{ color: colors.error }}>{error} · Bấm để thử lại</Text>
        </Pressable>
      ) : (
        <Text style={styles.muted}>
          {view ? `${view.total.toLocaleString('vi-VN')} điểm trong khung đang xem${view.clusters.length ? ' · bấm vòng số để phóng to' : ''}` : 'Đang tải điểm bán…'} · chụm 2 ngón để phóng to
        </Text>
      )}
      <View style={{ flex: 1, minHeight: 280, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
        <WebView ref={web} key={html.length + (filters.province ?? '') + (filters.type ?? '') + (filters.q ?? '')} originWhitelist={['*']} source={{ html }} onMessage={onMessage} style={{ flex: 1 }} setSupportMultipleWindows={false} />
      </View>
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
