import { suggestSeasonName, today, type Ledger, type LedgerSnapshot } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { checkDate, DateField, ErrorNote, TextField } from '../../components/fields';
import { Button, Card, styles } from '../../components/ui';
import { useLedger } from '../../lib/ledger';
import { colors } from '../../lib/theme';
import { showToast } from '../../lib/toast';

/** Thêm vụ mới cho vườn (param gardenId), hoặc sửa vụ (thêm param id) */
export default function SeasonFormScreen() {
  const state = useLedger();
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  return <SeasonForm ledger={state.ledger} data={state.data} />;
}

function SeasonForm({ ledger, data }: { ledger: Ledger; data: LedgerSnapshot }) {
  const { gardenId, id } = useLocalSearchParams<{ gardenId: string; id?: string }>();
  const season = data.seasons.find((s) => s.id === id);
  const garden = data.gardens.find((g) => g.id === gardenId);
  const [startedOn, setStartedOn] = useState(season?.started_on ?? today());
  const [name, setName] = useState(season?.name ?? suggestSeasonName(data.seasons, gardenId, startedOn));
  const [endedOn, setEndedOn] = useState(season?.ended_on ?? '');
  const [error, setError] = useState<string | null>(null);

  if (!garden) {
    return (
      <Card style={{ margin: 16 }}>
        <Stack.Screen options={{ title: 'Vụ' }} />
        <Text style={styles.body}>Không tìm thấy vườn này (có thể đã xóa).</Text>
      </Card>
    );
  }

  const save = async () => {
    const dateError = checkDate(startedOn, 'Ngày bắt đầu') ?? checkDate(endedOn, 'Ngày kết thúc', { optional: true });
    if (dateError) return setError(dateError);
    setError(null);
    try {
      const input = { name, started_on: startedOn, ended_on: endedOn || null };
      if (season) await ledger.updateSeason(season.id, input);
      else await ledger.addSeason({ ...input, garden_id: garden.id });
      router.back();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async () => {
    if (!season) return;
    const undo = await ledger.removeSeason(season.id);
    showToast({ message: `Đã xóa ${season.name}. Các khoản thu chi vẫn giữ nguyên.`, undo });
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: season ? `Sửa vụ · ${garden.name}` : `Thêm vụ · ${garden.name}` }} />
      <Text style={[styles.muted, { marginBottom: 12 }]}>Các khoản của vườn ghi trong khoảng ngày của vụ sẽ tự tính vào vụ, không cần chọn lại.</Text>
      <TextField label="Tên vụ *" value={name} onChange={setName} maxLength={60} placeholder="Ví dụ: Vụ cà phê 2026" />
      <DateField label="Bắt đầu *" value={startedOn} onChange={setStartedOn} />
      <DateField label="Kết thúc" value={endedOn} onChange={setEndedOn} optional min={startedOn} />
      <Text style={[styles.muted, { marginTop: -6, marginBottom: 12 }]}>Để trống ngày kết thúc nếu vụ đang làm.</Text>
      <ErrorNote message={error} />
      <View style={{ gap: 10 }}>
        <Button label="Lưu" onPress={save} disabled={!name.trim()} />
        {season && <Button label="Xóa vụ này" variant="danger" onPress={remove} />}
      </View>
    </ScrollView>
  );
}
