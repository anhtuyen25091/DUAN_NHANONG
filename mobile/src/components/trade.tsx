import { formatDate, formatDateTime, formatKg, formatVnd, itemsText, purchaseShareText, webJoinLink, type Purchase, type PurchaseHistoryItem, type PurchaseLine, type TradeCustomer, type TradeRow, type TradeTotals } from '@nhanong/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Share, Text, View } from 'react-native';
import { api } from '../lib/api';
import { colors, font } from '../lib/theme';
import { ErrorNote, TextField } from './fields';
import { RowCard } from './ledger';
import { showToast } from '../lib/toast';
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

/** 1 giao dịch: phiếu → mở phiếu; đợt cân → mở đơn mua bán (chủ doanh nghiệp mở đơn của lái ở chế độ chỉ xem) */
export function TradeRowCard({ row: r }: { row: TradeRow }) {
  const tag = r.over_limit
    ? '⚠️ Vượt giá chốt'
    : r.owing > 0
      ? `${r.kind === 'buy' ? 'Còn nợ khách' : 'Khách nợ'} ${formatVnd(r.owing)}`
      : r.pending
        ? 'Chờ bên kia xác nhận'
        : null;
  return (
    <RowCard
      title={`${r.kind === 'buy' ? '🛒' : '📦'} ${r.counterpart}`}
      sub={`${formatDate(r.date, true)} · ${r.code}${r.member ? ` · lái ${r.member.name}` : ''}\n${itemsText(r.items)}`}
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

/** Các dòng hàng của phiếu: cân − bì = tịnh × giá */
export function PurchaseLines({ lines }: { lines: PurchaseLine[] }) {
  return (
    <Card>
      {lines.map((l, i) => (
        <View key={i} style={{ paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text style={[styles.body, { flex: 1, fontWeight: '700' }]}>{l.name}</Text>
            <Text style={[styles.body, { fontWeight: '700' }]}>{formatVnd(l.amount)}</Text>
          </View>
          <Text style={styles.muted}>
            Cân {formatKg(l.kg)} kg{l.deduct_kg > 0 ? ` − bì ${formatKg(l.deduct_kg)} kg` : ''} = {formatKg(l.net_kg)} kg × {formatVnd(l.price)}
          </Text>
        </View>
      ))}
    </Card>
  );
}

/** Lịch sử phiếu: mỗi lần lưu là 1 bản (thời gian, đổi gì so với bản trước) */
export function PurchaseHistory({ history, sharedVersion }: { history: PurchaseHistoryItem[]; sharedVersion: number | null }) {
  const first = history[0]?.version;
  return (
    <Card>
      <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text, marginBottom: 6 }}>🕘 Lịch sử sửa phiếu</Text>
      {history.map((h) => (
        <View key={h.version} style={{ paddingVertical: 6, borderTopWidth: h.version === first ? 0 : 1, borderTopColor: colors.border }}>
          <Text style={styles.body}>
            <Text style={{ fontWeight: '700' }}>{h.version === first ? (sharedVersion === h.version ? 'Bản gửi khách' : 'Bản đầu') : `Sửa lần ${h.version - first}`}</Text>
            {h.version === sharedVersion && h.version !== first ? ' (bản gửi khách)' : ''}
            <Text style={styles.muted}> · {h.at ? formatDateTime(h.at) : ''}</Text>
          </Text>
          {h.changes.length > 0 ? (
            h.changes.map((c, i) => (
              <Text key={i} style={styles.body}>
                • {c}
              </Text>
            ))
          ) : (
            <Text style={styles.muted}>
              Tổng tiền {formatVnd(h.amount)}, đã trả {formatVnd(h.paid)}
            </Text>
          )}
        </View>
      ))}
    </Card>
  );
}

/** Chia sẻ phiếu cho khách xem: mã 6 ký tự (gửi Zalo), hoặc gửi thẳng khi SĐT khách trùng tài khoản */
export function PurchaseShare({ token, purchase: p, onChange }: { token: string; purchase: Purchase; onChange: (p: Purchase) => void }) {
  const [busy, setBusy] = useState(false);
  const act = async (action: () => Promise<Purchase>, message?: string) => {
    setBusy(true);
    try {
      onChange(await action());
      if (message) showToast({ message });
    } catch (err) {
      Alert.alert('Chưa làm được', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: 8 }}>
      <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text }}>🔗 Chia sẻ phiếu với khách</Text>
      <Text style={styles.muted}>Khách có app Nhà Nông xem được phiếu và tải PDF / Word (không sửa được). Sửa phiếu sau khi gửi: khách thấy cả bản cũ và bản mới.</Text>
      {p.account_match && (
        <View style={{ gap: 6, padding: 10, borderRadius: 10, backgroundColor: colors.primarySoft }}>
          <Text style={styles.body}>
            Số {p.account_match.phone} là tài khoản Nhà Nông của <Text style={{ fontWeight: '700' }}>{p.account_match.name}</Text>.
          </Text>
          <Button label="📲 Gửi vào app của khách" disabled={busy} onPress={() => act(async () => (await api.sendPurchase(token, p.id)).data, `Đã gửi phiếu vào app của ${p.account_match!.name}`)} />
        </View>
      )}
      {p.share_code ? (
        <>
          <Text selectable style={{ fontSize: 30, fontWeight: '800', letterSpacing: 4, textAlign: 'center', color: colors.text }}>
            {p.share_code}
          </Text>
          <Button label="📤 Gửi mã cho khách (Zalo, tin nhắn…)" onPress={() => Share.share({ message: purchaseShareText(p, p.share_code!, process.env.EXPO_PUBLIC_WEB_URL ? webJoinLink(process.env.EXPO_PUBLIC_WEB_URL, p.share_code!) : undefined) }).catch(() => {})} />
          <Button
            label="Thu hồi mã"
            variant="danger"
            disabled={busy}
            onPress={() =>
              Alert.alert('Thu hồi mã?', 'Người khác không nhập mã này được nữa. Khách đã nhận vẫn giữ phiếu.', [
                { text: 'Thôi', style: 'cancel' },
                { text: 'Thu hồi', style: 'destructive', onPress: () => void act(() => api.unsharePurchase(token, p.id), 'Đã thu hồi mã') },
              ])
            }
          />
        </>
      ) : (
        <Button label="🔑 Tạo mã gửi khách" variant="outline" disabled={busy} onPress={() => act(() => api.sharePurchase(token, p.id))} />
      )}
      {(p.shared_with ?? []).length > 0 && (
        <Text style={styles.muted}>Đang xem phiếu: {(p.shared_with ?? []).map((v) => `${v.name}${v.via === 'phone' ? ' (gửi vào app)' : ' (nhập mã)'}`).join(', ')}</Text>
      )}
    </Card>
  );
}
