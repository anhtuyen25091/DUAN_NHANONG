import { formatVnd, today, type Ledger, type LedgerSnapshot } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { CategoryPicker, checkDate, DateField, ErrorNote, GardenPicker, MoneyField, TextField } from '../../../components/fields';
import { Button, Card, styles } from '../../../components/ui';
import { useLedger } from '../../../lib/ledger';
import { colors } from '../../../lib/theme';
import { showToast } from '../../../lib/toast';

/** Nhận cọc của lái (param gardenId: chọn sẵn vườn), hoặc sửa hợp đồng (param id) */
export default function ContractFormScreen() {
  const state = useLedger();
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  return <ContractForm ledger={state.ledger} data={state.data} />;
}

function ContractForm({ ledger, data }: { ledger: Ledger; data: LedgerSnapshot }) {
  const params = useLocalSearchParams<{ id?: string; gardenId?: string }>();
  const contract = data.harvest_contracts.find((c) => c.id === params.id);
  const firstGarden = params.gardenId ?? data.meta.last_garden_id ?? data.gardens[0]?.id ?? null;
  const [gardenId, setGardenId] = useState<string | null>(contract?.garden_id ?? (data.gardens.some((g) => g.id === firstGarden) ? firstGarden : (data.gardens[0]?.id ?? null)));
  const [buyer, setBuyer] = useState(contract?.buyer ?? '');
  const [phone, setPhone] = useState(contract?.phone ?? '');
  const [crop, setCrop] = useState(contract?.crop ?? data.gardens.find((g) => g.id === gardenId)?.crop ?? '');
  const [deposit, setDeposit] = useState(contract?.deposit ?? 0);
  const [date, setDate] = useState(contract?.date ?? today());
  const [categoryId, setCategoryId] = useState(
    contract?.category_id ?? data.categories.find((c) => c.type === 'income' && c.name === 'Bán nông sản')?.id ?? data.categories.find((c) => c.type === 'income')?.id ?? '',
  );
  const [note, setNote] = useState(contract?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (data.gardens.length === 0) {
    return (
      <Card style={{ margin: 16 }}>
        <Stack.Screen options={{ title: 'Nhận cọc của lái' }} />
        <Text style={[styles.body, { marginBottom: 10 }]}>Thêm vườn trước rồi mới ghi hợp đồng bán.</Text>
        <Button label="＋ Thêm vườn" onPress={() => router.push('/ledger/garden-form')} />
      </Card>
    );
  }

  const save = async () => {
    if (!gardenId) return;
    const dateError = checkDate(date, 'Ngày nhận cọc', { notFuture: true });
    if (dateError) return setError(dateError);
    setError(null);
    setSaving(true);
    const input = { buyer, phone, crop, deposit, date, category_id: categoryId, note };
    try {
      if (contract) {
        await ledger.updateContract(contract.id, input);
        router.back();
      } else {
        const created = await ledger.addContract({ ...input, garden_id: gardenId });
        showToast({ message: `Đã ghi nhận cọc ${formatVnd(deposit)} của lái ${buyer.trim()}` });
        router.replace({ pathname: '/ledger/contracts/[id]', params: { id: created.id } });
      }
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: contract ? 'Sửa hợp đồng' : 'Nhận cọc của lái' }} />
      {!contract && <GardenPicker data={data} value={gardenId} onChange={(g) => g && setGardenId(g)} label="Bán vườn nào *" />}
      <TextField label="Tên lái *" value={buyer} onChange={setBuyer} maxLength={80} placeholder="Ví dụ: Lái Tư Chợ Gạo" />
      <TextField label="Số điện thoại" value={phone} onChange={setPhone} maxLength={20} keyboardType="phone-pad" />
      <TextField label="Cây / giống" value={crop} onChange={setCrop} maxLength={60} placeholder="Ví dụ: Sầu riêng Ri6, Monthong" />
      <MoneyField label="Tiền cọc" value={deposit} onChange={setDeposit} />
      <DateField label="Ngày nhận cọc" value={date} onChange={setDate} notFuture />
      <CategoryPicker data={data} type="income" value={categoryId} onChange={setCategoryId} label="Ghi tiền các đợt cắt vào hạng mục" />
      <TextField label="Ghi chú" value={note} onChange={setNote} maxLength={200} placeholder="Ví dụ: bao cả vườn, giá theo chợ từng đợt" />
      <Text style={[styles.muted, { marginBottom: 12 }]}>Tiền cọc chưa tính vào lời/lỗ. Mỗi đợt cắt sẽ trừ dần cọc theo số hai bên thỏa thuận.</Text>
      <ErrorNote message={error} />
      <View>
        <Button label={saving ? 'Đang lưu…' : 'Lưu'} onPress={save} disabled={!buyer.trim() || !gardenId || saving} />
      </View>
    </ScrollView>
  );
}
