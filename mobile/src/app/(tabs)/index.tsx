import { CATEGORY_TYPE_LABELS, describeLocation, formatNumber, formatPriceRange, groupByProduct, matchesSearch, pinFollowed, relativeDay, summarizeProduct, type CategoryType, type PriceRow } from '@nhanong/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Card, Change, Chip, Status, styles } from '../../components/ui';
import { api } from '../../lib/api';
import { colors, font } from '../../lib/theme';
import { toggleFollow, useFollowed } from '../../lib/followed';
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
  const followed = useFollowed();
  const groups = pinFollowed(groupByProduct(rows), followed);
  const followedCount = groups.filter((g) => followed.includes(g.product.code)).length;
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
        style={{ minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, fontSize: font.body, backgroundColor: colors.surface, color: colors.text }}
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
      {prices.state.status === 'ok' && groups.length > 0 && followedCount === 0 && !search && (
        <Text style={{ fontSize: font.small + 1, color: colors.text, backgroundColor: colors.primarySoft, borderRadius: 12, padding: 12, overflow: 'hidden' }}>
          ⭐ Bấm ☆ ở mặt hàng bạn trồng để đưa lên đầu, lần sau mở là thấy ngay.
        </Text>
      )}
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
      renderItem={({ item: { product, rows }, index }) => (
        <View>
          {followedCount > 0 && index === 0 && <SectionTitle text="⭐ Mặt hàng bạn theo dõi" />}
          {followedCount > 0 && index === followedCount && <SectionTitle text="Các mặt hàng khác" />}
          <ProductCard
            product={product}
            rows={rows}
            followed={followed.includes(product.code)}
            expandAll={search.trim() !== '' || region !== ''}
            onOpen={(regionCode) => openProduct(product.code, regionCode)}
          />
        </View>
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

function SectionTitle({ text }: { text: string }) {
  return <Text style={{ fontSize: font.body, fontWeight: '700', color: colors.muted, marginTop: 6, marginBottom: 8 }}>{text}</Text>;
}

/**
 * 1 mặt hàng, thu gọn: khoảng giá các vùng + xu hướng chung + ngày; bấm "Xem giá N vùng" mới mở từng vùng.
 * Nút ☆ ghim mặt hàng mình trồng lên đầu.
 */
function ProductCard({ product, rows, followed, expandAll, onOpen }: { product: PriceRow['product']; rows: PriceRow[]; followed: boolean; expandAll: boolean; onOpen: (region?: string) => void }) {
  const [open, setOpen] = useState(false);
  const s = summarizeProduct(rows);
  const single = rows.length === 1;
  const expanded = !single && (expandAll || open);
  const unit = rows[0]?.unit ?? product.unit;
  const trend = [s.up && `${s.up} vùng tăng`, s.down && `${s.down} vùng giảm`, s.flat && `${s.flat} vùng giữ giá`].filter(Boolean).join(', ');

  return (
    <Card style={followed ? { borderLeftWidth: 5, borderLeftColor: colors.star } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Pressable onPress={() => toggleFollow(product.code)} accessibilityRole="button" accessibilityLabel={followed ? 'Bỏ theo dõi' : 'Theo dõi mặt hàng này'} hitSlop={8} style={{ minWidth: 40, minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ fontSize: 26, color: colors.star }}>{followed ? '★' : '☆'}</Text>
        </Pressable>
        <Pressable onPress={() => onOpen()} style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text }}>{product.name}</Text>
        </Pressable>
        <Pressable onPress={() => onOpen()} accessibilityLabel={`Biểu đồ giá ${product.name}`} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 22 }}>📈</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => onOpen()}>
        <Text style={{ color: colors.text }}>
          <Text style={{ fontSize: 28, fontWeight: '800' }}>{s.min === s.max ? formatNumber(s.max) : `${formatNumber(s.min)} – ${formatNumber(s.max)}`}</Text>
          <Text style={{ fontSize: font.body, color: colors.muted, fontWeight: '600' }}> đ/{unit}</Text>
        </Text>
      </Pressable>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 2 }}>
        <Change value={s.change} />
        <Text style={styles.muted}>
          {single && <Text style={{ fontWeight: '700', color: colors.text }}>{rows[0].region.name} · </Text>}
          {relativeDay(s.date)}
          {!single && s.change !== null && trend ? ` · ${trend}` : ''}
        </Text>
      </View>

      {!single && !expandAll && (
        <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" style={{ marginTop: 10, minHeight: 46, borderRadius: 12, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.primary, fontSize: font.body, fontWeight: '700' }}>{expanded ? 'Thu gọn ▴' : `Xem giá ${rows.length} vùng ▾`}</Text>
        </Pressable>
      )}

      {expanded &&
        rows.map((row) => (
          <Pressable
            key={row.region.code}
            onPress={() => onOpen(row.region.code)}
            style={{ flexDirection: 'row', alignItems: 'center', minHeight: 50, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 }}
          >
            <Text style={[styles.body, { flex: 1, fontWeight: '600' }]}>{row.region.name}</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: font.body, fontWeight: '700', color: colors.text }}>{formatPriceRange(row)}</Text>
              <Change value={row.change} />
            </View>
          </Pressable>
        ))}
      {(expanded || single) && <Text style={[styles.muted, { marginTop: 6 }]}>Nguồn: {s.sources.join(', ')}</Text>}
    </Card>
  );
}
