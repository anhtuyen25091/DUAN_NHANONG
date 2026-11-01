import { foldVietnamese, PROVINCE_CENTERS, PROVINCE_NAMES, type IotFarm } from '@nhanong/shared';
import * as Location from 'expo-location';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text } from 'react-native';
import { FormInput, FormMessage, FormSection, NO_ERRORS, toFormErrors } from '../../components/iotForm';
import { Button, Card, Chip, Status, styles } from '../../components/ui';
import { confirmAsync } from '../../lib/confirm';
import { iotApi } from '../../lib/iot';
import { colors } from '../../lib/theme';
import { useAsync } from '../../lib/useAsync';

/** Thêm trang trại, hoặc sửa (param id). Vị trí dùng cho dự báo thời tiết. */
export default function IotFarmFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const farms = useAsync(() => (id ? iotApi.farms() : Promise.resolve([])), [id]);
  if (farms.state.status !== 'ok') return <Status state={farms.state} retry={farms.reload} />;
  const farm = id ? farms.state.data.find((f) => f.id === Number(id)) : undefined;
  if (id && !farm) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  return <FarmForm farm={farm} />;
}

function FarmForm({ farm }: { farm?: IotFarm }) {
  const [name, setName] = useState(farm?.name ?? '');
  const [province, setProvince] = useState(farm?.province ?? '');
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(farm?.lat != null && farm?.lng != null ? { lat: farm.lat, lng: farm.lng } : null);
  const [fromGps, setFromGps] = useState(false);
  const [rainAlerts, setRainAlerts] = useState(farm?.rain_alerts ?? true);
  const [search, setSearch] = useState('');
  const [errors, setErrors] = useState(NO_ERRORS);
  const [busy, setBusy] = useState(false);
  const [gpsMessage, setGpsMessage] = useState<string | null>(null);

  const matches = search.trim()
    ? Object.entries(PROVINCE_NAMES).filter(([, n]) => foldVietnamese(n).includes(foldVietnamese(search.trim()))).slice(0, 8)
    : [];

  const pickProvince = (code: string) => {
    setProvince(PROVINCE_NAMES[code]);
    setSearch('');
    // Chưa lấy GPS thì dùng trung tâm tỉnh (đủ cho dự báo thời tiết)
    if (!fromGps) setPoint({ lat: PROVINCE_CENTERS[code][0], lng: PROVINCE_CENTERS[code][1] });
  };

  const locate = async () => {
    setGpsMessage('Đang lấy vị trí…');
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return setGpsMessage('Chưa cho phép dùng vị trí. Hãy chọn tỉnh.');
      const p = (await Location.getLastKnownPositionAsync({ maxAge: 300000 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      setPoint({ lat: Math.round(p.coords.latitude * 1e4) / 1e4, lng: Math.round(p.coords.longitude * 1e4) / 1e4 });
      setFromGps(true);
      setGpsMessage('Đã lấy vị trí hiện tại. Nên đứng tại trang trại khi bấm.');
    } catch {
      setGpsMessage('Không lấy được vị trí. Hãy chọn tỉnh.');
    }
  };

  const save = async () => {
    setBusy(true);
    setErrors(NO_ERRORS);
    try {
      const input = { name: name.trim(), province: province || null, lat: point?.lat ?? null, lng: point?.lng ?? null, rain_alerts: rainAlerts };
      if (farm) await iotApi.updateFarm(farm.id, input);
      else await iotApi.createFarm(input);
      router.back();
    } catch (error) {
      setErrors(toFormErrors(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!farm) return;
    const ok = await confirmAsync('Xóa trang trại?', `Xóa "${farm.name}" cùng mọi lô, thiết bị và số đo đã lưu. Không lấy lại được.`);
    if (!ok) return;
    await iotApi.deleteFarm(farm.id).then(() => router.back(), (error) => setErrors(toFormErrors(error)));
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: farm ? 'Sửa trang trại' : 'Thêm trang trại' }} />
      <FormInput label="Tên trang trại" value={name} onChange={setName} error={errors.fields.name} placeholder="VD: Ruộng nhà ông Ba" />

      <Card>
        <Text style={[styles.body, { fontWeight: '700', marginBottom: 4 }]}>📍 Vị trí (để xem dự báo thời tiết)</Text>
        <Text style={[styles.muted, { marginBottom: 8 }]}>
          {province ? `Tỉnh: ${province}` : 'Chưa chọn tỉnh'}
          {point ? ` · tọa độ ${point.lat}, ${point.lng}${fromGps ? ' (GPS)' : ''}` : ''}
        </Text>
        <FormInput label="Tìm tỉnh" value={search} onChange={setSearch} placeholder="Gõ tên tỉnh, VD: Cà Mau" />
        {matches.length > 0 && (
          <FormSection label="Chọn tỉnh">
            {matches.map(([code, provinceName]) => (
              <Chip key={code} label={provinceName} active={province === provinceName} onPress={() => pickProvince(code)} small />
            ))}
          </FormSection>
        )}
        <Button label="📡 Dùng vị trí hiện tại (đứng tại trang trại)" onPress={locate} variant="outline" />
        {gpsMessage && <Text style={[styles.muted, { marginTop: 6 }]}>{gpsMessage}</Text>}
      </Card>

      <FormSection label="🌧️ Báo khi trời bắt đầu mưa tại vườn">
        <Chip label="Có" active={rainAlerts} onPress={() => setRainAlerts(true)} />
        <Chip label="Không" active={!rainAlerts} onPress={() => setRainAlerts(false)} />
      </FormSection>
      <Text style={[styles.muted, { marginTop: -6, marginBottom: 12 }]}>Theo dữ liệu thời tiết tại vị trí vườn (15 phút / lần), hoặc máy đo mưa nếu vườn có lắp. Mỗi cơn mưa báo 1 lần.</Text>

      <FormMessage errors={errors} />
      <Button label={busy ? 'Đang lưu…' : 'Lưu'} onPress={save} disabled={busy || name.trim() === ''} />
      {farm && (
        <Text onPress={remove} accessibilityRole="button" style={{ color: colors.error, textAlign: 'center', padding: 16 }}>
          Xóa trang trại
        </Text>
      )}
    </ScrollView>
  );
}
