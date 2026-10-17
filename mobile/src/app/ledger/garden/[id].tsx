import { allocatedEntries, paginate, CONTRACT_STATUS_LABELS, contractSummaries, costPerUnit, filterEntries, formatDate, formatHarvest, formatQty, formatQtyGrouped, formatVnd, harvestTotals, monthlyTotals, seasonRange, seasonsOf, supplyUsedValue, today, totals, type LedgerSnapshot } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { groupDigits } from '../../../components/fields';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { EntryItemRow, entryItems, Fab, ItemRow, MonthBars, Pager, ProfitCard, RowCard, type EntryItem } from '../../../components/ledger';
import { Button, Card, Chip, styles } from '../../../components/ui';
import { FieldLines } from '../../../components/extraFields';
import { useLedger } from '../../../lib/ledger';
import { colors, font } from '../../../lib/theme';
import { showToast } from '../../../lib/toast';

/**
 * Một vườn; id = "chung" là các khoản chi chung.
 * Chế độ Nâng cao: chọn xem theo vụ / năm / tất cả, thêm/sửa vụ, vật tư đã dùng.
 */
const PER_PAGE = 20;

export default function GardenScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useLedger();
  // null = mặc định: vụ đang làm (nếu có), không thì năm nay
  const [picked, setPicked] = useState<string | null>(null);
  const [entryPageNo, setEntryPageNo] = useState(1);
  const list = useRef<FlatList<EntryItem>>(null);
  // Đổi vụ / năm đang xem thì về trang 1 của danh sách khoản
  const pick = (value: string | null) => {
    setPicked(value);
    setEntryPageNo(1);
  };
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;

  const { ledger, data } = state;
  const garden = data.gardens.find((g) => g.id === id);
  const gardenId = id === 'chung' ? null : id;

  if (gardenId && !garden) {
    return (
      <Card style={{ margin: 16 }}>
        <Stack.Screen options={{ title: 'Vườn' }} />
        <Text style={styles.body}>Không tìm thấy vườn này (có thể đã xóa).</Text>
      </Card>
    );
  }

  const advanced = !!data.meta.advanced;
  const year = today().slice(0, 4);
  const seasons = gardenId ? seasonsOf(data.seasons, gardenId) : [];
  const fallback = (advanced && seasons.find((s) => !s.ended_on)?.id) || 'nam';
  // Vụ đang chọn có thể vừa bị xóa: quay về mặc định
  const view = picked && (picked === 'nam' || picked === 'tat-ca' || seasons.some((s) => s.id === picked)) ? picked : fallback;
  const season = seasons.find((s) => s.id === view);
  const range: { from?: string; to?: string } = season ? seasonRange(season) : view === 'tat-ca' ? {} : { from: `${year}-01-01` };
  const label = season ? `${season.name} (${formatDate(season.started_on)} – ${season.ended_on ? formatDate(season.ended_on) : 'nay'})` : view === 'tat-ca' ? 'Từ trước tới nay' : `Năm ${year}`;

  // Lời/lỗ tính cả vật tư lấy từ kho; danh sách chỉ hiện khoản ghi thật
  const allocated = filterEntries(allocatedEntries(data), { gardenId });
  // Chế độ Cơ bản: danh sách hiện mọi khoản như trước; Nâng cao: theo vụ / năm đang chọn
  const listRange: { from?: string; to?: string } = advanced && garden ? range : {};
  const entries = filterEntries(data.transactions, { gardenId, ...listRange });
  const entryPage = paginate(entries, entryPageNo, PER_PAGE);
  const usages = data.supply_usages.filter(
    (u) => u.garden_id === gardenId && (!listRange.from || u.used_on >= listRange.from) && (!listRange.to || u.used_on <= listRange.to),
  );
  const supplies = new Map(data.supplies.map((s) => [s.id, s]));
  const fromStock = gardenId ? supplyUsedValue(data, gardenId, range) : 0;

  const remove = async () => {
    if (!garden) return;
    try {
      const undo = await ledger.removeGarden(garden.id);
      showToast({ message: `Đã xóa ${garden.name}. Các khoản chuyển sang chi chung.`, undo });
      router.back();
    } catch (err) {
      // Vườn còn hợp đồng bán cho lái: báo để xóa hợp đồng trước
      showToast({ message: (err as Error).message });
    }
  };
  const contracts = gardenId ? contractSummaries(data).filter((c) => c.contract.garden_id === gardenId) : [];

  const endSeason = async () => {
    if (!season) return;
    try {
      await ledger.updateSeason(season.id, { ended_on: today() });
      showToast({ message: `Đã kết thúc ${season.name}` });
    } catch (err) {
      showToast({ message: (err as Error).message });
    }
  };

  const header = (
    <View>
      {garden && (garden.crop || garden.area_m2) ? (
        <Text style={[styles.muted, { marginBottom: 8 }]}>
          {[garden.crop, garden.area_m2 ? `${groupDigits(Math.round(garden.area_m2))} m²` : null].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
      {garden && <FieldLines fields={data.custom_fields} target="garden" extra={garden.extra} />}

      {advanced && garden ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {seasons.map((s) => (
              <Chip key={s.id} label={`${s.ended_on ? '' : '🌱 '}${s.name}`} active={s.id === view} onPress={() => pick(s.id)} />
            ))}
            <Chip label={`Năm ${year}`} active={view === 'nam'} onPress={() => pick('nam')} />
            <Chip label="Tất cả" active={view === 'tat-ca'} onPress={() => pick('tat-ca')} />
          </View>
          <ProfitCard label={label} {...totals(filterEntries(allocated, range))} />
          {fromStock > 0 && <Text style={[styles.muted, { marginTop: -4, marginBottom: 10 }]}>Trong đó vật tư lấy từ kho: {formatVnd(fromStock)}</Text>}
          <View style={{ gap: 8, marginBottom: 12 }}>
            <Button label="＋ Thêm vụ" variant="outline" onPress={() => router.push({ pathname: '/ledger/season-form', params: { gardenId: garden.id } })} />
            {season && <Button label="Sửa vụ" variant="outline" onPress={() => router.push({ pathname: '/ledger/season-form', params: { gardenId: garden.id, id: season.id } })} />}
            {season && !season.ended_on && <Button label="Kết thúc vụ hôm nay" variant="outline" onPress={endSeason} />}
          </View>
          {seasons.length === 0 && (
            <Text style={[styles.muted, { marginBottom: 12 }]}>Chia theo vụ để biết mỗi vụ lời hay lỗ (ví dụ vụ cà phê từ tháng 5 năm nay đến tháng 4 năm sau).</Text>
          )}
        </>
      ) : (
        <>
          <ProfitCard label={`Năm ${year}`} {...totals(filterEntries(allocated, { from: `${year}-01-01` }))} />
          <ProfitCard label="Từ trước tới nay" {...totals(allocated)} />
        </>
      )}

      <Card>
        <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text, marginBottom: 6 }}>6 tháng gần đây</Text>
        <MonthBars months={monthlyTotals(allocated, 6, today())} />
      </Card>

      {advanced && garden && (
        <>
          <Text style={{ fontSize: font.title - 2, fontWeight: '700', color: colors.text, marginTop: 8, marginBottom: 6 }}>🤝 Bán cho lái</Text>
          {contracts.map(({ contract, cuts, delivered, depositLeft }) => (
            <RowCard
              key={contract.id}
              title={contract.buyer}
              sub={`${cuts.length} đợt · ${CONTRACT_STATUS_LABELS[contract.status]}${contract.status === 'open' && depositLeft > 0 ? ` · cọc còn ${formatVnd(depositLeft)}` : ''}`}
              right={formatVnd(delivered)}
              rightColor={colors.gain}
              onPress={() => router.push({ pathname: '/ledger/contracts/[id]', params: { id: contract.id } })}
            />
          ))}
          <View style={{ marginBottom: 12 }}>
            <Button label="＋ Nhận cọc của lái" variant="outline" onPress={() => router.push({ pathname: '/ledger/contracts/form', params: { gardenId: garden.id } })} />
          </View>
          <HarvestSection data={data} gardenId={garden.id} range={range} label={label} expense={totals(filterEntries(allocated, range)).expense} />
        </>
      )}

      {usages.length > 0 && (
        <>
          <Text style={{ fontSize: font.title - 2, fontWeight: '700', color: colors.text, marginTop: 8, marginBottom: 6 }}>Vật tư đã dùng</Text>
          {usages.map((u) => {
            const s = supplies.get(u.supply_id);
            return (
              <ItemRow
                key={u.id}
                icon="📦"
                title={s?.name ?? 'Vật tư'}
                sub={`${formatDate(u.used_on)} · ${formatQty(u.quantity)} ${s?.unit ?? ''}`}
                amount={`-${formatVnd(Math.round(u.quantity * (s?.unit_price ?? 0)))}`}
                amountColor={colors.loss}
                onPress={() => router.push({ pathname: '/ledger/supplies/[id]', params: { id: u.supply_id } })}
              />
            );
          })}
        </>
      )}

      <Text style={{ fontSize: font.title - 2, fontWeight: '700', color: colors.text, marginTop: 8 }}>Các khoản đã ghi</Text>
      {entries.length === 0 && <Text style={[styles.muted, { marginTop: 6 }]}>Chưa ghi khoản nào cho vườn này.</Text>}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: garden ? garden.name : 'Chi chung',
          headerRight: garden
            ? () => (
                <Text accessibilityRole="button" onPress={() => router.push({ pathname: '/ledger/garden-form', params: { id: garden.id } })} style={{ color: colors.primary, fontSize: font.body, padding: 8 }}>
                  Sửa
                </Text>
              )
            : undefined,
        }}
      />
      <FlatList
        ref={list}
        data={entryItems(entryPage.items)}
        keyExtractor={(item) => (item.kind === 'day' ? `d${item.date}` : item.entry.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ListHeaderComponent={header}
        renderItem={({ item }) => <EntryItemRow item={item} ledger={ledger} data={data} />}
        ListFooterComponent={
          <>
            <Pager
              page={entryPage.page}
              pages={entryPage.pages}
              onPage={(p) => {
                setEntryPageNo(p);
                // Về khoản đầu tiên của trang mới (ngay dưới phần tổng kết)
                setTimeout(() => list.current?.scrollToIndex({ index: 0, viewPosition: 0, animated: false }), 0);
              }}
            />
            {garden ? <View style={{ marginTop: 16 }}><Button label="Xóa vườn này" variant="outline" onPress={remove} /></View> : null}
          </>
        }
        onScrollToIndexFailed={() => list.current?.scrollToOffset({ offset: 0, animated: false })}
      />
      <Fab label="＋ Ghi tiền" href={{ pathname: '/ledger/add', params: gardenId ? { vuon: gardenId } : {} }} />
    </View>
  );
}

/** Sản lượng thu hoạch trong vụ / năm đang xem, kèm giá thành mỗi kg */
function HarvestSection({ data, gardenId, range, label, expense }: { data: LedgerSnapshot; gardenId: string; range: { from?: string; to?: string }; label: string; expense: number }) {
  const sum = harvestTotals(data, gardenId, range);
  const perKg = costPerUnit(expense, sum.kg);
  const list = data.harvests.filter((h) => h.garden_id === gardenId && (!range.from || h.date >= range.from) && (!range.to || h.date <= range.to));
  return (
    <>
      <Text style={{ fontSize: font.title - 2, fontWeight: '700', color: colors.text, marginTop: 8, marginBottom: 6 }}>🌾 Thu hoạch</Text>
      {sum.byUnit.length > 0 ? (
        <Card>
          <Text style={styles.muted}>Sản lượng · {label}</Text>
          <Text style={{ fontSize: 26, fontWeight: '800', color: colors.text, marginVertical: 2 }}>{sum.byUnit.map((u) => `${formatQtyGrouped(u.quantity)} ${u.unit}`).join(' · ')}</Text>
          {sum.cutKg > 0 && <Text style={styles.muted}>Gồm {formatQtyGrouped(sum.cutKg)} kg đã cắt bán cho lái (tự cộng, không cần ghi lại).</Text>}
          {perKg !== null && (
            <Text style={[styles.body, { marginTop: 4 }]}>
              Giá thành: <Text style={{ fontWeight: '800' }}>{formatVnd(perKg)}/kg</Text>
              <Text style={styles.muted}> (tiền chi {formatVnd(expense)} ÷ {formatQtyGrouped(sum.kg)} kg)</Text>
            </Text>
          )}
        </Card>
      ) : (
        <Text style={[styles.muted, { marginBottom: 8 }]}>Ghi sản lượng mỗi lần hái / cắt để biết mỗi kg tốn bao nhiêu tiền (giá thành), so với giá bán.</Text>
      )}
      {list.map((h) => (
        <ItemRow
          key={h.id}
          icon="🌾"
          title={formatHarvest(h)}
          sub={`${formatDate(h.date)}${h.note ? ` · ${h.note}` : ''}`}
          amount={h.price ? `+${formatVnd(Math.round(h.quantity * h.price))}` : 'chưa bán'}
          amountColor={h.price ? colors.gain : colors.muted}
          onPress={() => router.push({ pathname: '/ledger/harvest-form', params: { id: h.id } })}
        />
      ))}
      <View style={{ marginBottom: 12 }}>
        <Button label="＋ Ghi thu hoạch" variant="outline" onPress={() => router.push({ pathname: '/ledger/harvest-form', params: { gardenId } })} />
      </View>
    </>
  );
}
