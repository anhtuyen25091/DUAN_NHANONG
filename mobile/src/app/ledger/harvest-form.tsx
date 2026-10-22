import { formatQtyGrouped, formatVnd, HARVEST_UNITS, today, type Ledger, type LedgerSnapshot } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { WithholdingNotice } from '../../components/farmLogs';
import { CheckRow, DateField, ErrorNote, Field, GardenPicker, MoneyField, QtyField, TextField } from '../../components/fields';
import { Button, Chip, styles } from '../../components/ui';
import { useLedger } from '../../lib/ledger';
import { parseQty, qtyText } from '../../lib/qty';
import { colors } from '../../lib/theme';
import { showToast } from '../../lib/toast';

/** Ghi sản lượng thu hoạch (param gardenId), hoặc sửa (param id) */
export default function HarvestFormScreen() {
  const state = useLedger();
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  return <HarvestForm ledger={state.ledger} data={state.data} />;
}

function HarvestForm({ ledger, data }: { ledger: Ledger; data: LedgerSnapshot }) {
  const { id, gardenId } = useLocalSearchParams<{ id?: string; gardenId?: string }>();
  const harvest = data.harvests.find((h) => h.id === id);
  const [garden, setGarden] = useState<string | null>(harvest?.garden_id ?? gardenId ?? data.gardens[0]?.id ?? null);
  const [crop, setCrop] = useState(harvest?.crop ?? data.gardens.find((g) => g.id === garden)?.crop ?? '');
  const [qty, setQty] = useState(qtyText(harvest?.quantity ?? 0));
  const [unit, setUnit] = useState(harvest?.unit ?? 'kg');
  const [sold, setSold] = useState(!!harvest?.price);
  const [price, setPrice] = useState(harvest?.price ?? 0);
  const [date, setDate] = useState(harvest?.date ?? today());
  const [note, setNote] = useState(harvest?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const quantity = parseQty(qty);

  if (id && !harvest) return <Text style={[styles.body, { padding: 16 }]}>Không tìm thấy lần thu hoạch này (có thể đã xóa).</Text>;

  const save = async () => {
    if (!garden) return setError('Hãy chọn vườn.');
    setError(null);
    const input = { garden_id: garden, date, crop, quantity, unit, price: sold ? price : null, note };
    try {
      if (harvest) await ledger.updateHarvest(harvest.id, input);
      else await ledger.addHarvest(input);
      showToast({ message: `Đã ghi ${formatQtyGrouped(quantity)} ${unit}${sold && price ? ` · tiền vào ${formatVnd(Math.round(quantity * price))}` : ''}` });
      router.back();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async () => {
    if (!harvest) return;
    const undo = await ledger.removeHarvest(harvest.id);
    showToast({ message: 'Đã xóa lần thu hoạch', undo });
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: harvest ? 'Sửa thu hoạch' : '🌾 Ghi thu hoạch' }} />
      <GardenPicker data={data} value={garden} onChange={setGarden} />
      <QtyField label="Sản lượng *" text={qty} onText={setQty} suffix={unit} />
      <Field label="Đơn vị">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {HARVEST_UNITS.map((u) => (
            <Chip key={u} label={u} active={u === unit} onPress={() => setUnit(u)} />
          ))}
        </View>
      </Field>
      <TextField label="Loại nông sản" value={crop} onChange={setCrop} maxLength={60} placeholder="Ví dụ: Cà phê nhân, Sầu riêng Ri6" />
      <DateField label="Ngày thu hoạch" value={date} onChange={setDate} notFuture />
      <WithholdingNotice data={data} gardenId={garden} on={date} />
      <CheckRow label="Đã bán, ghi luôn tiền vào" checked={sold} onChange={setSold} />
      {sold && (
        <>
          <MoneyField label={`Giá bán 1 ${unit}`} value={Math.round(price)} onChange={setPrice} />
          {quantity > 0 && price > 0 && (
            <Text style={[styles.body, { marginBottom: 8 }]}>
              Tiền vào: <Text style={{ fontWeight: '800', color: colors.gain }}>{formatVnd(Math.round(quantity * price))}</Text> (hạng mục “Bán nông sản”)
            </Text>
          )}
        </>
      )}
      <Text style={[styles.muted, { marginBottom: 8 }]}>Bán cho lái theo đợt cắt thì không cần ghi ở đây: số kg đã cắt được tự cộng vào sản lượng.</Text>
      <TextField label="Ghi chú" value={note} onChange={setNote} maxLength={200} />
      <ErrorNote message={error} />
      <Button label="Lưu" onPress={save} disabled={!(quantity > 0) || (sold && !(price > 0))} />
      {harvest && (
        <View style={{ marginTop: 12 }}>
          <Button label={`Xóa lần thu hoạch này${harvest.price ? ' (kèm khoản tiền bán)' : ''}`} variant="danger" onPress={remove} />
        </View>
      )}
    </ScrollView>
  );
}
