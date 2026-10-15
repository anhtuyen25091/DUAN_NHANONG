import type { Ledger, LedgerSnapshot } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { ErrorNote, MoneyField, TextField } from '../../../components/fields';
import { Button, styles } from '../../../components/ui';
import { useLedger } from '../../../lib/ledger';
import { colors } from '../../../lib/theme';
import { showToast } from '../../../lib/toast';

/** Thêm người làm, hoặc sửa (param id) */
export default function WorkerFormScreen() {
  const state = useLedger();
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  return <WorkerForm ledger={state.ledger} data={state.data} />;
}

function WorkerForm({ ledger, data }: { ledger: Ledger; data: LedgerSnapshot }) {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const worker = data.workers.find((w) => w.id === id);
  const [name, setName] = useState(worker?.name ?? '');
  const [phone, setPhone] = useState(worker?.phone ?? '');
  const [wage, setWage] = useState(worker?.wage ?? 0);
  const [note, setNote] = useState(worker?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    try {
      if (worker) await ledger.updateWorker(worker.id, { name, phone, wage, note });
      else await ledger.addWorker({ name, phone, wage, note });
      router.back();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const remove = async () => {
    if (!worker) return;
    try {
      const undo = await ledger.removeWorker(worker.id);
      showToast({ message: `Đã xóa ${worker.name}`, undo });
      router.dismissTo('/ledger/workers');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: worker ? 'Sửa người làm' : 'Thêm người làm' }} />
      <TextField label="Tên *" value={name} onChange={setName} maxLength={60} placeholder="Ví dụ: Anh Ba, Chị Tư" autoFocus={!worker} />
      <MoneyField label="Tiền công 1 ngày *" value={wage} onChange={setWage} />
      {worker && wage !== worker.wage && <Text style={[styles.muted, { marginBottom: 8 }]}>Giá mới chỉ tính cho ngày công chấm từ nay; công đã chấm giữ giá cũ.</Text>}
      <TextField label="Số điện thoại" value={phone} onChange={setPhone} keyboardType="phone-pad" maxLength={20} />
      <TextField label="Ghi chú" value={note} onChange={setNote} maxLength={200} />
      <ErrorNote message={error} />
      <Button label="Lưu" onPress={save} disabled={!name.trim() || !(wage > 0)} />
      {worker && (
        <View style={{ marginTop: 12 }}>
          <Button label="Xóa người này" variant="danger" onPress={remove} />
        </View>
      )}
    </ScrollView>
  );
}
