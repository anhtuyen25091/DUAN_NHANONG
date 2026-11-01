import { type IotInterval } from '@nhanong/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { IotChart } from '../../components/IotChart';
import { Card, Chip, Status } from '../../components/ui';
import { iotApi } from '../../lib/iot';
import { useAsync } from '../../lib/useAsync';

const RANGES: { label: string; hours: number; interval: IotInterval }[] = [
  { label: '24 giờ', hours: 24, interval: 'raw' },
  { label: '7 ngày', hours: 24 * 7, interval: 'hour' },
  { label: '30 ngày', hours: 24 * 30, interval: 'day' },
];

/** Lịch sử 1 chỉ số của 1 thiết bị */
export default function IotChartScreen() {
  const params = useLocalSearchParams<{ device: string; metric: string; title?: string; unit?: string; min?: string; max?: string }>();
  const [range, setRange] = useState(RANGES[0]);
  const history = useAsync(
    () =>
      iotApi.readings(Number(params.device), {
        metric: params.metric,
        from: new Date(Date.now() - range.hours * 3600 * 1000).toISOString(),
        interval: range.interval,
      }),
    [params.device, params.metric, range],
  );
  const toNumber = (v?: string) => (v ? Number(v) : null);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Stack.Screen options={{ title: params.title ?? 'Biểu đồ' }} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {RANGES.map((r) => (
          <Chip key={r.label} label={r.label} active={r === range} onPress={() => setRange(r)} />
        ))}
      </View>
      <Status state={history.state} retry={history.reload} />
      {history.state.status === 'ok' && (
        <Card>
          <IotChart points={history.state.data.data} interval={history.state.data.interval} unit={params.unit || null} min={toNumber(params.min)} max={toNumber(params.max)} />
        </Card>
      )}
    </ScrollView>
  );
}
