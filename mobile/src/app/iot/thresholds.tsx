import { formatDecimal, parseDecimalInput, thresholdLabel, type IotMetric, type IotPlotType, type IotThreshold } from '@nhanong/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SectionTitle } from '../../components/iot';
import { FormInput, FormMessage, NO_ERRORS, toFormErrors } from '../../components/iotForm';
import { Button, Card, Chip, Status, styles } from '../../components/ui';
import { confirmAsync } from '../../lib/confirm';
import { iotApi } from '../../lib/iot';
import { colors } from '../../lib/theme';
import { useAsync } from '../../lib/useAsync';

/** Nhóm chỉ số hay dùng theo loại lô (vẫn xem được tất cả) */
const GROUPS: Record<IotPlotType, IotMetric['group'][]> = {
  pond: ['water'],
  field: ['water', 'soil'],
  garden: ['soil', 'weather'],
  greenhouse: ['soil', 'weather'],
  other: ['soil', 'water', 'weather'],
};

/** Ngưỡng cảnh báo của 1 lô: vượt ngưỡng thì báo về điện thoại */
export default function IotThresholdsScreen() {
  const { plot, name, type } = useLocalSearchParams<{ plot: string; name?: string; type?: IotPlotType }>();
  const data = useAsync(() => Promise.all([iotApi.thresholds(Number(plot)), iotApi.metrics()]), [plot]);
  const [editing, setEditing] = useState<{ metric: string; threshold?: IotThreshold } | null>(null);
  const [showAll, setShowAll] = useState(false);

  if (data.state.status !== 'ok') return <Status state={data.state} retry={data.reload} />;
  const [thresholds, metrics] = data.state.data;
  const metricOf = (code: string) => metrics.find((m) => m.code === code);
  const groups = GROUPS[type ?? 'other'];
  const choices = metrics.filter((m) => m.group !== 'device' && (showAll || groups.includes(m.group)) && !thresholds.some((t) => t.metric === m.code));

  if (editing) {
    return (
      <ThresholdForm
        plotId={Number(plot)}
        metric={metricOf(editing.metric)!}
        threshold={editing.threshold}
        onDone={() => {
          setEditing(null);
          data.refetch();
        }}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Stack.Screen options={{ title: `Ngưỡng · ${name ?? 'lô'}` }} />
      <Text style={[styles.muted, { marginBottom: 8 }]}>Số đo ra ngoài ngưỡng thì app báo về điện thoại (1 lần, tới khi số đo trở lại bình thường).</Text>

      <SectionTitle text="Đang đặt" />
      {thresholds.length === 0 && (
        <Card>
          <Text style={styles.body}>Chưa đặt ngưỡng nào.</Text>
        </Card>
      )}
      {thresholds.map((t) => {
        const metric = metricOf(t.metric);
        return (
          <Pressable key={t.id} onPress={() => setEditing({ metric: t.metric, threshold: t })} accessibilityRole="button">
            <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.body, { fontWeight: '700' }]}>{metric?.name ?? t.metric}</Text>
                <Text style={{ color: colors.primary, fontWeight: '600' }}>
                  {thresholdLabel(t.min, t.max)}
                  {metric?.unit ? ` ${metric.unit}` : ''}
                </Text>
                {t.note && <Text style={styles.muted}>{t.note}</Text>}
              </View>
              <Text style={{ fontSize: 22, color: colors.primary }}>›</Text>
            </Card>
          </Pressable>
        );
      })}

      <SectionTitle text="Thêm ngưỡng" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {choices.map((m) => (
          <Chip key={m.code} label={`＋ ${m.name}`} active={false} onPress={() => setEditing({ metric: m.code })} small />
        ))}
      </View>
      <Text onPress={() => setShowAll(!showAll)} accessibilityRole="button" style={{ color: colors.primary, padding: 12, fontWeight: '600' }}>
        {showAll ? 'Chỉ hiện chỉ số hay dùng' : 'Hiện tất cả chỉ số'}
      </Text>
    </ScrollView>
  );
}

function ThresholdForm({ plotId, metric, threshold, onDone }: { plotId: number; metric: IotMetric; threshold?: IotThreshold; onDone: () => void }) {
  const [min, setMin] = useState(threshold?.min != null ? formatDecimal(threshold.min) : '');
  const [max, setMax] = useState(threshold?.max != null ? formatDecimal(threshold.max) : '');
  const [note, setNote] = useState(threshold?.note ?? '');
  const [errors, setErrors] = useState(NO_ERRORS);
  const [busy, setBusy] = useState(false);
  const unit = metric.unit ? ` (${metric.unit})` : '';

  const save = async () => {
    const minValue = parseDecimalInput(min);
    const maxValue = parseDecimalInput(max);
    if (Number.isNaN(minValue) || Number.isNaN(maxValue)) return setErrors({ fields: {}, message: 'Nhập số, VD 7,5.' });
    if (minValue === null && maxValue === null) return setErrors({ fields: {}, message: 'Cần ít nhất mức thấp nhất hoặc cao nhất.' });
    setBusy(true);
    setErrors(NO_ERRORS);
    try {
      await iotApi.saveThreshold(plotId, { metric: metric.code, min: minValue, max: maxValue, note: note.trim() || null });
      onDone();
    } catch (error) {
      setErrors(toFormErrors(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!threshold) return;
    if (!(await confirmAsync('Bỏ ngưỡng?', `Không báo khi ${metric.name} vượt ngưỡng nữa.`, 'Bỏ ngưỡng'))) return;
    await iotApi.deleteThreshold(threshold.id).then(onDone, (error) => setErrors(toFormErrors(error)));
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: metric.name }} />
      <Text style={[styles.muted, { marginBottom: 12 }]}>Để trống một bên nếu chỉ cần báo khi quá thấp hoặc quá cao. Ngưỡng tùy cây trồng, con nuôi: hỏi cán bộ kỹ thuật nếu chưa chắc.</Text>
      <FormInput label={`Thấp nhất${unit}`} value={min} onChange={setMin} error={errors.fields.min} keyboardType="decimal-pad" placeholder="Bỏ trống: không báo khi thấp" />
      <FormInput label={`Cao nhất${unit}`} value={max} onChange={setMax} error={errors.fields.max} keyboardType="decimal-pad" placeholder="Bỏ trống: không báo khi cao" />
      <FormInput label="Ghi chú" value={note} onChange={setNote} error={errors.fields.note} placeholder="VD: Tôm thẻ giai đoạn 1 tháng" />
      <FormMessage errors={errors} />
      <Button label={busy ? 'Đang lưu…' : 'Lưu ngưỡng'} onPress={save} disabled={busy} />
      <View style={{ height: 12 }} />
      <Button label="Quay lại" onPress={onDone} variant="outline" />
      {threshold && (
        <Text onPress={remove} accessibilityRole="button" style={{ color: colors.error, textAlign: 'center', padding: 16 }}>
          Bỏ ngưỡng này
        </Text>
      )}
    </ScrollView>
  );
}
