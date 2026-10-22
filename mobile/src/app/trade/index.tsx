import { formatDate, formatKg, formatVnd, itemsText, monthLabel, monthStart, purchaseTotals, today, TRADE_KIND_LABELS, type TradeKind } from '@nhanong/shared';
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
import { colors, font } from '../../lib/theme';
import { confirmAsync } from '../../lib/confirm';
import { flushOutbox, purchaseOutbox, useOutbox } from '../../lib/outbox';
import { useAsync } from '../../lib/useAsync';

type Tab = 'so' | 'tong-hop' | 'khach' | 'bao-cao';

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
      <View style={{ marginBottom: 12 }}>
        <Button label="🏢 Doanh nghiệp (chủ + các lái)" variant="outline" onPress={() => router.push('/business')} />
      </View>
      <View style={{ marginBottom: 12 }}>
        <Button label="🌾 Chợ lô hàng nông dân chào bán" variant="outline" onPress={() => router.push({ pathname: '/offers', params: { tab: 'market' } })} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Chip label="Giao dịch" active={tab === 'so'} onPress={() => setTab('so')} />
        <Chip label="Tổng hợp" active={tab === 'tong-hop'} onPress={() => setTab('tong-hop')} />
        <Chip label="Khách hàng" active={tab === 'khach'} onPress={() => setTab('khach')} />
        <Chip label="Báo cáo" active={tab === 'bao-cao'} onPress={() => setTab('bao-cao')} />
      </View>
      <PendingPurchases />
      {tab === 'so' && <TradeList token={auth.token} />}
      {tab === 'tong-hop' && <TradeSummaryView token={auth.token} />}
      {tab === 'khach' && <CustomerList token={auth.token} />}
      {tab === 'bao-cao' && <TradeReport token={auth.token} />}
    </ScrollView>
  );
}

/** Phiếu lập lúc mất sóng, đang chờ gửi (hoặc bị máy chủ từ chối: sửa lại / bỏ) */
function PendingPurchases() {
  const { sending } = useOutbox();
  const items = purchaseOutbox.mine();
  if (items.length === 0) return null;
  return (
    <Card style={{ borderColor: colors.primary, gap: 6 }}>
      <SmallTitle>{`📤 Phiếu chờ gửi (${items.length})`}</SmallTitle>
      <Text style={styles.muted}>Lập lúc mất sóng, đang lưu trên máy này. Có mạng lại sẽ tự gửi; số phiếu (PM-…) có sau khi gửi.</Text>
      {items.map((p) => {
        const totals = purchaseTotals(p.input.lines);
        return (
          <View key={p.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text style={[styles.body, { flex: 1, fontWeight: '700' }]}>
                {p.input.kind === 'sell' ? '📦' : '🛒'} {p.input.customer_name ?? 'Khách quen'} · {formatDate(p.input.date, true)}
              </Text>
              <Text style={[styles.body, { fontWeight: '700' }]}>{formatVnd(totals.amount)}</Text>
            </View>
            <Text style={styles.muted}>{itemsText(totals.lines.map((l) => ({ name: l.name, kg: l.net_kg })))}</Text>
            {p.error ? <Text style={{ color: colors.error }}>Chưa gửi được: {p.error}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {p.error ? <Chip label="Sửa" active={false} onPress={() => router.push({ pathname: '/trade/form', params: { kind: p.input.kind ?? 'buy', pending: p.id } })} /> : null}
              <Chip
                label="Bỏ phiếu"
                active={false}
                onPress={async () => {
                  if (await confirmAsync('Bỏ phiếu chờ gửi?', 'Phiếu chưa lên máy chủ sẽ mất.', 'Bỏ')) purchaseOutbox.remove(p.id);
                }}
              />
            </View>
          </View>
        );
      })}
      <Button label={sending ? 'Đang gửi…' : '🔄 Gửi ngay'} variant="outline" disabled={sending} onPress={() => void flushOutbox(true).catch(() => {})} />
    </Card>
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

/** Tổng hợp cho thương lái: lãi gộp theo tháng, còn nợ 2 chiều tính đến nay, lời từng lô */
function TradeSummaryView({ token }: { token: string }) {
  const range = useRange();
  const summary = useAsync(() => api.tradeSummary(token, { from: range.from, to: range.to }), [token, range.from, range.to]);
  const row = (label: string, value: string, color?: string) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 2 }}>
      <Text style={[styles.body, { flex: 1 }]}>{label}</Text>
      <Text style={[styles.body, { fontWeight: '700', color: color ?? colors.text }]}>{value}</Text>
    </View>
  );
  return (
    <View>
      <RangeFields range={range} />
      <Status state={summary.state} retry={summary.reload} />
      {summary.state.status === 'ok' && (
        <>
          <Card style={{ borderLeftWidth: 6, borderLeftColor: summary.state.data.margin < 0 ? colors.loss : colors.gain }}>
            <Text style={styles.muted}>Lãi gộp (tiền bán − tiền mua, chưa trừ chi phí riêng)</Text>
            <Text style={{ fontSize: font.title + 4, fontWeight: '800', color: summary.state.data.margin < 0 ? colors.loss : colors.gain, marginBottom: 6 }}>{formatVnd(summary.state.data.margin)}</Text>
            {row(`Bán ra (${formatKg(summary.state.data.totals.sell.kg)} kg)`, formatVnd(summary.state.data.totals.sell.amount), colors.gain)}
            {row(`Mua vào (${formatKg(summary.state.data.totals.buy.kg)} kg)`, `−${formatVnd(summary.state.data.totals.buy.amount)}`, colors.loss)}
            {summary.state.data.totals.buy.kg > summary.state.data.totals.sell.kg && <Text style={[styles.muted, { marginTop: 4 }]}>Hàng mua về chưa bán hết thì lãi gộp còn thấp / âm; bán ra rồi mới thấy lời.</Text>}
          </Card>
          <Card>
            <SmallTitle>Còn nợ (tính đến hôm nay)</SmallTitle>
            {row('Mình còn nợ người bán', formatVnd(summary.state.data.owing.i_owe), colors.loss)}
            {row('Người mua còn nợ mình', formatVnd(summary.state.data.owing.owed_to_me), colors.gain)}
          </Card>
          {summary.state.data.months.length > 0 && (
            <Card>
              <SmallTitle>Theo tháng</SmallTitle>
              {summary.state.data.months.map((m) => (
                <View key={m.month} style={{ paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Text style={[styles.body, { fontWeight: '700' }]}>{monthLabel(m.month)}</Text>
                  <Text style={styles.muted}>
                    Mua {formatVnd(m.buy)} · bán {formatVnd(m.sell)}
                  </Text>
                  <Text style={[styles.body, { color: m.margin < 0 ? colors.loss : colors.gain, fontWeight: '700' }]}>Lãi gộp {formatVnd(m.margin)}</Text>
                </View>
              ))}
            </Card>
          )}
          <SmallTitle>Lời từng lô</SmallTitle>
          <Text style={[styles.muted, { marginBottom: 6 }]}>Lô = đơn bán đã gộp các đơn mua của nông dân (gộp trong trang đơn bán, mục "Lời cả lô").</Text>
          {summary.state.data.lots.length === 0 && <Text style={styles.muted}>Chưa có lô nào.</Text>}
          {summary.state.data.lots.map((l) => (
            <RowCard
              key={l.uuid}
              title={`📦 ${l.title}`}
              sub={`Bán ${formatVnd(l.revenue)} · mua ${l.sources} đơn ${formatVnd(l.buy_cost)}${l.costs > 0 ? ` · chi phí ${formatVnd(l.costs)}` : ''}`}
              right={`${l.profit < 0 ? 'Lỗ' : 'Lời'} ${formatVnd(Math.abs(l.profit))}`}
              rightColor={l.profit < 0 ? colors.loss : colors.gain}
              onPress={() => router.push({ pathname: '/deals/[id]', params: { id: l.uuid } })}
            />
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
