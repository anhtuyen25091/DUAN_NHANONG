import { formatVnd, type Ledger, type LedgerSnapshot } from '@nhanong/shared';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { MoneyField, TextField } from '../../components/fields';
import { Button, Card, styles } from '../../components/ui';
import { useLedger } from '../../lib/ledger';
import { colors, font } from '../../lib/theme';
import { showToast } from '../../lib/toast';

/** Khoản hay dùng: ghi ngay, sửa tên / số tiền, xóa */
export default function TemplatesScreen() {
  const state = useLedger();
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  return <Templates ledger={state.ledger} data={state.data} />;
}

function Templates({ ledger, data }: { ledger: Ledger; data: LedgerSnapshot }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState(0);

  const start = (id: string) => {
    const t = data.templates.find((x) => x.id === id)!;
    setEditing(id);
    setLabel(t.label);
    setAmount(t.amount);
  };
  const save = async () => {
    if (!editing) return;
    await ledger.updateTemplate(editing, { label, amount }).catch((e: Error) => showToast({ message: e.message }));
    setEditing(null);
  };
  const remove = async (id: string) => {
    const undo = await ledger.removeTemplate(id);
    showToast({ message: 'Đã xóa khoản hay dùng', undo });
  };
  const use = async (id: string) => {
    const t = data.templates.find((x) => x.id === id)!;
    try {
      await ledger.useTemplate(id);
      showToast({ message: `Đã ghi ${t.label}: ${formatVnd(t.amount)}` });
    } catch (e) {
      showToast({ message: (e as Error).message });
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: '⭐ Khoản hay dùng' }} />
      <Text style={[styles.muted, { marginBottom: 12 }]}>
        Khoản ghi đi ghi lại (xịt thuốc, tiền điện tưới…). Ở màn Ghi tiền bấm vào là điền sẵn, chỉ cần bấm Lưu. Thêm mới: tích “Lưu làm khoản hay dùng” khi ghi tiền.
      </Text>
      {data.templates.length === 0 && (
        <Card>
          <Text style={styles.body}>Chưa có khoản hay dùng nào.</Text>
        </Card>
      )}
      {data.templates.map((t) =>
        editing === t.id ? (
          <Card key={t.id}>
            <TextField label="Tên" value={label} onChange={setLabel} maxLength={60} />
            <MoneyField label="Số tiền" value={amount} onChange={setAmount} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button label="Lưu" onPress={save} disabled={!(amount > 0) || !label.trim()} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Thôi" variant="outline" onPress={() => setEditing(null)} />
              </View>
            </View>
          </Card>
        ) : (
          <Card key={t.id}>
            <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text }}>
              {data.categories.find((c) => c.id === t.category_id)?.icon ?? '📦'} {t.label}
            </Text>
            <Text style={[styles.muted, { marginBottom: 10 }]}>
              {t.type === 'income' ? 'Tiền vào' : 'Tiền ra'} <Text style={{ color: t.type === 'income' ? colors.gain : colors.loss, fontWeight: '700' }}>{formatVnd(t.amount)}</Text> ·{' '}
              {t.garden_id ? (data.gardens.find((g) => g.id === t.garden_id)?.name ?? 'vườn đã xóa') : 'Chi chung'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button label="Ghi ngay" onPress={() => use(t.id)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Sửa" variant="outline" onPress={() => start(t.id)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Xóa" variant="danger" onPress={() => remove(t.id)} />
              </View>
            </View>
          </Card>
        ),
      )}
    </ScrollView>
  );
}
