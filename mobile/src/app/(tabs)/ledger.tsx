import { filterEntries, formatVnd, totals, type Ledger, type StorageMode } from '@nhanong/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { EntryItemRow, entryItems, Fab, ProfitCard, SyncBadge } from '../../components/ledger';
import { Button, Card, Chip, styles } from '../../components/ui';
import { useLedger } from '../../lib/ledger';
import { getSync, useSyncStatus } from '../../lib/sync';
import { colors, font } from '../../lib/theme';

type Period = 'month' | 'year' | 'all';
const PERIODS: Record<Period, string> = { month: 'Tháng này', year: 'Năm nay', all: 'Tất cả' };

function rangeOf(period: Period) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return period === 'month' ? { from: `${y}-${m}-01` } : period === 'year' ? { from: `${y}-01-01` } : {};
}

export default function LedgerScreen() {
  const state = useLedger();
  const [period, setPeriod] = useState<Period>('year');
  const syncStatus = useSyncStatus();

  if (!state.ledger) {
    return state.error ? (
      <Card style={{ margin: 16 }}>
        <Text style={[styles.body, { color: colors.error }]}>Không mở được sổ trên máy: {state.error.message}</Text>
      </Card>
    ) : (
      <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />
    );
  }

  const { ledger, data } = state;
  if (!data.meta.storage_mode) return <ChooseMode ledger={ledger} />;

  const inPeriod = filterEntries(data.transactions, rangeOf(period));
  const hasShared = inPeriod.some((t) => t.garden_id === null);

  const header = (
    <View>
      <SyncBadge />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {(Object.keys(PERIODS) as Period[]).map((p) => (
          <Chip key={p} label={PERIODS[p]} active={p === period} onPress={() => setPeriod(p)} />
        ))}
      </View>
      <ProfitCard label={`Tất cả các vườn · ${PERIODS[period].toLowerCase()}`} {...totals(inPeriod)} />

      <Text style={{ fontSize: font.title - 2, fontWeight: '700', color: colors.text, marginVertical: 8 }}>Vườn của tôi</Text>
      {data.gardens.length === 0 && (
        <Card>
          <Text style={[styles.body, { marginBottom: 10 }]}>Chưa có vườn nào. Thêm vườn để biết mỗi vườn lời hay lỗ.</Text>
          <View style={{ gap: 8 }}>
            <Button label="＋ Thêm vườn" onPress={() => router.push('/ledger/garden-form')} />
            <Button label="Dùng vườn mẫu để bấm thử" variant="outline" onPress={() => ledger.createSampleGarden()} />
          </View>
        </Card>
      )}
      {data.gardens.map((g) => (
        <GardenRow key={g.id} name={`🌳 ${g.name}`} sub={g.crop} profit={totals(filterEntries(inPeriod, { gardenId: g.id })).profit} onPress={() => router.push({ pathname: '/ledger/garden/[id]', params: { id: g.id } })} />
      ))}
      {hasShared && (
        <GardenRow name="📦 Chi chung" sub="Không thuộc vườn nào" profit={totals(filterEntries(inPeriod, { gardenId: null })).profit} onPress={() => router.push({ pathname: '/ledger/garden/[id]', params: { id: 'chung' } })} />
      )}
      {data.gardens.length > 0 && <Button label="＋ Thêm vườn" variant="outline" onPress={() => router.push('/ledger/garden-form')} />}

      <Text style={{ fontSize: font.title - 2, fontWeight: '700', color: colors.text, marginTop: 20 }}>Ghi gần đây</Text>
      {data.transactions.length === 0 && <Text style={[styles.muted, { marginTop: 6 }]}>Chưa ghi khoản nào. Bấm “＋ Ghi tiền” ở dưới để bắt đầu.</Text>}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={entryItems(data.transactions.slice(0, 15))}
        keyExtractor={(item) => (item.kind === 'day' ? `d${item.date}` : item.entry.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ListHeaderComponent={header}
        refreshControl={
          data.meta.storage_mode === 'sync' ? (
            <RefreshControl refreshing={syncStatus === 'syncing'} onRefresh={() => void getSync().syncNow()} colors={[colors.primary]} tintColor={colors.primary} />
          ) : undefined
        }
        renderItem={({ item }) => <EntryItemRow item={item} ledger={ledger} data={data} showGarden />}
      />
      <Fab label="＋ Ghi tiền" href="/ledger/add" />
    </View>
  );
}

function GardenRow({ name, sub, profit, onPress }: { name: string; sub?: string | null; profit: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text }}>{name}</Text>
          {sub ? <Text style={styles.muted}>{sub}</Text> : null}
        </View>
        <Text style={{ fontSize: font.body, fontWeight: '700', color: profit >= 0 ? colors.gain : colors.loss }}>
          {profit >= 0 ? 'Lời ' : 'Lỗ '}
          {formatVnd(Math.abs(profit))}
        </Text>
      </Card>
    </Pressable>
  );
}

/** Hỏi 1 lần khi mở sổ lần đầu */
function ChooseMode({ ledger }: { ledger: Ledger }) {
  const choose = (mode: StorageMode) => ledger.setMeta({ storage_mode: mode });
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: font.title, fontWeight: '700', color: colors.text }}>Sổ thu chi của bạn lưu ở đâu?</Text>
      <Text style={styles.muted}>Bạn có thể đổi lại sau trong phần Cài đặt.</Text>
      <ModeCard icon="📱" title="Chỉ lưu trên điện thoại này" text="Không ai khác xem được. Nhớ sao lưu ra file thỉnh thoảng, đổi máy thì nhập lại." onPress={() => choose('local')} />
      <ModeCard
        icon="☁️"
        title="Lưu cả trên mạng (đổi máy không mất)"
        text="Đăng nhập bằng số điện thoại. Sổ vẫn dùng được khi mất mạng, có mạng lại sẽ tự gửi lên."
        onPress={() => router.push('/ledger/sign-in')}
      />
    </View>
  );
}

function ModeCard({ icon, title, text, onPress }: { icon: string; title: string; text: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button" style={({ pressed }) => ({ opacity: !onPress ? 0.5 : pressed ? 0.7 : 1 })}>
      <Card style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start', minHeight: 96 }}>
        <Text style={{ fontSize: 36 }}>{icon}</Text>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text }}>{title}</Text>
          <Text style={styles.muted}>{text}</Text>
        </View>
      </Card>
    </Pressable>
  );
}
