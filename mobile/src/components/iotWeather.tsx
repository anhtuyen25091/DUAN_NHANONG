import { ApiError, formatDecimal, weatherDayLabel, type IotFarm, type IotWeather } from '@nhanong/shared';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Text } from './AppText';
import { iotApi } from '../lib/iot';
import { colors, font } from '../lib/theme';
import { useAsync } from '../lib/useAsync';
import { Card, styles } from './ui';

/** Thẻ thời tiết gọn của 1 trang trại: hôm nay + mưa 24 giờ tới + lưu ý; bấm để xem 7 ngày */
export function WeatherCard({ farm }: { farm: IotFarm }) {
  const farmId = farm.id;
  const farmName = farm.name;
  const hasLocation = farm.lat !== null && farm.lng !== null;
  const weather = useAsync(() => (hasLocation ? iotApi.weather(farmId) : Promise.resolve(null)), [farmId, hasLocation]);

  if (!hasLocation)
    return (
      <Pressable onPress={() => router.push({ pathname: '/iot/farm-form', params: { id: String(farmId) } })} accessibilityRole="button">
        <Card style={{ borderStyle: 'dashed' }}>
          <Text style={styles.body}>🌦️ Chọn vị trí trang trại để xem dự báo thời tiết ›</Text>
        </Card>
      </Pressable>
    );
  // Dự báo là phần phụ: lỗi thì hiện 1 dòng, không chặn cả màn hình
  if (weather.state.status === 'error') {
    const message = weather.state.error instanceof ApiError ? weather.state.error.message : 'Chưa lấy được dự báo thời tiết.';
    return <Text style={[styles.muted, { marginBottom: 12 }]}>🌦️ {message}</Text>;
  }
  if (weather.state.status !== 'ok' || !weather.state.data) return null;
  const data = weather.state.data;
  const today = data.daily[0];

  return (
    <Pressable onPress={() => router.push({ pathname: '/iot/weather', params: { farm: String(farmId), name: farmName } })} accessibilityRole="button">
      <Card style={{ backgroundColor: colors.infoSoft, borderColor: colors.infoBorder }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 34 }}>{today.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.body, { fontWeight: '700' }]}>
              Hôm nay: {today.label}, {formatDecimal(today.temp_min)}–{formatDecimal(today.temp_max)}°C
            </Text>
            <Text style={styles.muted}>{rainText(data)}</Text>
          </View>
          <Text style={{ fontSize: 22, color: colors.primary }}>›</Text>
        </View>
        {farm.raining && (
          <Text style={{ marginTop: 10, fontSize: font.body, fontWeight: '700', color: colors.onPrimary, backgroundColor: colors.info, padding: 10, borderRadius: 10, overflow: 'hidden' }}>
            🌧️ Đang mưa từ {timeOf(farm.raining.since)}
            {farm.raining.mm >= 0.5 ? `, khoảng ${formatDecimal(farm.raining.mm)} mm` : ''}
          </Text>
        )}
        {farm.dry_days !== null && farm.dry_days >= 3 && !farm.raining && (
          <Text style={{ marginTop: 10, fontSize: font.body, fontWeight: '700', color: colors.accentText, backgroundColor: colors.accentSoft, padding: 10, borderRadius: 10, overflow: 'hidden' }}>
            ☀️ Đã {farm.dry_days} ngày không mưa
          </Text>
        )}
        <Hints hints={data.hints} />
      </Card>
    </Pressable>
  );
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function rainText(data: IotWeather): string {
  const { rain_mm, rain_chance } = data.next_24h;
  return rain_mm < 0.5 ? `24 giờ tới: hầu như không mưa` : `24 giờ tới: mưa khoảng ${formatDecimal(rain_mm)} mm (khả năng ${rain_chance}%)`;
}

export function Hints({ hints }: { hints: string[] }) {
  if (hints.length === 0) return null;
  return (
    <View style={{ marginTop: 10, gap: 6 }}>
      {hints.map((hint) => (
        <Text key={hint} style={{ fontSize: font.small + 1, color: colors.accentText, backgroundColor: colors.accentSoft, padding: 8, borderRadius: 10, overflow: 'hidden' }}>
          💡 {hint}
        </Text>
      ))}
    </View>
  );
}

export function DayRow({ day, index }: { day: IotWeather['daily'][number]; index: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 10 }}>
      <Text style={[styles.body, { width: 92, fontWeight: index < 2 ? '700' : '400' }]}>{weatherDayLabel(day.date, index)}</Text>
      <Text style={{ fontSize: 24, width: 34 }}>{day.icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.body}>
          {formatDecimal(day.temp_min)}–{formatDecimal(day.temp_max)}°C
        </Text>
        <Text style={styles.muted}>
          {day.label}
          {day.rain_mm >= 0.5 ? ` · ${formatDecimal(day.rain_mm)} mm` : ''}
          {day.rain_chance !== null && day.rain_chance > 0 ? ` · ${day.rain_chance}%` : ''} · gió {formatDecimal(day.wind_max)} m/s
        </Text>
      </View>
    </View>
  );
}
