import { allocatedEntries, CONTRACT_STATUS_LABELS, contractSummaries, filterEntries, formatDate, formatQty, formatVnd, monthlyTotals, seasonRange, seasonsOf, supplyUsedValue, today, totals } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { groupDigits } from '../../../components/fields';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { EntryItemRow, entryItems, Fab, ItemRow, MonthBars, ProfitCard, RowCard } from '../../../components/ledger';
import { Button, Card, Chip, styles } from '../../../components/ui';
import { useLedger } from '../../../lib/ledger';
import { colors, font } from '../../../lib/theme';
import { showToast } from '../../../lib/toast';

/**
 * Một vườn; id = "chung" là các khoản chi chung.
 * Chế độ Nâng cao: chọn xem theo vụ / năm / tất cả, thêm/sửa vụ, vật tư đã dùng.
 */
export default function GardenScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useLedger();
  // null = mặc định: vụ đang làm (nếu có), không thì năm nay
  const [picked, setPicked] = useState<string | null>(null);
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

      {advanced && garden ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {seasons.map((s) => (
              <Chip key={s.id} label={`${s.ended_on ? '' : '🌱 '}${s.name}`} active={s.id === view} onPress={() => setPicked(s.id)} />
            ))}
            <Chip label={`Năm ${year}`} active={view === 'nam'} onPress={() => setPicked('nam')} />
            <Chip label="Tất cả" active={view === 'tat-ca'} onPress={() => setPicked('tat-ca')} />
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
        data={entryItems(entries)}
        keyExtractor={(item) => (item.kind === 'day' ? `d${item.date}` : item.entry.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ListHeaderComponent={header}
        renderItem={({ item }) => <EntryItemRow item={item} ledger={ledger} data={data} />}
        ListFooterComponent={garden ? <View style={{ marginTop: 16 }}><Button label="Xóa vườn này" variant="outline" onPress={remove} /></View> : null}
      />
      <Fab label="＋ Ghi tiền" href={{ pathname: '/ledger/add', params: gardenId ? { vuon: gardenId } : {} }} />
    </View>
  );
}
