import { formatDate, formatVnd, groupByDate, SYNC_STATUS_LABELS, today, type Ledger, type LedgerSnapshot, type Totals, type Transaction } from '@nhanong/shared';
import { router, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { getSync, useSyncStatus } from '../lib/sync';
import { colors, font } from '../lib/theme';
import { hideToast, showToast, useToast } from '../lib/toast';
import { Card, styles } from './ui';

export function ProfitCard({ label, income, expense, profit }: Totals & { label: string }) {
  const color = profit >= 0 ? colors.gain : colors.loss;
  return (
    <Card style={{ borderLeftWidth: 6, borderLeftColor: color }}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={{ fontSize: 30, fontWeight: '800', color, marginVertical: 2 }}>
        {profit >= 0 ? 'Lời ' : 'Lỗ '}
        {formatVnd(Math.abs(profit))}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 18 }}>
        <Text style={styles.body}>
          Tiền vào <Text style={{ color: colors.gain, fontWeight: '700' }}>{formatVnd(income)}</Text>
        </Text>
        <Text style={styles.body}>
          Tiền ra <Text style={{ color: colors.loss, fontWeight: '700' }}>{formatVnd(expense)}</Text>
        </Text>
      </View>
    </Card>
  );
}

export type EntryItem = { kind: 'day'; date: string } | { kind: 'entry'; entry: Transaction };

/** Trải danh sách theo ngày thành mảng phẳng cho FlatList */
export function entryItems(entries: Transaction[]): EntryItem[] {
  return groupByDate(entries).flatMap(({ date, entries }) => [
    { kind: 'day' as const, date },
    ...entries.map((entry) => ({ kind: 'entry' as const, entry })),
  ]);
}

export function EntryItemRow({ item, ledger, data, showGarden }: { item: EntryItem; ledger: Ledger; data: LedgerSnapshot; showGarden?: boolean }) {
  if (item.kind === 'day') {
    return <Text style={{ fontSize: font.small, fontWeight: '600', color: colors.muted, marginTop: 12, marginBottom: 4 }}>{item.date === today() ? 'Hôm nay' : formatDate(item.date)}</Text>;
  }
  const t = item.entry;
  const cat = data.categories.find((c) => c.id === t.category_id);
  const garden = showGarden ? (t.garden_id ? data.gardens.find((g) => g.id === t.garden_id)?.name : 'Chi chung') : null;
  const sub = [garden, t.note].filter(Boolean).join(' · ');

  const remove = async () => {
    const undo = await ledger.removeEntry(t.id);
    showToast({ message: `Đã xóa ${formatVnd(t.amount)}`, undo });
  };

  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, marginBottom: 6 }}>
      <Pressable
        onPress={() => router.push({ pathname: '/ledger/add', params: { sua: t.id } })}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, minHeight: 60 }}
        accessibilityRole="button"
      >
        <Text style={{ fontSize: 26 }}>{cat?.icon ?? '📦'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.body}>{cat?.name ?? 'Khác'}</Text>
          {sub !== '' && (
            <Text style={styles.muted} numberOfLines={2}>
              {sub}
            </Text>
          )}
        </View>
        <Text style={{ fontSize: font.body, fontWeight: '700', color: t.type === 'income' ? colors.gain : colors.loss }}>
          {t.type === 'income' ? '+' : '-'}
          {formatVnd(t.amount)}
        </Text>
      </Pressable>
      <Pressable
        onPress={remove}
        accessibilityRole="button"
        accessibilityLabel="Xóa khoản này"
        style={{ width: 52, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: colors.border }}
      >
        <Text style={{ fontSize: 20 }}>🗑</Text>
      </Pressable>
    </View>
  );
}

/** Cột thu (xanh) / chi (đỏ) theo tháng */
export function MonthBars({ months }: { months: Array<Totals & { month: string }> }) {
  const W = 320;
  const H = 140;
  const max = Math.max(1, ...months.flatMap((m) => [m.income, m.expense]));
  const slot = W / months.length;
  const bar = Math.min(18, slot / 3);
  const y = (v: number) => H - 20 - (v / max) * (H - 30);
  return (
    <View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Line x1={0} x2={W} y1={H - 20} y2={H - 20} stroke={colors.border} />
        {months.map((m, i) => {
          const x = i * slot + slot / 2;
          return [
            <Rect key={`${m.month}i`} x={x - bar - 1} y={y(m.income)} width={bar} height={H - 20 - y(m.income)} rx={3} fill={colors.gain} />,
            <Rect key={`${m.month}e`} x={x + 1} y={y(m.expense)} width={bar} height={H - 20 - y(m.expense)} rx={3} fill={colors.loss} />,
            <SvgText key={`${m.month}t`} x={x} y={H - 5} fontSize={11} fill={colors.muted} textAnchor="middle">
              {`T${Number(m.month.slice(5))}`}
            </SvgText>,
          ];
        })}
      </Svg>
      <Text style={styles.muted}>
        <Text style={{ color: colors.gain }}>■</Text> Tiền vào <Text style={{ color: colors.loss }}>■</Text> Tiền ra
      </Text>
    </View>
  );
}

export function Fab({ label, href }: { label: string; href: Href }) {
  return (
    <Pressable
      onPress={() => router.push(href)}
      accessibilityRole="button"
      style={({ pressed }) => ({
        position: 'absolute',
        right: 16,
        bottom: 16,
        minHeight: 60,
        paddingHorizontal: 24,
        borderRadius: 30,
        backgroundColor: colors.primary,
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1,
        elevation: 4,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
      })}
    >
      <Text style={{ color: '#fff', fontSize: font.body + 2, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

/** Đặt 1 lần ở layout gốc */
export function ToastHost() {
  const toast = useToast();
  if (!toast) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 16, right: 16, bottom: 96, alignItems: 'center' }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.text, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 }}>
        <Text style={{ color: colors.bg, fontSize: font.body, flexShrink: 1 }}>{toast.message}</Text>
        {toast.undo && (
          <Pressable
            onPress={() => {
              toast.undo!();
              hideToast();
            }}
            accessibilityRole="button"
            style={{ borderWidth: 1, borderColor: colors.bg, borderRadius: 8, paddingHorizontal: 12, minHeight: 40, justifyContent: 'center' }}
          >
            <Text style={{ color: colors.bg, fontWeight: '700', fontSize: font.body }}>Hoàn tác</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** Dòng trạng thái ✅ / 🔄 / ⚠️ trên trang sổ; ẩn khi chỉ lưu trên máy */
export function SyncBadge() {
  const status = useSyncStatus();
  if (status === 'off') return null;
  const warn = status === 'offline' || status === 'expired';
  return (
    <View
      accessibilityRole="summary"
      style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4, padding: 10, borderRadius: 10, marginBottom: 12, backgroundColor: warn ? colors.lossSoft : colors.gainSoft }}
    >
      <Text style={[styles.body, { flexShrink: 1 }]}>{SYNC_STATUS_LABELS[status]}</Text>
      {status === 'offline' && (
        <Pressable onPress={() => void getSync().syncNow()} accessibilityRole="button" hitSlop={8}>
          <Text style={{ fontSize: font.body, fontWeight: '700', color: colors.primary }}>Thử lại</Text>
        </Pressable>
      )}
      {status === 'expired' && (
        <Pressable onPress={() => router.push('/ledger/sign-in')} accessibilityRole="button" hitSlop={8}>
          <Text style={{ fontSize: font.body, fontWeight: '700', color: colors.primary }}>Đăng nhập</Text>
        </Pressable>
      )}
    </View>
  );
}
