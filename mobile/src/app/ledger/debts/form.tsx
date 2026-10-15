import { formatVnd, today, type DebtKind, type Ledger, type LedgerSnapshot } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { CategoryPicker, checkDate, CheckRow, DateField, ErrorNote, GardenPicker, MoneyField, TextField } from '../../../components/fields';
import { LenderFields, LoanFields } from '../../../components/loan';
import { Button, Chip, styles } from '../../../components/ui';
import { useLedger } from '../../../lib/ledger';
import { loanDraft, loanTermsOf } from '../../../lib/loanDraft';
import { colors, font } from '../../../lib/theme';
import { showToast } from '../../../lib/toast';

const KIND_TABS: Record<DebtKind, string> = { payable: 'Mình mua thiếu', receivable: 'Mình bán chịu', loan: 'Mình đi vay' };

/** Ghi nợ mới, hoặc sửa khoản nợ (param id) */
export default function DebtFormScreen() {
  const state = useLedger();
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  return <DebtForm ledger={state.ledger} data={state.data} />;
}

function DebtForm({ ledger, data }: { ledger: Ledger; data: LedgerSnapshot }) {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const debt = data.debts.find((d) => d.id === id);
  const [kind, setKind] = useState<DebtKind>(debt?.kind ?? 'payable');
  const [party, setParty] = useState(debt?.party ?? '');
  const [phone, setPhone] = useState(debt?.phone ?? '');
  const [amount, setAmount] = useState(debt?.amount ?? 0);
  const [date, setDate] = useState(debt?.date ?? today());
  const [dueOn, setDueOn] = useState(debt?.due_on ?? '');
  const [gardenId, setGardenId] = useState<string | null>(debt ? debt.garden_id : null);
  const [note, setNote] = useState(debt?.note ?? '');
  const [recordEntry, setRecordEntry] = useState(true);
  const [terms, setTerms] = useState(() => loanDraft(debt));
  const loan = kind === 'loan';
  // Khoản vay có kỳ hạn + cách trả: hạn trả tự tính theo kỳ hạn
  const autoDue = loan && !!loanTermsOf(terms).loan_plan;
  const type = kind === 'receivable' ? 'income' : 'expense';
  const [categoryId, setCategoryId] = useState('');
  const category = data.categories.find((c) => c.id === categoryId && c.type === type) ?? data.categories.find((c) => c.type === type);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Gợi ý tên đã ghi trước (cùng loại nợ) để trả gộp được theo người
  const typed = party.trim().toLowerCase();
  const suggestions = [...new Set(data.debts.filter((d) => d.kind === kind).map((d) => d.party))]
    .filter((p) => p !== party.trim() && (!typed || p.toLowerCase().includes(typed)))
    .slice(0, 6);

  const save = async () => {
    const dateError = checkDate(date, 'Ngày', { notFuture: true }) ?? (autoDue ? null : checkDate(dueOn, loan ? 'Hạn trả hết nợ' : 'Hẹn trả ngày', { optional: true }));
    if (dateError) return setError(dateError);
    setError(null);
    setSaving(true);
    const input = { party, phone, amount, date, due_on: dueOn || null, garden_id: gardenId, note, ...(loan ? loanTermsOf(terms) : {}) };
    try {
      if (debt) {
        await ledger.updateDebt(debt.id, input);
        router.back();
      } else {
        const created = await ledger.addDebt({ ...input, kind, record_entry: recordEntry, category_id: category?.id });
        showToast({ message: `Đã ghi nợ ${formatVnd(amount)} với ${party.trim()}` });
        router.replace({ pathname: '/ledger/debts/[id]', params: { id: created.id } });
      }
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: debt ? 'Sửa khoản nợ' : 'Ghi nợ' }} />
      {!debt && (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          {(['payable', 'receivable', 'loan'] as const).map((k) => {
            const active = k === kind;
            const color = k === 'receivable' ? colors.gain : colors.loss;
            return (
              <Pressable
                key={k}
                onPress={() => setKind(k)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={{ flex: 1, minHeight: 56, paddingHorizontal: 4, borderRadius: 12, borderWidth: 1, borderColor: active ? color : colors.border, backgroundColor: active ? color : colors.surface, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: font.body, fontWeight: '700', textAlign: 'center', color: active ? '#fff' : colors.text }}>{KIND_TABS[k]}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {loan && <Text style={[styles.muted, { marginBottom: 12 }]}>Tiền vay là tiền mượn nên không tính vào lời/lỗ. Mỗi lần trả, tiền lãi sẽ ghi thành tiền ra (hạng mục 🏦 Lãi vay).</Text>}
      {loan && <LenderFields draft={terms} onChange={setTerms} party={party} onParty={setParty} />}
      {kind === 'payable' && !debt && <Text style={[styles.muted, { marginBottom: 12 }]}>Mua phân, thuốc thiếu: nên ghi ở Kho vật tư → Mua vật tư → “Mua thiếu” để biết cả số bao.</Text>}
      <TextField
        label={loan ? (terms.lenderType === 'bank' ? 'Tên ngân hàng * (chọn ở trên hoặc gõ tên)' : 'Tên bên cho vay *') : kind === 'payable' ? 'Nợ ai (đại lý, cửa hàng) *' : 'Ai nợ (thương lái, người mua) *'}
        value={party}
        onChange={setParty}
        maxLength={80}
        placeholder={loan ? 'Ví dụ: Agribank, Quỹ tín dụng' : kind === 'payable' ? 'Ví dụ: Đại lý Hai Lúa' : 'Ví dụ: Thương lái Tư'}
      />
      {suggestions.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -4, marginBottom: 12 }}>
          {suggestions.map((p) => (
            <Chip key={p} label={p} active={false} onPress={() => setParty(p)} />
          ))}
        </View>
      )}
      <TextField label="Số điện thoại" value={phone} onChange={setPhone} maxLength={20} keyboardType="phone-pad" />
      <MoneyField label={loan ? 'Số tiền vay *' : 'Số tiền *'} value={amount} onChange={setAmount} />
      {loan && <LoanFields draft={terms} onChange={setTerms} party={party} amount={amount} date={date} />}
      <DateField label="Ngày" value={date} onChange={setDate} notFuture />
      {autoDue ? (
        <Text style={[styles.muted, { marginTop: -4, marginBottom: 12 }]}>Hạn trả: tự tính theo kỳ hạn vay.</Text>
      ) : (
        <DateField label={loan ? 'Hạn trả hết nợ' : 'Hẹn trả ngày'} value={dueOn} onChange={setDueOn} optional min={date} />
      )}
      {data.gardens.length > 0 && (
        <GardenPicker data={data} value={gardenId} onChange={setGardenId} allowShared label={loan ? 'Tiền lãi tính cho vườn nào (vay chung cho các vườn: chọn Chi chung)' : 'Vườn'} />
      )}
      {!debt && !loan && (
        <>
          <CheckRow label={`Ghi luôn vào sổ thu chi (${kind === 'payable' ? 'tiền ra' : 'tiền vào'}, tính vào lời/lỗ)`} checked={recordEntry} onChange={setRecordEntry} />
          {!recordEntry && <Text style={[styles.muted, { marginBottom: 12 }]}>Bỏ chọn khi khoản này đã ghi trong sổ rồi, để không bị tính 2 lần.</Text>}
          {recordEntry && category && <CategoryPicker data={data} type={type} value={category.id} onChange={setCategoryId} />}
        </>
      )}
      <TextField label="Ghi chú" value={note} onChange={setNote} maxLength={200} placeholder={kind === 'payable' ? 'Ví dụ: 10 bao phân, trả sau thu hoạch' : 'Ví dụ: 2 tấn cà phê'} />
      <ErrorNote message={error} />
      <Button label={saving ? 'Đang lưu…' : 'Lưu'} onPress={save} disabled={!party.trim() || amount <= 0 || saving} />
    </ScrollView>
  );
}
