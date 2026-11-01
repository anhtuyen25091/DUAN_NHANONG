import { Stack, useLocalSearchParams } from 'expo-router';
import { RefreshControl, ScrollView, Text } from 'react-native';
import { RainHistory } from '../../components/iotRain';
import { DayRow, Hints, rainText } from '../../components/iotWeather';
import { Card, Status, styles } from '../../components/ui';
import { iotApi } from '../../lib/iot';
import { useAsync } from '../../lib/useAsync';

/** Dự báo 7 ngày theo vị trí trang trại */
export default function IotWeatherScreen() {
  const { farm, name } = useLocalSearchParams<{ farm: string; name?: string }>();
  const weather = useAsync(() => iotApi.weather(Number(farm)), [farm]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={weather.refreshing} onRefresh={weather.reload} />}>
      <Stack.Screen options={{ title: `🌦️ Thời tiết · ${name ?? ''}` }} />
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
