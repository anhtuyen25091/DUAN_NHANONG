import { CUT_GRADES, cutValue, formatQty, formatVnd, today, type CutLine, type Deal, type DealEntryInput, type DealEntryKind } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { DealsSignIn, Notice } from '../../components/deals';
import { checkDate, DateField, ErrorNote, groupDigits, inputStyle, MoneyField, TextField } from '../../components/fields';
import { Button, Card, Chip, Status, styles } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { parseQty, qtyText } from '../../lib/qty';
import { colors, font } from '../../lib/theme';
import { showToast } from '../../lib/toast';
import { useAsync } from '../../lib/useAsync';

const TITLES: Record<DealEntryKind, string> = { deposit: '💰 Ghi tiền cọc', cut: '✂️ Ghi đợt cân', payment: '💵 Ghi lần trả tiền', cost: '🧾 Chi phí riêng' };
const KINDS: DealEntryKind[] = ['deposit', 'cut', 'payment', 'cost'];

/** Ghi 1 mục mới của đơn (?dealId=&kind=) hoặc sửa mục của mình (?dealId=&entryId=) */
export default function DealEntryScreen() {
  const auth = useAuth();
  if (!auth) return <DealsSignIn />;
  return <EntryLoader token={auth.token} />;
}

function EntryLoader({ token }: { token: string }) {
  const { dealId, kind, entryId } = useLocalSearchParams<{ dealId: string; kind?: string; entryId?: string }>();
  const { state, reload } = useAsync(() => api.deal(token, dealId), [token, dealId]);
  if (state.status !== 'ok') return <Status state={state} retry={reload} />;
  const entry = state.data.entries?.find((e) => e.uuid === entryId);
  const k = entry?.kind ?? (KINDS.includes(kind as DealEntryKind) ? (kind as DealEntryKind) : 'cut');
  return <EntryForm key={entry?.uuid ?? k} token={token} deal={state.data} kind={k} entryId={entry?.uuid} />;
}

type LineDraft = { grade: string; kg: string; price: number };

function EntryForm({ token, deal, kind, entryId }: { token: string; deal: Deal; kind: DealEntryKind; entryId?: string }) {
  const entry = deal.entries?.find((e) => e.uuid === entryId);
  // Dòng mặc định: loại + giá lấy theo đợt cân trước (giá thường gần nhau)
  const previous = [...(deal.entries ?? [])].filter((e) => e.kind === 'cut').sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const [date, setDate] = useState(entry?.date ?? today());
  const [amount, setAmount] = useState(entry?.amount ?? 0);
  const [note, setNote] = useState(entry?.note ?? '');
  const [lines, setLines] = useState<LineDraft[]>(
    entry?.lines?.map((l) => ({ grade: l.grade, kg: qtyText(l.kg), price: l.price })) ??
      previous?.lines?.map((l) => ({ grade: l.grade, kg: '', price: l.price })) ?? [{ grade: 'Loại A', kg: '', price: 0 }],
  );
  const [deduct, setDeduct] = useState(entry?.deposit_deduct ?? 0);
  // null: chưa chọn → mặc định trả đủ phần còn lại sau khi trừ cọc
  const [paid, setPaid] = useState<number | null>(entry ? entry.paid : null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const parsed: CutLine[] = lines.map((l) => ({ grade: l.grade.trim(), kg: parseQty(l.kg), price: l.price })).filter((l) => l.kg > 0);
  const value = cutValue(parsed);
  // Cọc có thể trừ = cọc còn (tính cả mục đang chờ), cộng lại số mục này đang trừ khi sửa
  const depositLeft = deal.summary.with_pending.deposit_left + (entry?.deposit_deduct ?? 0);
  const canDeduct = Math.min(depositLeft, value);
  const deductNow = Math.min(deduct, canDeduct);
  const due = value - deductNow;
  const paidNow = Math.min(paid ?? due, due);
  const setLine = (i: number, patch: Partial<LineDraft>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const unit = deal.unit;

  const submit = async () => {
    const dateError = checkDate(date, 'Ngày', { notFuture: true });
    if (dateError) return setError(dateError);
    setSending(true);
    setError(null);
    const input: DealEntryInput =
      kind === 'cut' ? { date, lines: parsed, deposit_deduct: deductNow, paid: paidNow, note: note.trim() || null } : { date, amount, note: note.trim() || null };
    try {
      if (entry) await api.updateDealEntry(token, entry.uuid, input);
      else await api.addDealEntry(token, deal.uuid, { ...input, kind });
      showToast({ message: kind === 'cost' ? 'Đã lưu chi phí (chỉ mình thấy)' : 'Đã lưu, chờ bên kia xác nhận' });
      router.back();
    } catch (err) {
      setError((err as Error).message);
      setSending(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: entry ? `Sửa: ${TITLES[kind].replace(/^\S+ /, '')}` : TITLES[kind] }} />
      <Text style={[styles.muted, { marginBottom: 8 }]}>Đơn: {deal.title}</Text>
      {entry?.status === 'confirmed' && <Notice text="Mục này bên kia đã xác nhận. Sửa xong sẽ cần bên kia xác nhận lại." />}
      {kind === 'cost' && <Text style={[styles.muted, { marginBottom: 12 }]}>Chi phí riêng (xe, công cắt, bốc vác…) chỉ mình thấy, dùng để tính lời cả lô. Bên kia không thấy.</Text>}
      <DateField label="Ngày" value={date} onChange={setDate} notFuture />

      {kind === 'cut' ? (
        <>
          <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text, marginBottom: 8 }}>Hàng cân đợt này</Text>
          {lines.map((l, i) => (
            <Card key={i} style={{ padding: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  accessibilityLabel="Loại hàng"
                  value={l.grade}
                  onChangeText={(grade) => setLine(i, { grade })}
                  maxLength={40}
                  placeholder="Loại hàng"
                  placeholderTextColor={colors.muted}
                  style={[inputStyle, { flex: 1, fontWeight: '700' }]}
                />
                {lines.length > 1 && (
                  <Pressable
                    onPress={() => setLines(lines.filter((_, j) => j !== i))}
                    accessibilityRole="button"
                    accessibilityLabel={`Bỏ dòng ${l.grade}`}
                    style={{ width: 48, height: 48, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ fontSize: 20, color: colors.muted }}>✕</Text>
                  </Pressable>
                )}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6, paddingVertical: 8 }}>
                {CUT_GRADES.map((g) => (
                  <Chip key={g} label={g} active={g === l.grade} onPress={() => setLine(i, { grade: g })} />
                ))}
              </ScrollView>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <TextInput
                    accessibilityLabel={`Số kg ${l.grade}`}
                    value={l.kg}
                    onChangeText={(t) => setLine(i, { kg: t.replace(/[^\d.,]/g, '') })}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.muted}
                    style={[inputStyle, { flex: 1, minWidth: 0 }]}
                  />
                  <Text style={styles.body}>{unit}</Text>
                </View>
                <View style={{ flex: 3, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <TextInput
                    accessibilityLabel={`Giá ${l.grade}`}
                    value={groupDigits(l.price)}
                    onChangeText={(t) => setLine(i, { price: Math.min(Number(t.replace(/\D/g, '')) || 0, 999_999_999) })}
                    keyboardType="number-pad"
                    placeholder="Giá"
                    placeholderTextColor={colors.muted}
                    style={[inputStyle, { flex: 1, minWidth: 0 }]}
                  />
                  <Text style={styles.body}>đ/{unit}</Text>
                </View>
              </View>
              <Text style={{ textAlign: 'right', marginTop: 6, fontSize: font.body, fontWeight: '700', color: colors.text }}>= {formatVnd(Math.round(parseQty(l.kg) * l.price))}</Text>
            </Card>
          ))}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {CUT_GRADES.filter((g) => !lines.some((l) => l.grade === g)).map((g) => (
              <Chip key={g} label={`＋ ${g}`} active={false} onPress={() => setLines([...lines, { grade: g, kg: '', price: 0 }])} />
            ))}
          </View>

          <Card style={{ borderLeftWidth: 6, borderLeftColor: colors.gain }}>
            <Text style={styles.muted}>
              Tiền hàng đợt này ({formatQty(parsed.reduce((s, l) => s + l.kg, 0))} {unit})
            </Text>
            <Text style={{ fontSize: 30, fontWeight: '800', color: colors.gain }}>{formatVnd(value)}</Text>
          </Card>

          {depositLeft > 0 && (
            <>
              <MoneyField label={`Trừ cọc (cọc còn ${formatVnd(depositLeft)})`} value={deduct} onChange={(v) => setDeduct(Math.min(v, depositLeft))} />
              {canDeduct > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -4, marginBottom: 12 }}>
                  <Chip label={`Trừ ${formatVnd(canDeduct)}`} active={deduct === canDeduct} onPress={() => setDeduct(canDeduct)} />
                  <Chip label="Không trừ" active={deduct === 0} onPress={() => setDeduct(0)} />
                </View>
              )}
              {deduct > canDeduct && <Text style={[styles.muted, { color: colors.loss, marginTop: -6, marginBottom: 10 }]}>Chỉ trừ được tối đa {formatVnd(canDeduct)} (bằng tiền hàng đợt này).</Text>}
            </>
          )}
          <MoneyField label="Tiền trả ngay lúc cân" value={paidNow} onChange={(v) => setPaid(Math.min(v, due))} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -4, marginBottom: 12 }}>
            <Chip label={`Trả đủ ${formatVnd(due)}`} active={paidNow === due && due > 0} onPress={() => setPaid(due)} />
            <Chip label="Chưa trả" active={paidNow === 0} onPress={() => setPaid(0)} />
          </View>
          {due - paidNow > 0 && <Text style={[styles.body, { color: colors.loss, fontWeight: '700', marginBottom: 12 }]}>Còn nợ lại đợt này: {formatVnd(due - paidNow)}</Text>}
        </>
      ) : (
        <MoneyField label="Số tiền" value={amount} onChange={setAmount} />
      )}

      <TextField label="Ghi chú" value={note} onChange={setNote} maxLength={255} placeholder={kind === 'cost' ? 'Ví dụ: tiền xe tải' : ''} accessibilityLabel="Ghi chú" />
      <ErrorNote message={error} />
      <Button
        label={sending ? 'Đang lưu…' : kind === 'cost' ? 'Lưu' : 'Lưu và gửi bên kia xác nhận'}
        onPress={() => void submit()}
        disabled={sending || (kind === 'cut' ? value <= 0 : amount <= 0)}
      />
    </ScrollView>
  );
}
