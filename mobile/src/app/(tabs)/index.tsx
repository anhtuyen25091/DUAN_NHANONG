import { CATEGORY_TYPE_LABELS, describeLocation, formatDate, formatPriceRange, groupByProduct, matchesSearch, type CategoryType } from '@nhanong/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Card, Change, Chip, Status, styles } from '../../components/ui';
import { api } from '../../lib/api';
import { colors, font } from '../../lib/theme';
import { useMyLocation } from '../../lib/myLocation';
import { useAsync } from '../../lib/useAsync';

const TYPES = Object.keys(CATEGORY_TYPE_LABELS) as CategoryType[];

export default function PriceBoardScreen() {
  const [type, setType] = useState<CategoryType>('nong_san');
  const [region, setRegion] = useState('');
  const [search, setSearch] = useState('');

  const regions = useAsync(() => api.regions(), []);
  const prices = useAsync(() => api.prices({ type, region }), [type, region]);

  const rows = prices.state.status === 'ok' ? prices.state.data.data.filter((row) => matchesSearch(row, search)) : [];
  const groups = groupByProduct(rows);
  const openProduct = (code: string, regionCode = region) =>
    router.push({ pathname: '/product/[code]', params: { code, region: regionCode } });

  const header = (
    <View style={{ gap: 10, marginBottom: 12 }}>
      <LocalBanner />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {TYPES.map((t) => (
          <Chip key={t} label={CATEGORY_TYPE_LABELS[t]} active={t === type} onPress={() => setType(t)} />
        ))}
      </View>
      <TextInput
        placeholder="Tìm mặt hàng, tỉnh…"
        placeholderTextColor={colors.muted}
        value={search}
        onChangeText={setSearch}
        style={{ minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, fontSize: font.body, backgroundColor: colors.surface, color: colors.text }}
      />
      {regions.state.status === 'ok' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="Mọi khu vực" active={region === ''} onPress={() => setRegion('')} />
          {regions.state.data.map((r) => (
            <Chip key={r.code} label={r.name} active={r.code === region} onPress={() => setRegion(r.code)} />
          ))}
        </ScrollView>
      )}
      <Status state={prices.state} retry={prices.reload} />
      {prices.state.status === 'ok' && groups.length === 0 && (
        <Card>
          <Text style={styles.muted}>
            {search
              ? 'Không tìm thấy mặt hàng phù hợp.'
              : type === 'thuoc_bvtv'
                ? 'Chưa có nguồn giá thuốc BVTV. Chúng tôi đang tìm nguồn đáng tin cậy.'
                : 'Chưa có giá trong 14 ngày gần đây.'}
          </Text>
        </Card>
      )}
    </View>
  );

  return (
    <FlatList
      data={groups}
      keyExtractor={(g) => g.product.code}
      contentContainerStyle={{ padding: 16 }}
      ListHeaderComponent={header}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={prices.refreshing} onRefresh={prices.reload} colors={[colors.primary]} />}
      renderItem={({ item: { product, rows } }) => (
        <Card>
          <Pressable onPress={() => openProduct(product.code)} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.primary, flex: 1 }}>{product.name}</Text>
            <Text style={{ fontSize: font.small, color: colors.primary }}>Biểu đồ ›</Text>
          </Pressable>
          <Text style={styles.muted}>Giá đ/{product.unit}</Text>
          {rows.map((row) => (
            <Pressable
              key={row.region.code}
              onPress={() => openProduct(product.code, row.region.code)}
              style={{ flexDirection: 'row', paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.body}>{row.region.name}</Text>
                <Text style={styles.muted}>
                  {formatDate(row.date)} · {row.sources.join(', ')}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: font.body, fontWeight: '700', color: colors.text }}>{formatPriceRange(row)}</Text>
                <Change value={row.change} />
              </View>
            </Pressable>
          ))}
        </Card>
      )}
    />
  );
}

/** Lối vào "Giá quanh tôi": giá các điểm mua quanh khu vực của tôi */
function LocalBanner() {
  const location = useMyLocation();
  return (
    <Pressable onPress={() => router.push('/local-prices')} accessibilityRole="button">
      <Card style={{ marginBottom: 0, borderLeftWidth: 6, borderLeftColor: colors.primary, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text }}>📍 Giá quanh tôi</Text>
          <Text style={styles.muted}>{location ? describeLocation(location) : 'Chọn khu vực để xem giá các điểm mua gần bạn'}</Text>
        </View>
        <Text style={{ fontSize: 22, color: colors.primary }}>›</Text>
      </Card>
    </Pressable>
  );
}
