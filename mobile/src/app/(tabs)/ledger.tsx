import { allocatedEntries, contractSummaries, debtStatus, debtSummary, filterEntries, formatVnd, interestPaid, supplyStock, today, totals, type Ledger, type LedgerSnapshot, type StorageMode } from '@nhanong/shared';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
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

  const range = rangeOf(period);
  // Vật tư lấy từ kho tính vào vườn đã dùng (tổng cả sổ không đổi)
  const inPeriod = filterEntries(allocatedEntries(data), range);
  const hasShared = filterEntries(data.transactions, range).some((t) => t.garden_id === null);
  const all = totals(inPeriod);

  const header = (
    <View>
      <SyncBadge />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {(Object.keys(PERIODS) as Period[]).map((p) => (
          <Chip key={p} label={PERIODS[p]} active={p === period} onPress={() => setPeriod(p)} />
        ))}
      </View>
      <ProfitCard label={`Tất cả các vườn · ${PERIODS[period].toLowerCase()}`} {...all} />
      {data.meta.advanced && <FinanceCard data={data} profit={all.profit} range={range} periodLabel={PERIODS[period].toLowerCase()} />}
      {data.meta.advanced && <AdvancedShortcuts data={data} />}

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

/**
 * Tình hình tài chính: lời/lỗ đã gồm phân thuốc mua thiếu và lãi vay;
 * kèm các khoản còn nợ / được nợ để biết sau khi thanh toán hết thì còn bao nhiêu.
 */
function FinanceCard({ data, profit, range, periodLabel }: { data: LedgerSnapshot; profit: number; range: { from?: string }; periodLabel: string }) {
  const debts = debtSummary(debtStatus(data, today()));
  const deposit = contractSummaries(data).reduce((s, c) => s + c.depositLeft, 0);
  const interest = interestPaid(data, range);
  const rows: Array<[string, number, 'in' | 'out']> = [
    ['🏦 Tiền vay còn phải trả (gốc)', debts.loan, 'out'],
    ['🔴 Còn nợ cửa hàng (phân, thuốc mua thiếu)', debts.payable, 'out'],
    ['🟢 Người ta còn nợ mình', debts.receivable, 'in'],
    ['🤝 Cọc lái chưa trừ (còn nợ hàng)', deposit, 'out'],
  ];
  if (rows.every(([, v]) => v === 0) && interest === 0) return null;
  return (
    <Card>
      <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text, marginBottom: 4 }}>Tình hình tài chính</Text>
      <Text style={[styles.muted, { marginBottom: 8 }]}>
        Lời/lỗ {periodLabel} ở trên đã tính cả phân thuốc mua thiếu{interest > 0 ? ` và ${formatVnd(interest)} lãi vay` : ' và lãi vay'}. Tiền gốc vay là tiền mượn nên không tính vào lời/lỗ.
      </Text>
      {rows
        .filter(([, v]) => v > 0)
        .map(([label, value, dir]) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Text style={[styles.body, { flex: 1 }]}>{label}</Text>
            <Text style={{ fontSize: font.body, fontWeight: '700', color: dir === 'in' ? colors.gain : colors.loss }}>{formatVnd(value)}</Text>
          </View>
        ))}
      <Pressable onPress={() => router.push('/ledger/debts')} accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: colors.primary, fontSize: font.body, fontWeight: '600' }}>Xem công nợ & tiền vay ›</Text>
      </Pressable>
      {profit !== 0 && <Text style={styles.muted}>Ghi chú: lời/lỗ là chênh lệch tiền vào – tiền ra; số tiền mặt thực có còn tùy các khoản nợ trên.</Text>}
    </Card>
  );
}

/** Chế độ Nâng cao: lối tắt vào Bán cho lái, Kho vật tư và Công nợ, kèm con số chính */
function AdvancedShortcuts({ data }: { data: LedgerSnapshot }) {
  const inStock = supplyStock(data).filter((s) => s.left > 1e-9);
  const debts = debtSummary(debtStatus(data, today()));
  const openContracts = contractSummaries(data).filter((c) => c.contract.status === 'open');
  return (
    <View>
      <Shortcut title="🤝 Bán cho lái" onPress={() => router.push('/ledger/contracts')}>
        <Text style={styles.muted}>
          {openContracts.length ? `${openContracts.length} lái đang cắt · cọc còn ${formatVnd(openContracts.reduce((s, c) => s + c.depositLeft, 0))}` : 'Lái đặt cọc, cắt nhiều đợt'}
        </Text>
      </Shortcut>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Shortcut half title="📦 Kho vật tư" onPress={() => router.push('/ledger/supplies')}>
          <Text style={styles.muted}>{inStock.length ? `${inStock.length} loại · còn ${formatVnd(inStock.reduce((s, x) => s + x.leftValue, 0))}` : 'Chưa có gì trong kho'}</Text>
        </Shortcut>
        <Shortcut half title="🧾 Công nợ" onPress={() => router.push('/ledger/debts')}>
          {debts.payable || debts.receivable || debts.loan ? (
            <>
              {debts.loan > 0 && <Text style={[styles.muted, { color: colors.loss }]}>Vay {formatVnd(debts.loan)}</Text>}
              {debts.payable > 0 && <Text style={[styles.muted, { color: colors.loss }]}>Nợ {formatVnd(debts.payable)}</Text>}
              {debts.receivable > 0 && <Text style={[styles.muted, { color: colors.gain }]}>Được nợ {formatVnd(debts.receivable)}</Text>}
            </>
          ) : (
            <Text style={styles.muted}>Không còn nợ</Text>
          )}
        </Shortcut>
      </View>
    </View>
  );
}

/** Thẻ lối tắt; half: nằm cạnh một thẻ khác trên cùng hàng */
function Shortcut({ title, onPress, children, half }: { title: string; onPress: () => void; children: ReactNode; half?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [half && { flex: 1 }, { opacity: pressed ? 0.8 : 1 }]}>
      <Card style={{ minHeight: 88 }}>
        <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text, marginBottom: 4 }}>{title}</Text>
        {children}
      </Card>
    </Pressable>
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
