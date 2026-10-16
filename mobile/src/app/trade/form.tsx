import { ApiError, foldVietnamese, formatKg, formatVnd, kgInputText, parseKgText, purchaseTotals, today, type Purchase, type PurchaseLineInput, type TradeKind } from '@nhanong/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { DealsSignIn } from '../../components/deals';
import { DateField, ErrorNote, Field, inputStyle, MoneyField, QtyField, TextField } from '../../components/fields';
import { showToast } from '../../lib/toast';
import { Button, Card, Chip, Status, styles } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { colors, font } from '../../lib/theme';
import { useAsync } from '../../lib/useAsync';

/** Lập phiếu mua / bán (?kind=buy|sell&customer=uuid), hoặc sửa phiếu (?id=uuid) */
export default function PurchaseFormScreen() {
  const auth = useAuth();
  const params = useLocalSearchParams<{ kind?: string; customer?: string; id?: string }>();
  const existing = useAsync(() => (auth && params.id ? api.purchase(auth.token, params.id) : Promise.resolve(null)), [auth?.token, params.id]);
  if (!auth) return <DealsSignIn />;
  if (existing.state.status !== 'ok') return <Status state={existing.state} retry={existing.reload} />;
  return <PurchaseForm token={auth.token} kind={params.kind === 'sell' ? 'sell' : 'buy'} customerId={params.customer ?? null} purchase={existing.state.data} />;
}

interface LineDraft {
  product_code: string;
  name: string;
  kg: string;
  deduct: string;
  price: number;
}

const emptyLine = (): LineDraft => ({ product_code: '', name: '', kg: '', deduct: '', price: 0 });

function PurchaseForm({ token, kind: initialKind, customerId, purchase }: { token: string; kind: TradeKind; customerId: string | null; purchase: Purchase | null }) {
  const [kind, setKind] = useState<TradeKind>(purchase?.kind ?? initialKind);
  const customers = useAsync(() => api.customers(token), [token]);
  const categories = useAsync(() => api.categories(), []);
  const [customer, setCustomer] = useState<string | null>(purchase?.customer ?? customerId);
  const [name, setName] = useState(purchase?.counterpart ?? '');
  const [phone, setPhone] = useState(purchase?.phone ?? '');
  const [date, setDate] = useState(purchase?.date ?? today());
  const [lines, setLines] = useState<LineDraft[]>(
    purchase?.lines.map((l) => ({ product_code: l.product_code ?? '', name: l.name, kg: kgInputText(l.kg), deduct: kgInputText(l.deduct_kg), price: l.price })) ?? [emptyLine()],
  );
  const [picking, setPicking] = useState<number | null>(null);
  const [paid, setPaid] = useState(purchase?.paid ?? 0);
  const [note, setNote] = useState(purchase?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const list = customers.state.status === 'ok' ? customers.state.data : [];
  const chosen = list.find((c) => c.id === customer) ?? null;
  const shownName = chosen?.name ?? name;
  // Gợi ý khách cũ khi gõ tên
  const suggestions = !chosen && name.trim().length >= 1 ? list.filter((c) => foldVietnamese(c.name).includes(foldVietnamese(name.trim()))).slice(0, 5) : [];
  const products = categories.state.status === 'ok' ? categories.state.data.flatMap((c) => c.products.map((p) => ({ ...p, group: c.name }))) : [];
  const inputs: PurchaseLineInput[] = lines.map((l) => ({ product_code: l.product_code || null, name: l.name.trim(), kg: parseKgText(l.kg), deduct_kg: parseKgText(l.deduct), price: l.price }));
  const totals = purchaseTotals(inputs);
  const setLine = (i: number, patch: Partial<LineDraft>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = async () => {
    if (inputs.some((l) => !l.name || l.kg <= 0)) return setError('Mỗi dòng hàng cần tên hàng và số kg cân.');
    setSending(true);
    setError(null);
    try {
      const saved = await api.savePurchase(
        token,
        {
          ...(purchase ? {} : { kind }),
          customer: chosen?.id ?? null,
          customer_name: chosen ? null : name.trim(),
          customer_phone: chosen ? null : phone.trim() || null,
          date,
          lines: inputs,
          paid,
          note: note.trim() || null,
        },
        purchase?.id,
      );
      showToast({ message: purchase ? 'Đã lưu phiếu' : `Đã lập phiếu ${saved.code}` });
      router.replace({ pathname: '/trade/[id]', params: { id: saved.id } });
    } catch (err) {
      setError(err instanceof ApiError ? (Object.values(err.errors)[0]?.[0] ?? err.message) : (err as Error).message);
      setSending(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      {!purchase && (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <Chip label="Mua vào" active={kind === 'buy'} onPress={() => setKind('buy')} />
          <Chip label="Bán ra" active={kind === 'sell'} onPress={() => setKind('sell')} />
        </View>
      )}
      <TextField
        label={kind === 'buy' ? 'Người bán (khách) *' : 'Người mua (khách) *'}
        value={shownName}
        onChange={(t) => {
          setCustomer(null);
          setName(t);
        }}
        maxLength={120}
        placeholder="Gõ tên, chọn khách cũ hoặc nhập khách mới"
      />
      {suggestions.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -6, marginBottom: 10 }}>
          {suggestions.map((c) => (
            <Chip
              key={c.id}
              label={`👤 ${c.name}${c.phone ? ` · ${c.phone}` : ''}`}
              active={false}
              onPress={() => {
                setCustomer(c.id);
                setPhone(c.phone ?? '');
              }}
            />
          ))}
        </View>
      )}
      {chosen ? (
        <Text style={[styles.muted, { marginTop: -6, marginBottom: 10 }]}>Khách quen{chosen.phone ? ` · ${chosen.phone}` : ''}</Text>
      ) : (
        <TextField label="Số điện thoại khách" value={phone} onChange={setPhone} maxLength={20} keyboardType="phone-pad" />
      )}
      <DateField label="Ngày" value={date} onChange={setDate} notFuture />

      <Text style={{ fontSize: font.body, fontWeight: '700', color: colors.text, marginVertical: 6 }}>Hàng</Text>
      {lines.map((l, i) => {
        const c = totals.lines[i];
        const matches = picking === i ? products : [];
        return (
          <Card key={i}>
            <Field label="Tên hàng trên phiếu *">
              <TextInput value={l.name} onChangeText={(t) => setLine(i, { name: t, product_code: '' })} maxLength={120} placeholder="Ví dụ: Cà phê nhân xô" placeholderTextColor={colors.muted} style={inputStyle} />
            </Field>
            <Pressable onPress={() => setPicking(picking === i ? null : i)} style={{ minHeight: 36, justifyContent: 'center', marginTop: -6, marginBottom: 6 }}>
              <Text style={{ color: colors.primary }}>{picking === i ? 'Đóng danh sách' : '📋 Chọn từ danh sách mặt hàng'}</Text>
            </Pressable>
            {matches.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {matches.map((p) => (
                  <Chip
                    key={p.code}
                    label={p.name}
                    active={p.code === l.product_code}
                    onPress={() => {
                      setLine(i, { product_code: p.code, name: p.name });
                      setPicking(null);
                    }}
                  />
                ))}
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <QtyField label="Cân (kg) *" text={l.kg} onText={(t) => setLine(i, { kg: t })} />
              </View>
              <View style={{ flex: 1 }}>
                <QtyField label="Trừ bì (kg)" text={l.deduct} onText={(t) => setLine(i, { deduct: t })} />
              </View>
            </View>
            <MoneyField label="Đơn giá (đ/kg tịnh) *" value={l.price} onChange={(v) => setLine(i, { price: v })} />
            <Text style={styles.body}>
              Tịnh <Text style={{ fontWeight: '700' }}>{formatKg(c.net_kg)} kg</Text> × {formatVnd(c.price)} = <Text style={{ fontWeight: '700' }}>{formatVnd(c.amount)}</Text>
            </Text>
            {lines.length > 1 && (
              <Pressable onPress={() => setLines(lines.filter((_, j) => j !== i))} style={{ minHeight: 40, justifyContent: 'center' }}>
                <Text style={{ color: colors.error }}>Bỏ dòng này</Text>
              </Pressable>
            )}
          </Card>
        );
      })}
      <View style={{ marginBottom: 12 }}>
        <Button label="＋ Thêm loại hàng" variant="outline" onPress={() => setLines([...lines, emptyLine()])} />
      </View>

      <Card style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={styles.body}>Tổng {formatKg(totals.kg)} kg tịnh</Text>
        <Text style={{ fontSize: font.title, fontWeight: '700', color: colors.text }}>{formatVnd(totals.amount)}</Text>
      </Card>
      <MoneyField label={kind === 'buy' ? 'Đã trả khách' : 'Khách đã trả'} value={paid} onChange={setPaid} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <Chip label="Trả đủ" active={paid === totals.amount && paid > 0} onPress={() => setPaid(totals.amount)} />
        <Chip label="Chưa trả" active={paid === 0} onPress={() => setPaid(0)} />
      </View>
      {paid < totals.amount && totals.amount > 0 && (
        <Text style={{ color: colors.loss, marginBottom: 8 }}>
          {kind === 'buy' ? 'Còn nợ khách' : 'Khách còn nợ'} {formatVnd(totals.amount - paid)}
        </Text>
      )}
      <TextField label="Ghi chú" value={note} onChange={setNote} maxLength={500} placeholder="Ví dụ: độ ẩm 14%, hàng loại 1" />
      <ErrorNote message={error} />
      <Button
        label={sending ? 'Đang lưu…' : purchase ? 'Lưu phiếu' : 'Lập phiếu'}
        onPress={submit}
        disabled={sending || !shownName.trim() || totals.amount <= 0 || paid > totals.amount}
      />
    </ScrollView>
  );
}
