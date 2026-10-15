import { formatVnd, today, type DebtKind, type Ledger, type LedgerSnapshot } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { CategoryPicker, checkDate, CheckRow, DateField, ErrorNote, GardenPicker, MoneyField, TextField } from '../../../components/fields';
import { Button, styles } from '../../../components/ui';
import { useLedger } from '../../../lib/ledger';
import { colors, font } from '../../../lib/theme';
import { showToast } from '../../../lib/toast';

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
  const type = kind === 'payable' ? 'expense' : 'income';
  const [categoryId, setCategoryId] = useState('');
  const category = data.categories.find((c) => c.id === categoryId && c.type === type) ?? data.categories.find((c) => c.type === type);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const dateError = checkDate(date, 'Ngày', { notFuture: true }) ?? checkDate(dueOn, 'Hẹn trả ngày', { optional: true });
    if (dateError) return setError(dateError);
    setError(null);
    setSaving(true);
    const input = { party, phone, amount, date, due_on: dueOn || null, garden_id: gardenId, note };
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
          {(['payable', 'receivable'] as const).map((k) => {
            const active = k === kind;
            const color = k === 'payable' ? colors.loss : colors.gain;
            return (
              <Pressable
                key={k}
                onPress={() => setKind(k)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={{ flex: 1, minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: active ? color : colors.border, backgroundColor: active ? color : colors.surface, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: active ? '#fff' : colors.text }}>{k === 'payable' ? 'Mình mua thiếu' : 'Mình bán chịu'}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <TextField
        label={kind === 'payable' ? 'Nợ ai (đại lý, cửa hàng) *' : 'Ai nợ (thương lái, người mua) *'}
        value={party}
        onChange={setParty}
        maxLength={80}
        placeholder={kind === 'payable' ? 'Ví dụ: Đại lý Hai Lúa' : 'Ví dụ: Thương lái Tư'}
      />
      <TextField label="Số điện thoại" value={phone} onChange={setPhone} maxLength={20} keyboardType="phone-pad" />
      <MoneyField label="Số tiền *" value={amount} onChange={setAmount} />
      <DateField label="Ngày" value={date} onChange={setDate} notFuture />
      <DateField label="Hẹn trả ngày" value={dueOn} onChange={setDueOn} optional min={date} />
      {data.gardens.length > 0 && <GardenPicker data={data} value={gardenId} onChange={setGardenId} allowShared />}
      {!debt && (
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
