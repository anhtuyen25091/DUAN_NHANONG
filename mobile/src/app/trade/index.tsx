import { formatDate, formatKg, formatVnd, monthStart, today, TRADE_KIND_LABELS, type TradeKind } from '@nhanong/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { DealsSignIn } from '../../components/deals';
import { DateField, TextField } from '../../components/fields';
import { RowCard } from '../../components/ledger';
import { PrintButtons } from '../../components/PrintButtons';
import { CustomerForm, SmallTitle, TradeRowCard, TradeTotalsCard } from '../../components/trade';
import { Button, Card, Chip, Status, styles } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { colors } from '../../lib/theme';
import { useAsync } from '../../lib/useAsync';

type Tab = 'so' | 'khach' | 'bao-cao';

/** Sổ giao dịch của điểm thu mua / thương lái: giao dịch, khách hàng, báo cáo */
export default function TradeScreen() {
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>('so');
  if (!auth) return <DealsSignIn />;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text style={[styles.muted, { marginBottom: 10 }]}>Phiếu mua / bán với khách (không cần khách có app) và các đợt cân của đơn mua bán. Gửi phiếu, bảng kê PDF / Word qua Zalo.</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <View style={{ flex: 1 }}>
          <Button label="＋ Phiếu mua" onPress={() => router.push({ pathname: '/trade/form', params: { kind: 'buy' } })} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="＋ Phiếu bán" variant="outline" onPress={() => router.push({ pathname: '/trade/form', params: { kind: 'sell' } })} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Chip label="Giao dịch" active={tab === 'so'} onPress={() => setTab('so')} />
        <Chip label="Khách hàng" active={tab === 'khach'} onPress={() => setTab('khach')} />
        <Chip label="Báo cáo" active={tab === 'bao-cao'} onPress={() => setTab('bao-cao')} />
      </View>
      {tab === 'so' && <TradeList token={auth.token} />}
      {tab === 'khach' && <CustomerList token={auth.token} />}
      {tab === 'bao-cao' && <TradeReport token={auth.token} />}
    </ScrollView>
  );
}

function useRange() {
  const [from, setFrom] = useState(monthStart(today()));
  const [to, setTo] = useState(today());
  return { from, to, setFrom, setTo };
}

/** Xếp dọc: ô chọn ngày kèm nút "Hôm nay / Hôm qua" quá rộng để đặt 2 ô cạnh nhau trên điện thoại */
function RangeFields({ range }: { range: ReturnType<typeof useRange> }) {
  return (
    <View>
      <DateField label="Từ ngày" value={range.from} onChange={range.setFrom} notFuture />
      <DateField label="Đến ngày" value={range.to} onChange={range.setTo} notFuture min={range.from} />
    </View>
  );
}

function TradeList({ token }: { token: string }) {
  const range = useRange();
  const [kind, setKind] = useState<TradeKind | ''>('');
  const [q, setQ] = useState('');
  const rows = useAsync(() => api.transactions(token, { from: range.from, to: range.to, kind: kind || undefined, q: q.trim() || undefined }), [token, range.from, range.to, kind, q]);
  const { refetch } = rows;
  // Quay lại từ phiếu vừa lập / sửa: tải lại ngầm
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  return (
    <View>
      <RangeFields range={range} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        {(['', 'buy', 'sell'] as const).map((k) => (
          <Chip key={k} label={k ? TRADE_KIND_LABELS[k] : 'Tất cả'} active={k === kind} onPress={() => setKind(k)} />
        ))}
      </View>
      <TextField label="Tìm" value={q} onChange={setQ} placeholder="Tên khách, số phiếu, mặt hàng" />
      <Status state={rows.state} retry={rows.reload} />
      {rows.state.status === 'ok' && (
        <>
          <TradeTotalsCard totals={rows.state.data.meta.totals} />
          {rows.state.data.data.length === 0 && <Text style={styles.muted}>Chưa có giao dịch trong khoảng ngày này.</Text>}
          {rows.state.data.data.map((r) => (
            <TradeRowCard key={r.id} row={r} />
          ))}
        </>
      )}
    </View>
  );
}

function CustomerList({ token }: { token: string }) {
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const customers = useAsync(() => api.customers(token, q.trim() || undefined), [token, q]);
  const { refetch } = customers;
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  return (
    <View>
      <TextField label="Tìm khách" value={q} onChange={setQ} placeholder="Tên hoặc SĐT" />
      <View style={{ marginBottom: 12 }}>
        <Button label={adding ? 'Thôi' : '＋ Thêm khách'} variant="outline" onPress={() => setAdding(!adding)} />
      </View>
      {adding && (
        <CustomerForm
          token={token}
          onSaved={(c) => {
            setAdding(false);
            router.push({ pathname: '/trade/customer/[id]', params: { id: c.id } });
          }}
        />
      )}
      <Status state={customers.state} retry={customers.reload} />
      {customers.state.status === 'ok' && customers.state.data.length === 0 && <Text style={styles.muted}>Chưa có khách. Lập phiếu đầu tiên, khách sẽ tự được lưu vào đây.</Text>}
      {customers.state.status === 'ok' &&
        customers.state.data.map((c) => (
          <RowCard
            key={c.id}
            title={`👤 ${c.name}`}
            sub={[c.phone, `${c.count} phiếu`, c.last_date ? `lần cuối ${formatDate(c.last_date, true)}` : null].filter(Boolean).join(' · ')}
            right={formatVnd(c.bought + c.sold)}
            tag={c.i_owe > 0 ? `Mình còn nợ ${formatVnd(c.i_owe)}` : c.owes_me > 0 ? `Khách nợ ${formatVnd(c.owes_me)}` : null}
            onPress={() => router.push({ pathname: '/trade/customer/[id]', params: { id: c.id } })}
          />
        ))}
    </View>
  );
}

function TradeReport({ token }: { token: string }) {
  const range = useRange();
  const rows = useAsync(() => api.transactions(token, { from: range.from, to: range.to }), [token, range.from, range.to]);
  const byProduct = (kind: TradeKind) => {
    const map = new Map<string, { kg: number; amount: number }>();
    if (rows.state.status === 'ok')
      for (const r of rows.state.data.data.filter((x) => x.kind === kind))
        for (const i of r.items) {
          const cur = map.get(i.name) ?? { kg: 0, amount: 0 };
          map.set(i.name, { kg: cur.kg + i.kg, amount: cur.amount + i.amount });
        }
    return [...map.entries()].sort((a, b) => b[1].amount - a[1].amount);
  };

  return (
    <View>
      <RangeFields range={range} />
      <Status state={rows.state} retry={rows.reload} />
      {rows.state.status === 'ok' && (
        <>
          <TradeTotalsCard totals={rows.state.data.meta.totals} />
          {(['buy', 'sell'] as const).map((kind) => {
            const list = byProduct(kind);
            return list.length === 0 ? null : (
              <Card key={kind}>
                <SmallTitle>{`${TRADE_KIND_LABELS[kind]} theo mặt hàng`}</SmallTitle>
                {list.map(([name, v]) => (
                  <View key={name} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.border }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.body}>{name}</Text>
                      <Text style={styles.muted}>
                        {formatKg(v.kg)} kg{v.kg > 0 ? ` · bình quân ${formatVnd(Math.round(v.amount / v.kg))}/kg` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.body, { fontWeight: '700' }]}>{formatVnd(v.amount)}</Text>
                  </View>
                ))}
              </Card>
            );
          })}
          <Card>
            <PrintButtons token={token} target={{ type: 'report', from: range.from, to: range.to }} label="Báo cáo đầy đủ: theo mặt hàng, theo khách, chi tiết từng giao dịch" />
          </Card>
        </>
      )}
    </View>
  );
}
