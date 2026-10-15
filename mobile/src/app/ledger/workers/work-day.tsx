import { formatQty, formatVnd, formatWage, today, type Ledger, type LedgerSnapshot } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import { DateField, ErrorNote, GardenPicker, inputStyle, TextField } from '../../../components/fields';
import { Button, Chip, styles } from '../../../components/ui';
import { useLedger } from '../../../lib/ledger';
import { parseQty } from '../../../lib/qty';
import { colors } from '../../../lib/theme';
import { showToast } from '../../../lib/toast';

const PRESETS: Array<[number, string]> = [
  [0, 'Nghỉ'],
  [0.5, 'Nửa ngày'],
  [1, 'Cả ngày'],
];

/** Chấm công 1 ngày cho nhiều người (param nguoi: chọn sẵn 1 người) */
export default function WorkDayScreen() {
  const state = useLedger();
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  return <WorkDay ledger={state.ledger} data={state.data} />;
}

function WorkDay({ ledger, data }: { ledger: Ledger; data: LedgerSnapshot }) {
  const { nguoi } = useLocalSearchParams<{ nguoi?: string }>();
  const [date, setDate] = useState(today());
  const [garden, setGarden] = useState<string | null>(data.gardens.some((g) => g.id === data.meta.last_garden_id) ? data.meta.last_garden_id! : (data.gardens[0]?.id ?? null));
  const [days, setDays] = useState<Record<string, number>>(() => (nguoi ? { [nguoi]: 1 } : {}));
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const chosen = Object.entries(days).filter(([, d]) => d > 0);
  const total = chosen.reduce((s, [wid, d]) => s + Math.round(d * (data.workers.find((w) => w.id === wid)?.wage ?? 0)), 0);

  const save = async () => {
    try {
      await ledger.addWorkDay({ date, garden_id: garden, workers: chosen.map(([worker_id, d]) => ({ worker_id, days: d })), note });
      showToast({ message: `Đã chấm công ${chosen.length} người · ${formatVnd(total)} (chưa trả)` });
      router.back();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: '✅ Chấm công' }} />
      <DateField label="Ngày làm" value={date} onChange={setDate} notFuture />
      <GardenPicker data={data} value={garden} onChange={setGarden} allowShared label="Làm ở vườn" />
      <Text style={[styles.body, { marginBottom: 6 }]}>Ai đi làm?</Text>
      {data.workers.map((w) => {
        const d = days[w.id] ?? 0;
        return (
          <View key={w.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 10, gap: 6 }}>
            <Text style={styles.body}>
              <Text style={{ fontWeight: '700' }}>{w.name}</Text> <Text style={styles.muted}>{formatWage(w.wage)}</Text>
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {PRESETS.map(([v, text]) => (
                <Chip
                  key={text}
                  label={text}
                  active={d === v}
                  onPress={() => {
                    setCustom({ ...custom, [w.id]: '' });
                    setDays({ ...days, [w.id]: v });
                  }}
                />
              ))}
              <TextInput
                accessibilityLabel={`Số ngày công khác của ${w.name}`}
                keyboardType="decimal-pad"
                placeholder="Khác"
                placeholderTextColor={colors.muted}
                value={custom[w.id] ?? (d !== 0 && d !== 0.5 && d !== 1 ? formatQty(d) : '')}
                onChangeText={(t) => {
                  setCustom({ ...custom, [w.id]: t });
                  setDays({ ...days, [w.id]: parseQty(t) });
                }}
                style={[inputStyle, { width: 84 }]}
              />
            </View>
          </View>
        );
      })}
      <TextField label="Ghi chú" value={note} onChange={setNote} maxLength={200} placeholder="Ví dụ: làm cỏ, bón phân" />
      <ErrorNote message={error} />
      <Button label={`Lưu · ${chosen.length} người · ${formatVnd(total)}`} onPress={save} disabled={chosen.length === 0} />
    </ScrollView>
  );
}
