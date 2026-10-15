import { contractSummaries, CUT_GRADES, cutKg, cutValue, formatQty, formatVnd, today, type CutLine, type Ledger, type LedgerSnapshot } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { checkDate, DateField, ErrorNote, Field, groupDigits, inputStyle, MoneyField, TextField } from '../../../components/fields';
import { Button, Card, Chip, styles } from '../../../components/ui';
import { useLedger } from '../../../lib/ledger';
import { parseQty, qtyText } from '../../../lib/qty';
import { colors, font } from '../../../lib/theme';
import { showToast } from '../../../lib/toast';

type LineDraft = { grade: string; kg: string; price: number };
const toDraft = (l: CutLine): LineDraft => ({ grade: l.grade, kg: qtyText(l.kg), price: l.price });

/** Ghi đợt cắt nhiều loại hàng (param contractId), hoặc sửa đợt (thêm param id) */
export default function CutFormScreen() {
  const state = useLedger();
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  return <CutForm ledger={state.ledger} data={state.data} />;
}

function CutForm({ ledger, data }: { ledger: Ledger; data: LedgerSnapshot }) {
  const { contractId, id } = useLocalSearchParams<{ contractId: string; id?: string }>();
  const summary = contractSummaries(data).find((s) => s.contract.id === contractId);
  const cut = data.harvest_cuts.find((c) => c.id === id);
  // Dòng mặc định: giá lấy theo đợt trước (giá thường gần nhau)
  const previous = summary?.cuts.filter((c) => c.id !== id).at(-1);
  const [lines, setLines] = useState<LineDraft[]>(
    cut ? cut.lines.map(toDraft) : previous ? previous.lines.map((l) => ({ ...toDraft(l), kg: '' })) : [{ grade: 'Loại A', kg: '', price: 0 }],
  );
  const [date, setDate] = useState(cut?.date ?? today());
  const [deduct, setDeduct] = useState(cut?.deposit_deduct ?? 0);
  const [note, setNote] = useState(cut?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!summary) {
    return (
      <Card style={{ margin: 16 }}>
        <Stack.Screen options={{ title: 'Đợt cắt' }} />
        <Text style={styles.body}>Không tìm thấy hợp đồng (có thể đã xóa).</Text>
      </Card>
    );
  }
  const parsed: CutLine[] = lines.map((l) => ({ grade: l.grade, kg: parseQty(l.kg), price: l.price }));
  const value = cutValue(parsed.filter((l) => l.kg > 0));
  // Cọc có thể trừ ở đợt này = cọc còn lại (cộng lại số đợt này đang trừ khi sửa)
  const depositLeft = summary.contract.deposit - summary.deducted + (cut?.deposit_deduct ?? 0);
  const canDeduct = Math.min(depositLeft, value);
  const setLine = (i: number, patch: Partial<LineDraft>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const save = async () => {
    const dateError = checkDate(date, 'Ngày cắt', { notFuture: true });
    if (dateError) return setError(dateError);
    setError(null);
    setSaving(true);
    try {
      if (cut) await ledger.updateCut(cut.id, { lines: parsed, date, deposit_deduct: deduct, note });
      else await ledger.addCut({ contract_id: summary.contract.id, lines: parsed, date, deposit_deduct: deduct, note });
      showToast({ message: `Đã lưu đợt cắt: ${formatVnd(value)}` });
      router.back();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!cut) return;
    const undo = await ledger.removeCut(cut.id);
    showToast({ message: 'Đã xóa đợt cắt', undo });
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: cut ? 'Sửa đợt cắt' : `✂️ Ghi đợt cắt · ${summary.contract.buyer}` }} />
      <DateField label="Ngày cắt" value={date} onChange={setDate} notFuture />

      <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text, marginBottom: 8 }}>Hàng cắt đợt này</Text>
      {lines.map((l, i) => (
        <Card key={i} style={{ padding: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput
              accessibilityLabel="Loại hàng"
              value={l.grade}
              onChangeText={(grade) => setLine(i, { grade })}
              maxLength={30}
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
              <Text style={styles.body}>kg</Text>
            </View>
            <View style={{ flex: 3, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TextInput
                accessibilityLabel={`Giá 1 kg ${l.grade}`}
                value={groupDigits(l.price)}
                onChangeText={(t) => setLine(i, { price: Math.min(Number(t.replace(/\D/g, '')) || 0, 999_999_999) })}
                keyboardType="number-pad"
                placeholder="Giá/kg"
                placeholderTextColor={colors.muted}
                style={[inputStyle, { flex: 1, minWidth: 0 }]}
              />
              <Text style={styles.body}>đ/kg</Text>
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
        <Text style={styles.muted}>Tiền hàng đợt này ({formatQty(cutKg(parsed.filter((l) => l.kg > 0)))} kg)</Text>
        <Text style={{ fontSize: 30, fontWeight: '800', color: colors.gain }}>{formatVnd(value)}</Text>
      </Card>

      <MoneyField label={`Trừ cọc đợt này (cọc còn ${formatVnd(depositLeft)})`} value={deduct} onChange={setDeduct} />
      {canDeduct > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -4, marginBottom: 12 }}>
          <Chip label={`Trừ ${formatVnd(canDeduct)}`} active={deduct === canDeduct} onPress={() => setDeduct(canDeduct)} />
          <Chip label="Không trừ" active={deduct === 0} onPress={() => setDeduct(0)} />
        </View>
      )}
      <Field label="Lái trả thêm đợt này">
        <Text style={{ fontSize: font.title, fontWeight: '800', color: colors.text }}>{formatVnd(Math.max(0, value - deduct))}</Text>
      </Field>
      <TextField label="Ghi chú" value={note} onChange={setNote} maxLength={200} />
      <ErrorNote message={error} />
      <Button label={saving ? 'Đang lưu…' : 'Lưu đợt cắt'} onPress={save} disabled={value <= 0 || saving} />
      {cut && (
        <View style={{ marginTop: 12 }}>
          <Button label="Xóa đợt này" variant="danger" onPress={remove} />
        </View>
      )}
    </ScrollView>
  );
}
