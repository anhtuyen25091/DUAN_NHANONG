import { formatDate, formatKg, formatVnd, itemsText, type TradeCustomer, type TradeRow, type TradeTotals } from '@nhanong/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../lib/api';
import { colors, font } from '../lib/theme';
import { ErrorNote, TextField } from './fields';
import { RowCard } from './ledger';
import { Button, Card, styles } from './ui';

/** Tổng mua vào / bán ra, còn nợ 2 chiều */
export function TradeTotalsCard({ totals }: { totals: TradeTotals }) {
  const line = (label: string, value: string, color?: string) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 2 }}>
      <Text style={styles.body}>{label}</Text>
      <Text style={[styles.body, { fontWeight: '700', color: color ?? colors.text }]}>{value}</Text>
    </View>
  );
  return (
    <Card>
      {line(`Mua vào (${formatKg(totals.buy.kg)} kg)`, formatVnd(totals.buy.amount))}
      {totals.buy.owing > 0 && line('Còn nợ khách', formatVnd(totals.buy.owing), colors.loss)}
      {line(`Bán ra (${formatKg(totals.sell.kg)} kg)`, formatVnd(totals.sell.amount))}
      {totals.sell.owing > 0 && line('Khách còn nợ mình', formatVnd(totals.sell.owing), colors.gain)}
      <Text style={[styles.muted, { marginTop: 4 }]}>{totals.count} giao dịch</Text>
    </Card>
  );
}

/** 1 giao dịch: phiếu → mở phiếu; đợt cân → mở đơn mua bán */
export function TradeRowCard({ row: r }: { row: TradeRow }) {
  const tag = r.owing > 0 ? `${r.kind === 'buy' ? 'Còn nợ khách' : 'Khách nợ'} ${formatVnd(r.owing)}` : r.pending ? 'Chờ bên kia xác nhận' : null;
  return (
    <RowCard
      title={`${r.kind === 'buy' ? '🛒' : '📦'} ${r.counterpart}`}
      sub={`${formatDate(r.date, true)} · ${r.code}\n${itemsText(r.items)}`}
      right={formatVnd(r.amount)}
      tag={tag}
      onPress={() =>
        r.source === 'deal' && r.deal ? router.push({ pathname: '/deals/[id]', params: { id: r.deal } }) : router.push({ pathname: '/trade/[id]', params: { id: r.id } })
      }
    />
  );
}

export function SmallTitle({ children }: { children: string }) {
  return <Text style={{ fontSize: font.body, fontWeight: '700', color: colors.text, marginTop: 8, marginBottom: 6 }}>{children}</Text>;
}

/** Thêm / sửa khách quen */
export function CustomerForm({ token, customer, onSaved }: { token: string; customer?: TradeCustomer; onSaved: (c: TradeCustomer) => void }) {
  const [name, setName] = useState(customer?.name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [address, setAddress] = useState(customer?.address ?? '');
  const [note, setNote] = useState(customer?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    try {
      onSaved(await api.saveCustomer(token, { name: name.trim(), phone: phone.trim() || null, address: address.trim() || null, note: note.trim() || null }, customer?.id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Card>
      <TextField label="Tên khách *" value={name} onChange={setName} maxLength={120} placeholder="Ví dụ: Chú Năm Lộc" />
      <TextField label="Số điện thoại" value={phone} onChange={setPhone} maxLength={20} keyboardType="phone-pad" />
      <TextField label="Địa chỉ" value={address} onChange={setAddress} maxLength={255} placeholder="Thôn, xã" />
      <TextField label="Ghi chú" value={note} onChange={setNote} maxLength={255} />
      <ErrorNote message={error} />
      <Button label="Lưu khách" onPress={save} disabled={!name.trim()} />
    </Card>
  );
}
