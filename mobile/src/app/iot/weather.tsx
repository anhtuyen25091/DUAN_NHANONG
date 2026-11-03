import { Stack, useLocalSearchParams } from 'expo-router';
import { RefreshControl, ScrollView } from 'react-native';
import { Text } from '../../components/AppText';
import { RainHistory } from '../../components/iotRain';
import { DayRow, Hints, rainText } from '../../components/iotWeather';
import { Card, Status, styles } from '../../components/ui';
import { iotApi } from '../../lib/iot';
import { useAsync } from '../../lib/useAsync';

/** Dự báo 7 ngày theo vị trí trang trại */
export default function IotWeatherScreen() {
  const { farm, name } = useLocalSearchParams<{ farm: string; name?: string }>();
  const weather = useAsync(() => iotApi.weather(Number(farm)), [farm]);
  // Mở từ thông báo / link không kèm tên (bản cũ, hoặc tên đã đổi): lấy tên trang trại cho tiêu đề
  const farmName = useAsync(async () => name || ((await iotApi.farms()).find((f) => f.id === Number(farm))?.name ?? ''), [farm, name]);
  const title = farmName.state.status === 'ok' && farmName.state.data ? farmName.state.data : name;

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={weather.refreshing} onRefresh={weather.reload} />}>
      <Stack.Screen options={{ title: title ? `🌦️ Thời tiết · ${title}` : '🌦️ Thời tiết' }} />
      <Status state={weather.state} retry={weather.reload} />
      {weather.state.status === 'error' && <RainHistory farmId={Number(farm)} />}
      {weather.state.status === 'ok' && (
        <>
          <Card>
            <Text style={[styles.body, { fontWeight: '700' }]}>{rainText(weather.state.data)}</Text>
            <Hints hints={weather.state.data.hints} />
          </Card>
          <Card>
            {weather.state.data.daily.map((day, index) => (
              <DayRow key={day.date} day={day} index={index} />
            ))}
          </Card>
          <RainHistory farmId={Number(farm)} />
          <Text style={[styles.muted, { textAlign: 'center' }]}>Nguồn dữ liệu thời tiết: Open-Meteo (ước tính theo vị trí, cập nhật mỗi giờ).</Text>
        </>
      )}
    </ScrollView>
  );
}
