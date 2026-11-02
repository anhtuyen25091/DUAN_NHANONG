import { type IotFarm } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView } from 'react-native';
import { Text } from '../../components/AppText';
import { FarmLocation, type FarmPlace } from '../../components/FarmLocation';
import { FormInput, FormMessage, FormSection, NO_ERRORS, toFormErrors } from '../../components/iotForm';
import { Button, Chip, Status, styles } from '../../components/ui';
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
  const [location, setLocation] = useState<FarmPlace>({ province: farm?.province ?? '', point: farm?.lat != null && farm?.lng != null ? { lat: farm.lat, lng: farm.lng } : null });
  const [rainAlerts, setRainAlerts] = useState(farm?.rain_alerts ?? true);
  const [dryDays, setDryDays] = useState<number>(farm?.dry_alert_days ?? 7);
  const [errors, setErrors] = useState(NO_ERRORS);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setErrors(NO_ERRORS);
    try {
      const { province, point } = location;
      const input = { name: name.trim(), province: province || null, lat: point?.lat ?? null, lng: point?.lng ?? null, rain_alerts: rainAlerts, dry_alert_days: dryDays };
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

      <FarmLocation value={location} onChange={setLocation} />

      <FormSection label="🌧️ Báo khi trời bắt đầu mưa tại vườn">
        <Chip label="Có" active={rainAlerts} onPress={() => setRainAlerts(true)} />
        <Chip label="Không" active={!rainAlerts} onPress={() => setRainAlerts(false)} />
      </FormSection>
      <Text style={[styles.muted, { marginTop: -6, marginBottom: 12 }]}>Theo dữ liệu thời tiết tại vị trí vườn (15 phút / lần), hoặc máy đo mưa nếu vườn có lắp. Mỗi cơn mưa báo 1 lần.</Text>

      <FormSection label="☀️ Nhắc khi lâu ngày không mưa">
        {[0, 5, 7, 10, 14].map((n) => (
          <Chip key={n} small label={n === 0 ? 'Tắt' : `${n} ngày`} active={dryDays === n} onPress={() => setDryDays(n)} />
        ))}
      </FormSection>
      <Text style={[styles.muted, { marginTop: -6, marginBottom: 12 }]}>Mỗi sáng 7:00 xem lượng mưa tại vườn; khô liên tục đủ số ngày thì nhắc (kèm dự báo 3 ngày tới), khô tiếp thì 3 ngày nhắc lại.</Text>

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
