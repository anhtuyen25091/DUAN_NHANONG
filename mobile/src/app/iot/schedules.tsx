import { canManage, describeSchedule, monthsLabel, parseDecimalInput, timeAgo, type IotActuator, type IotCropPreset, type IotRole, type IotSchedule } from '@nhanong/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SectionTitle } from '../../components/iot';
import { FormInput, FormMessage, FormSection, NO_ERRORS, toFormErrors } from '../../components/iotForm';
import { Button, Card, Chip, Status, styles } from '../../components/ui';
import { confirmAsync } from '../../lib/confirm';
import { iotApi } from '../../lib/iot';
import { colors } from '../../lib/theme';
import { useAsync } from '../../lib/useAsync';

const DRY_SEASON = [12, 1, 2, 3, 4];
const EVERY = [1, 2, 3, 7, 10, 15, 20, 25];
const SKIP_RAIN: (number | null)[] = [null, 5, 10, 20];

/** Lịch tưới của các máy bơm / van trong lô */
export default function IotSchedulesScreen() {
  const { plot, name, role } = useLocalSearchParams<{ plot: string; name?: string; role?: IotRole }>();
  // Người dùng chung chỉ xem, không sửa
  const manage = canManage(role);
  const data = useAsync(() => Promise.all([iotApi.schedules(Number(plot)), iotApi.actuators(Number(plot)), iotApi.cropPresets()]), [plot]);
  const [editing, setEditing] = useState<IotSchedule | 'new' | null>(null);

  if (data.state.status !== 'ok') return <Status state={data.state} retry={data.reload} />;
  const [schedules, actuators, presets] = data.state.data;

  if (editing && manage) {
    return (
      <ScheduleForm
        schedule={editing === 'new' ? undefined : editing}
        actuators={actuators}
        presets={presets.filter((p) => p.schedule !== null)}
        onDone={() => {
          setEditing(null);
          data.refetch();
        }}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Stack.Screen options={{ title: `Lịch tưới · ${name ?? 'lô'}` }} />
      <Text style={[styles.muted, { marginBottom: 8 }]}>
        Tới giờ app tự bật máy bơm, chạy đủ số phút rồi tự tắt. Có thể chỉ tưới trong mùa khô, và bỏ lượt khi vườn vừa mưa đủ.
      </Text>
      {!manage && <Text style={[styles.muted, { marginBottom: 8 }]}>🔒 Bạn đang xem trang trại được chia sẻ. Chỉ chủ trang trại được thêm / sửa / xóa.</Text>}
      {actuators.length === 0 && (
        <Card>
          <Text style={styles.body}>Lô chưa có máy bơm / van điều khiển được. Thêm ở khu ⚙️ Điều khiển của lô trước.</Text>
        </Card>
      )}
      <SectionTitle text="Đang có" />
      {schedules.length === 0 && (
        <Card>
          <Text style={styles.body}>Chưa có lịch tưới nào.</Text>
        </Card>
      )}
      {schedules.map((schedule) => (
        <Pressable key={schedule.id} disabled={!manage} onPress={() => setEditing(schedule)} accessibilityRole="button">
          <Card style={!schedule.enabled ? { opacity: 0.6 } : undefined}>
            <Text style={[styles.body, { fontWeight: '700' }]}>🗓️ {schedule.actuator.name}</Text>
            <Text style={styles.body}>{describeSchedule(schedule)}</Text>
            <Text style={styles.muted}>
              {schedule.enabled ? `Lượt tới: ${schedule.next_run_on.split('-').reverse().slice(0, 2).join('/')}` : 'Đang tạm tắt'}
              {schedule.last_run_at ? ` · lần trước ${timeAgo(schedule.last_run_at)}` : ''}
            </Text>
            {schedule.note && <Text style={styles.muted}>{schedule.note}</Text>}
          </Card>
        </Pressable>
      ))}
      {manage && actuators.length > 0 && <Button label="＋ Thêm lịch tưới" onPress={() => setEditing('new')} />}
    </ScrollView>
  );
}

function ScheduleForm({ schedule, actuators, presets, onDone }: { schedule?: IotSchedule; actuators: IotActuator[]; presets: IotCropPreset[]; onDone: () => void }) {
  const [actuatorId, setActuatorId] = useState(schedule?.actuator.id ?? actuators.find((a) => a.kind === 'pump')?.id ?? actuators[0]?.id);
  const [time, setTime] = useState(schedule?.start_time ?? '05:30');
  const [minutes, setMinutes] = useState(String(schedule?.minutes ?? 30));
  const [everyDays, setEveryDays] = useState(schedule?.every_days ?? 1);
  const [months, setMonths] = useState<number[] | null>(schedule ? schedule.months : DRY_SEASON);
  const [skipRain, setSkipRain] = useState<number | null>(schedule ? schedule.skip_rain_mm : 10);
  const [note, setNote] = useState(schedule?.note ?? '');
  const [enabled, setEnabled] = useState(schedule?.enabled ?? true);
  const [errors, setErrors] = useState(NO_ERRORS);
  const [busy, setBusy] = useState(false);

  const toggleMonth = (m: number) => {
    const current = months ?? [];
    const next = current.includes(m) ? current.filter((x) => x !== m) : [...current, m];
    setMonths(next.length === 0 || next.length === 12 ? null : next);
  };

  const applyPreset = (preset: IotCropPreset) => {
    if (!preset.schedule) return;
    setEveryDays(preset.schedule.every_days);
    setMonths(preset.schedule.months);
    setNote(preset.schedule.note.slice(0, 191));
  };

  const save = async () => {
    if (actuatorId === undefined) return;
    setBusy(true);
    setErrors(NO_ERRORS);
    try {
      const input = { start_time: time.trim(), minutes: Number(minutes) || 0, every_days: everyDays, months, skip_rain_mm: skipRain, note: note.trim() || null, enabled };
      if (schedule) await iotApi.updateSchedule(schedule.id, input);
      else await iotApi.createSchedule(actuatorId, input);
      onDone();
    } catch (error) {
      setErrors(toFormErrors(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!schedule || !(await confirmAsync('Xóa lịch tưới?', describeSchedule(schedule)))) return;
    await iotApi.deleteSchedule(schedule.id).then(onDone, (error) => setErrors(toFormErrors(error)));
  };

  const parsedSkip = (text: string) => {
    const v = parseDecimalInput(text);
    return v === null || Number.isNaN(v) ? null : v;
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: schedule ? 'Sửa lịch tưới' : 'Thêm lịch tưới' }} />
      {!schedule && presets.length > 0 && (
        <Card>
          <Text style={[styles.body, { fontWeight: '700', marginBottom: 6 }]}>Gợi ý theo cây trồng</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {presets.map((p) => (
              <Chip key={p.code} small label={p.name} active={false} onPress={() => applyPreset(p)} />
            ))}
          </View>
          <Text style={[styles.muted, { marginTop: 6 }]}>Điền chu kỳ và mùa tưới theo tài liệu kỹ thuật; số phút bơm tùy công suất bơm của bạn.</Text>
        </Card>
      )}
      {!schedule && (
        <FormSection label="Máy bơm / van">
          {actuators.map((a) => (
            <Chip key={a.id} small label={a.name} active={actuatorId === a.id} onPress={() => setActuatorId(a.id)} />
          ))}
        </FormSection>
      )}
      <FormInput label="Giờ bắt đầu (HH:MM)" value={time} onChange={setTime} error={errors.fields.start_time} keyboardType="numbers-and-punctuation" placeholder="05:30" />
      <FormInput label="Chạy (phút)" value={minutes} onChange={setMinutes} error={errors.fields.minutes} keyboardType="number-pad" />
      <FormSection label="Lặp lại" error={errors.fields.every_days}>
        {EVERY.map((n) => (
          <Chip key={n} small label={n === 1 ? 'Mỗi ngày' : `${n} ngày/lần`} active={everyDays === n} onPress={() => setEveryDays(n)} />
        ))}
      </FormSection>
      <FormSection label={`Tưới trong: ${monthsLabel(months)}`} error={errors.fields.months}>
        <Chip small label="Mùa khô (T12 → T4)" active={JSON.stringify(months) === JSON.stringify(DRY_SEASON)} onPress={() => setMonths(DRY_SEASON)} />
        <Chip small label="Cả năm" active={months === null} onPress={() => setMonths(null)} />
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <Chip key={m} small label={`T${m}`} active={months === null || months.includes(m)} onPress={() => toggleMonth(m)} />
        ))}
      </FormSection>
      <FormSection label="Bỏ lượt khi từ hôm qua tới giờ vườn đã mưa" error={errors.fields.skip_rain_mm}>
        {SKIP_RAIN.map((mm) => (
          <Chip key={String(mm)} small label={mm === null ? 'Luôn tưới' : `≥ ${mm} mm`} active={skipRain === mm} onPress={() => setSkipRain(mm)} />
        ))}
      </FormSection>
      {skipRain !== null && !SKIP_RAIN.includes(skipRain) && <FormInput label="Mức mưa bỏ lượt (mm)" value={String(skipRain)} onChange={(t) => setSkipRain(parsedSkip(t))} keyboardType="decimal-pad" />}
      <FormInput label="Ghi chú" value={note} onChange={setNote} error={errors.fields.note} />
      <FormSection label="Trạng thái">
        <Chip label="Đang dùng" active={enabled} onPress={() => setEnabled(true)} />
        <Chip label="Tạm tắt" active={!enabled} onPress={() => setEnabled(false)} />
      </FormSection>
      <FormMessage errors={errors} />
      <Button label={busy ? 'Đang lưu…' : 'Lưu lịch tưới'} onPress={save} disabled={busy} />
      <View style={{ height: 12 }} />
      <Button label="Quay lại" variant="outline" onPress={onDone} />
      {schedule && (
        <Text onPress={remove} accessibilityRole="button" style={{ color: colors.error, textAlign: 'center', padding: 16 }}>
          Xóa lịch tưới
        </Text>
      )}
    </ScrollView>
  );
}
