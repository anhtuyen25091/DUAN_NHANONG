import { formatIotValue, thresholdLabel, timeAgo, type IotReading } from '@nhanong/shared';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { AlertCard, SectionTitle } from '../../../components/iot';
import { Button, Card, Status, styles } from '../../../components/ui';
import { iotApi } from '../../../lib/iot';
import { colors, font } from '../../../lib/theme';
import { useAsync } from '../../../lib/useAsync';

/** 1 lô: số đo mới nhất của mọi chỉ số (so với ngưỡng), cảnh báo, thiết bị */
export default function IotPlotScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const summary = useAsync(() => iotApi.plotSummary(Number(id)), [id]);
  // Quay về từ màn sửa lô / thiết bị / ngưỡng: tải lại
  useFocusEffect(
    useCallback(() => {
      summary.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );
  const data = summary.state.status === 'ok' ? summary.state.data : null;

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={summary.refreshing} onRefresh={summary.reload} />}>
      <Stack.Screen options={{ title: data?.plot.name ?? name ?? 'Lô' }} />
      <Status state={summary.state} retry={summary.reload} />
      {data && (
        <>
          {data.open_alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} onResolved={summary.refetch} />
          ))}

          <SectionTitle text="Số đo mới nhất" />
          {data.readings.length === 0 && (
            <Card>
              <Text style={styles.body}>Chưa có số đo. Thiết bị gửi lần đầu thì số đo hiện ở đây.</Text>
            </Card>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {data.readings.map((reading) => (
              <ReadingTile
                key={`${reading.device_id}-${reading.metric.code}`}
                reading={reading}
                showDevice={data.devices.length > 1}
                onPress={() =>
                  router.push({
                    pathname: '/iot/chart',
                    params: {
                      device: String(reading.device_id),
                      metric: reading.metric.code,
                      title: reading.metric.name,
                      unit: reading.metric.unit ?? '',
                      min: reading.min === null ? '' : String(reading.min),
                      max: reading.max === null ? '' : String(reading.max),
                    },
                  })
                }
              />
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <View style={{ flex: 1 }}>
              <Button
                label="⚙️ Ngưỡng cảnh báo"
                variant="outline"
                onPress={() => router.push({ pathname: '/iot/thresholds', params: { plot: String(data.plot.id), name: data.plot.name, type: data.plot.type } })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="✏️ Sửa lô" variant="outline" onPress={() => router.push({ pathname: '/iot/plot-form', params: { id: String(data.plot.id) } })} />
            </View>
          </View>

          <SectionTitle text="Thiết bị" />
          {data.devices.length === 0 && (
            <Card>
              <Text style={styles.body}>Lô chưa có thiết bị đo.</Text>
            </Card>
          )}
          {data.devices.map((device) => (
            <Pressable key={device.id} onPress={() => router.push({ pathname: '/iot/device-form', params: { id: String(device.id) } })} accessibilityRole="button">
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 14, color: device.online ? colors.primary : colors.error }}>●</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.body, { fontWeight: '700' }]}>{device.name}</Text>
                <Text style={styles.muted}>
                  {device.kind === 'lorawan' ? 'LoRaWAN' : 'WiFi / 4G'} · mã {device.uid}
                  {device.battery !== null ? ` · pin ${device.battery}%` : ''}
                </Text>
                <Text style={[styles.muted, !device.online && { color: colors.error }]}>
                  {device.last_seen_at ? `Gửi lần cuối ${timeAgo(device.last_seen_at)}` : 'Chưa gửi lần nào'}
                  {!device.online && device.kind === 'esp32' ? '. Ruộng không có mạng thì ra lấy dữ liệu bằng điện thoại.' : ''}
                </Text>
              </View>
              <Text style={{ fontSize: 22, color: colors.primary }}>›</Text>
            </Card>
            </Pressable>
          ))}
          <Button
            label="＋ Thêm thiết bị"
            variant="outline"
            onPress={() => router.push({ pathname: '/iot/device-form', params: { farm: String(data.plot.farm_id), plot: String(data.plot.id) } })}
          />
          <View style={{ height: 16 }} />
        </>
      )}
    </ScrollView>
  );
}

function ReadingTile({ reading, showDevice, onPress }: { reading: IotReading; showDevice: boolean; onPress: () => void }) {
  const bad = reading.status === 'below' || reading.status === 'above';
  const limit = thresholdLabel(reading.min, reading.max);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ width: '48%', flexGrow: 1 }}>
      <Card style={[{ marginBottom: 0, minHeight: 118 }, bad && { borderColor: colors.error, borderWidth: 2, backgroundColor: colors.lossSoft }]}>
        <Text style={styles.muted} numberOfLines={2}>
          {reading.metric.name}
        </Text>
        <Text style={{ fontSize: 26, fontWeight: '800', color: bad ? colors.error : colors.text, marginVertical: 2 }}>{formatIotValue(reading.value, reading.metric.unit)}</Text>
        {limit && <Text style={{ fontSize: font.small, color: bad ? colors.error : colors.primary, fontWeight: '600' }}>{bad ? `⚠️ ${limit}` : `✓ ${limit}`}</Text>}
        <Text style={styles.muted}>
          {timeAgo(reading.measured_at)}
          {showDevice ? ` · ${reading.device_name}` : ''}
        </Text>
      </Card>
    </Pressable>
  );
}
