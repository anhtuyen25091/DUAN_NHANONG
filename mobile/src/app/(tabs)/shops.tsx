import { directionsUrl, formatDistance, SHOP_TYPE_LABELS, telHref, type Shop, type ShopType } from '@nhanong/shared';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { ShopMap } from '../../components/ShopMap';
import { Button, Card, Chip, Status, styles } from '../../components/ui';
import { api } from '../../lib/api';
import { colors, font } from '../../lib/theme';
import { useAsync } from '../../lib/useAsync';

const TYPES = Object.keys(SHOP_TYPE_LABELS) as ShopType[];

type Position = { lat: number; lng: number };

export default function ShopsScreen() {
  const [type, setType] = useState<ShopType | ''>('');
  const [province, setProvince] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState<string | null>(null);
  const [more, setMore] = useState<{ shops: Shop[]; page: number; hasMore: boolean } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [onMap, setOnMap] = useState(false);
  // Xem bản đồ: ô tìm, chọn tỉnh gấp lại để bản đồ được rộng
  const [showFilters, setShowFilters] = useState(false);

  // Gõ xong 0,4 giây mới tìm
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const filters = { type: type || undefined, q, ...(position ?? { province }) };
  const provinces = useAsync(() => api.provinces(), []);
  const first = useAsync(() => {
    setMore(null);
    // Đang xem bản đồ thì bản đồ tự tải (lấy nhiều điểm 1 lần), danh sách không cần tải
    return onMap ? Promise.resolve(null) : api.shops(filters);
  }, [type, province, q, position?.lat, position?.lng, onMap]);

  const nearMe = async () => {
    if (position) return setPosition(null);
    setLocating('Đang lấy vị trí…');
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return setLocating('Chưa cho phép dùng vị trí. Bạn có thể chọn tỉnh ở dưới.');
      const p = (await Location.getLastKnownPositionAsync({ maxAge: 300000 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      setPosition({ lat: Math.round(p.coords.latitude * 1e4) / 1e4, lng: Math.round(p.coords.longitude * 1e4) / 1e4 });
      setLocating(null);
    } catch {
      setLocating('Không lấy được vị trí. Hãy bật GPS rồi thử lại, hoặc chọn tỉnh.');
    }
  };

  const loadMore = async () => {
    if (first.state.status !== 'ok' || !first.state.data || loadingMore) return;
    const hasMore = more ? more.hasMore : first.state.data.meta.has_more;
    if (!hasMore) return;
    const page = (more?.page ?? 1) + 1;
    setLoadingMore(true);
    try {
      const next = await api.shops({ ...filters, page });
      setMore({ shops: [...(more?.shops ?? []), ...next.data], page, hasMore: next.meta.has_more });
    } catch {
      // Lỗi mạng: kéo xuống lần nữa sẽ thử lại
    } finally {
      setLoadingMore(false);
    }
  };

  const page = first.state.status === 'ok' ? first.state.data : null;
  const meta = page?.meta ?? null;
  const shops = page ? [...page.data, ...(more?.shops ?? [])] : [];

  // flexGrow 0: hàng cuộn ngang không bị kéo giãn cao khi nằm trong khung flex (lỗi nút cao 1/3 màn hình)
  const provinceChips = (small = false) =>
    !position &&
    provinces.state.status === 'ok' && (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center' }} style={{ flexGrow: 0 }}>
        <Chip small={small} label="Mọi tỉnh" active={province === ''} onPress={() => setProvince('')} />
        {provinces.state.data
          .filter((p) => p.shops > 0 || p.code === province)
          .map((p) => (
            <Chip small={small} key={p.code} label={`${p.name} (${p.shops})`} active={p.code === province} onPress={() => setProvince(p.code)} />
          ))}
      </ScrollView>
    );

  const controls = (
    <>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="📋 Danh sách" active={!onMap} onPress={() => setOnMap(false)} />
        <Chip label="🗺 Bản đồ" active={onMap} onPress={() => setOnMap(true)} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label="Tất cả" active={type === ''} onPress={() => setType('')} />
        {TYPES.map((t) => (
          <Chip key={t} label={SHOP_TYPE_LABELS[t]} active={t === type} onPress={() => setType(t)} />
        ))}
      </ScrollView>
      <TextInput
        placeholder="Tìm tên, địa chỉ, mặt hàng…"
        placeholderTextColor={colors.muted}
        value={search}
        onChangeText={setSearch}
        style={{ minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, fontSize: font.body, backgroundColor: colors.surface, color: colors.text }}
      />
      <Button label={position ? '📍 Đang xem gần tôi (bấm để tắt)' : '📍 Tìm gần tôi'} variant={position ? 'primary' : 'outline'} onPress={nearMe} />
      {locating && <Text style={styles.muted}>{locating}</Text>}
      {provinceChips()}
    </>
  );

  if (onMap) {
    const filtered = q !== '' || province !== '';
    return (
      <View style={{ flex: 1, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, gap: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center' }} style={{ flexGrow: 0 }}>
          <Chip small label="📋 Danh sách" active={false} onPress={() => setOnMap(false)} />
          <Chip small label={position ? '📍 Gần tôi ✓' : '📍 Gần tôi'} active={!!position} onPress={nearMe} />
          <Chip small label={`🔎 Lọc${filtered ? ' ✓' : ''} ${showFilters ? '▴' : '▾'}`} active={showFilters} onPress={() => setShowFilters(!showFilters)} />
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center' }} style={{ flexGrow: 0 }}>
          <Chip small label="Tất cả" active={type === ''} onPress={() => setType('')} />
          {TYPES.map((t) => (
            <Chip small key={t} label={SHOP_TYPE_LABELS[t]} active={t === type} onPress={() => setType(t)} />
          ))}
        </ScrollView>
        {showFilters && (
          <>
            <TextInput
              placeholder="Tìm tên, địa chỉ, mặt hàng…"
              placeholderTextColor={colors.muted}
              value={search}
              onChangeText={setSearch}
              style={{ minHeight: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, fontSize: font.body, backgroundColor: colors.surface, color: colors.text }}
            />
            {provinceChips(true)}
          </>
        )}
        {locating && <Text style={styles.muted}>{locating}</Text>}
        <ShopMap filters={filters} position={position} />
      </View>
    );
  }

  const header = (
    <View style={{ gap: 10, marginBottom: 12 }}>
      {controls}
      <Status state={first.state} retry={first.reload} />
      {meta && (
        <Text style={styles.muted}>
          {meta.total} điểm{position && meta.radius_km ? ` trong vòng ${meta.radius_km} km` : ''}
        </Text>
      )}
      {meta && shops.length === 0 && (
        <Card>
          <Text style={styles.body}>Chưa có điểm nào phù hợp.</Text>
          <Text style={[styles.muted, { marginTop: 4 }]}>Bạn biết một đại lý hay điểm thu mua? Bấm “Thêm điểm” để mọi người cùng biết.</Text>
        </Card>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={shops}
        keyExtractor={(s) => String(s.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={first.refreshing} onRefresh={first.reload} colors={[colors.primary]} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loadingMore ? <Text style={[styles.muted, { textAlign: 'center' }]}>Đang tải…</Text> : null}
        renderItem={({ item }) => <ShopCard shop={item} />}
      />
      <Pressable
        onPress={() => router.push('/shop/new')}
        accessibilityRole="button"
        style={({ pressed }) => ({
          position: 'absolute',
          right: 16,
          bottom: 16,
          minHeight: 56,
          paddingHorizontal: 20,
          borderRadius: 28,
          backgroundColor: colors.primary,
          justifyContent: 'center',
          opacity: pressed ? 0.8 : 1,
          elevation: 3,
        })}
      >
        <Text style={{ color: '#fff', fontSize: font.body, fontWeight: '700' }}>＋ Thêm điểm</Text>
      </Pressable>
    </View>
  );
}

function ShopCard({ shop }: { shop: Shop }) {
  const place = [shop.address, shop.province_name].filter(Boolean).join(', ');
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ flex: 1, fontSize: font.body + 1, fontWeight: '700', color: colors.text }}>
          {shop.name}
          {shop.is_verified && <Text style={{ color: colors.primary, fontSize: font.small }}>{'  '}✓ Đã xác minh</Text>}
        </Text>
        {shop.distance_km !== undefined && <Text style={styles.muted}>{formatDistance(shop.distance_km)}</Text>}
      </View>
      <Text style={styles.muted}>{shop.types.map((t) => SHOP_TYPE_LABELS[t]).join(' · ')}</Text>
      {place !== '' && <Text style={[styles.body, { marginTop: 4 }]}>{place}</Text>}
      {shop.goods && <Text style={[styles.body, { marginTop: 2 }]}>Mặt hàng: {shop.goods}</Text>}
      {shop.opening_hours && <Text style={styles.muted}>Giờ mở cửa: {shop.opening_hours}</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {shop.phone && <Button label={`📞 ${shop.phone}`} onPress={() => Linking.openURL(telHref(shop.phone!))} />}
        <Button label="🧭 Chỉ đường" variant="outline" onPress={() => Linking.openURL(directionsUrl(shop))} />
        <Button label="Báo sai" variant="outline" onPress={() => router.push({ pathname: '/shop/new', params: { shopId: String(shop.id), name: shop.name } })} />
      </View>
      {shop.source && <Text style={[styles.muted, { marginTop: 6 }]}>Nguồn: {shop.source}</Text>}
    </Card>
  );
}
