import { extraTexts, formatVnd, saveExtra, supplyCost, today, type Ledger, type LedgerSnapshot } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { CategoryPicker, checkDate, CheckRow, DateField, ErrorNote, Field, MoneyField, QtyField, TextField } from '../../../components/fields';
import { CustomFieldInputs } from '../../../components/extraFields';
import { Button, Chip } from '../../../components/ui';
import { useLedger } from '../../../lib/ledger';
import { parseQty, qtyText } from '../../../lib/qty';
import { colors } from '../../../lib/theme';
import { showToast } from '../../../lib/toast';

const UNITS = ['bao', 'chai', 'gói', 'kg', 'lít', 'cây', 'thùng'];

/** Mua vật tư về kho, hoặc sửa vật tư (param id) */
export default function SupplyFormScreen() {
  const state = useLedger();
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  return <SupplyForm ledger={state.ledger} data={state.data} />;
}

function SupplyForm({ ledger, data }: { ledger: Ledger; data: LedgerSnapshot }) {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const supply = data.supplies.find((s) => s.id === id);
  const defaultCategory = data.categories.find((c) => c.name === 'Phân bón')?.id ?? data.categories.find((c) => c.type === 'expense')?.id ?? '';
  const [name, setName] = useState(supply?.name ?? '');
  const [categoryId, setCategoryId] = useState(supply?.category_id ?? defaultCategory);
  const [qty, setQty] = useState(qtyText(supply?.quantity ?? 0));
  const [unit, setUnit] = useState(supply?.unit ?? 'bao');
  const [unitPrice, setUnitPrice] = useState(supply?.unit_price ?? 0);
  const [boughtOn, setBoughtOn] = useState(supply?.bought_on ?? today());
  const [shop, setShop] = useState(supply?.shop_name ?? '');
  const [note, setNote] = useState(supply?.note ?? '');
  const [onCredit, setOnCredit] = useState(false);
  const [useFor, setUseFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [extra, setExtra] = useState(() => extraTexts(data.custom_fields, 'supply', supply?.extra));

  const quantity = parseQty(qty);
  const total = supplyCost({ quantity, unit_price: unitPrice });
  const valid = name.trim() !== '' && quantity > 0 && unitPrice > 0 && categoryId !== '';

  const save = async () => {
    if (!valid) return;
    const dateError = checkDate(boughtOn, 'Ngày mua', { notFuture: true });
    if (dateError) return setError(dateError);
    setError(null);
    setSaving(true);
    const input = { name, category_id: categoryId, unit, quantity, unit_price: unitPrice, bought_on: boughtOn, shop_name: shop, note };
    try {
      if (supply) {
        await ledger.updateSupply(supply.id, input);
        await saveExtra(ledger, data.custom_fields, 'supply', supply.id, extra);
        router.back();
      } else {
        const created = await ledger.addSupply({ ...input, on_credit: onCredit, use_for: useFor });
        await saveExtra(ledger, data.custom_fields, 'supply', created.id, extra);
        showToast({ message: `Đã ghi mua ${name.trim()}: ${formatVnd(total)}${onCredit ? ' (mua thiếu, đã ghi công nợ)' : ''}` });
        router.replace({ pathname: '/ledger/supplies/[id]', params: { id: created.id } });
      }
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: supply ? 'Sửa vật tư' : 'Mua vật tư' }} />
      <TextField label="Tên vật tư *" value={name} onChange={setName} maxLength={80} placeholder="Ví dụ: NPK 16-16-8, Thuốc rầy Actara" autoFocus={!supply} />
      <CategoryPicker data={data} type="expense" value={categoryId} onChange={setCategoryId} />
      <QtyField label="Số lượng *" text={qty} onText={setQty} suffix={unit} />
      <TextField label="Đơn vị" value={unit} onChange={setUnit} maxLength={20} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -4, marginBottom: 12 }}>
        {UNITS.map((u) => (
          <Chip key={u} label={u} active={u === unit} onPress={() => setUnit(u)} />
        ))}
      </View>
      <MoneyField label={`Giá 1 ${unit || 'đơn vị'} *`} value={Math.round(unitPrice)} onChange={setUnitPrice} />
      <MoneyField label="Thành tiền (gõ vào đây nếu chỉ nhớ tổng tiền)" value={total} onChange={(t) => setUnitPrice(quantity > 0 ? t / quantity : 0)} />
      <DateField label="Ngày mua" value={boughtOn} onChange={setBoughtOn} notFuture />
      <TextField label="Mua ở đâu" value={shop} onChange={setShop} maxLength={80} placeholder="Ví dụ: Đại lý Hai Lúa" />
      <TextField label="Ghi chú" value={note} onChange={setNote} maxLength={200} />
      <CustomFieldInputs fields={data.custom_fields} target="supply" texts={extra} onChange={setExtra} />

      {!supply && (
        <>
          <CheckRow label="Mua thiếu, chưa trả tiền (ghi vào công nợ)" checked={onCredit} onChange={setOnCredit} />
          {data.gardens.length > 0 && (
            <Field label="Dùng hết ngay cho vườn?">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Chip label="Để trong kho" active={useFor === null} onPress={() => setUseFor(null)} />
                {data.gardens.map((g) => (
                  <Chip key={g.id} label={g.name} active={g.id === useFor} onPress={() => setUseFor(g.id)} />
                ))}
              </View>
            </Field>
          )}
        </>
      )}

      <ErrorNote message={error} />
      <Button label={saving ? 'Đang lưu…' : supply ? 'Lưu' : `Lưu · tiền ra ${formatVnd(total)}`} onPress={save} disabled={!valid || saving} />
    </ScrollView>
  );
}
