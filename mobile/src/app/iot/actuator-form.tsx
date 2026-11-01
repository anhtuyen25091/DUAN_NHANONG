import { type IotActuator, type IotActuatorKind, type IotDevice } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { FormInput, FormMessage, FormSection, NO_ERRORS, toFormErrors } from '../../components/iotForm';
import { Button, Card, Chip, Status, styles } from '../../components/ui';
import { confirmAsync } from '../../lib/confirm';
import { iotApi } from '../../lib/iot';
import { colors } from '../../lib/theme';
import { useAsync } from '../../lib/useAsync';

const KINDS: { value: IotActuatorKind; label: string }[] = [
  { value: 'pump', label: '💧 Máy bơm' },
  { value: 'aerator', label: '🌀 Quạt oxy' },
  { value: 'valve', label: '🚰 Van / cống' },
  { value: 'mister', label: '🌫️ Phun sương' },
  { value: 'light', label: '💡 Đèn' },
  { value: 'other', label: '🔌 Khác' },
];

/** Thêm thiết bị điều khiển (param plot, farm) hoặc sửa (param id) */
export default function IotActuatorFormScreen() {
  const { id, plot, farm } = useLocalSearchParams<{ id?: string; plot?: string; farm?: string }>();
  const data = useAsync(() => Promise.all([iotApi.devices(), plot ? iotApi.actuators(Number(plot)) : Promise.resolve([])]), [plot]);
  if (data.state.status !== 'ok') return <Status state={data.state} retry={data.reload} />;
  const [devices, actuators] = data.state.data;
  const actuator = id ? actuators.find((a) => a.id === Number(id)) : undefined;
  const farmId = actuator ? devices.find((d) => d.id === actuator.device_id)?.farm_id : Number(farm);
  // Mạch điều khiển: thiết bị ESP32 cùng trang trại (ưu tiên mạch đặt ở lô này)
  const controllers = devices.filter((d) => d.kind === 'esp32' && d.farm_id === farmId).sort((a, b) => Number(b.plot_id === Number(plot)) - Number(a.plot_id === Number(plot)));
  return <ActuatorForm actuator={actuator} controllers={controllers} plotId={plot ? Number(plot) : null} />;
}

function ActuatorForm({ actuator, controllers, plotId }: { actuator?: IotActuator; controllers: IotDevice[]; plotId: number | null }) {
  const [deviceId, setDeviceId] = useState<number | null>(actuator?.device_id ?? controllers[0]?.id ?? null);
  const [name, setName] = useState(actuator?.name ?? '');
  const [kind, setKind] = useState<IotActuatorKind>(actuator?.kind ?? 'pump');
  const [channel, setChannel] = useState(String(actuator?.channel ?? 1));
  const [maxMinutes, setMaxMinutes] = useState(String(actuator?.max_minutes ?? 60));
  const [errors, setErrors] = useState(NO_ERRORS);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (deviceId === null) return;
    setBusy(true);
    setErrors(NO_ERRORS);
    try {
      const input = { name: name.trim(), kind, channel: Number(channel) || 0, plot_id: actuator?.plot_id ?? plotId, max_minutes: Number(maxMinutes) || 60 };
      if (actuator) await iotApi.updateActuator(actuator.id, input);
      else await iotApi.createActuator(deviceId, input);
      router.back();
    } catch (error) {
      setErrors(toFormErrors(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!actuator || !(await confirmAsync('Xóa thiết bị điều khiển?', `Xóa "${actuator.name}" và các luật tự động dùng nó.`))) return;
    await iotApi.deleteActuator(actuator.id).then(() => router.back(), (error) => setErrors(toFormErrors(error)));
  };

  if (controllers.length === 0 && !actuator) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Stack.Screen options={{ title: 'Thêm thiết bị điều khiển' }} />
        <Card>
          <Text style={styles.body}>Trang trại chưa có mạch ESP32 nào. Thêm thiết bị loại "WiFi / 4G (ESP32)" cho mạch relay trước, rồi quay lại đây.</Text>
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: actuator ? 'Sửa thiết bị điều khiển' : 'Thêm thiết bị điều khiển' }} />
      <FormInput label="Tên" value={name} onChange={setName} error={errors.fields.name} placeholder="VD: Quạt oxy góc ao" />
      <FormSection label="Loại" error={errors.fields.kind}>
        {KINDS.map((k) => (
          <Chip key={k.value} small label={k.label} active={kind === k.value} onPress={() => setKind(k.value)} />
        ))}
      </FormSection>
      {!actuator && (
        <FormSection label="Mạch điều khiển (relay)">
          {controllers.map((d) => (
            <Chip key={d.id} small label={d.name} active={deviceId === d.id} onPress={() => setDeviceId(d.id)} />
          ))}
        </FormSection>
      )}
      <FormInput label="Kênh relay" value={channel} onChange={setChannel} error={errors.fields.channel} keyboardType="number-pad" hint="Số in cạnh ổ cắm relay trên mạch (1, 2, 3…)" />
      <FormInput
        label="Chạy tối đa mỗi lần (phút)"
        value={maxMinutes}
        onChange={setMaxMinutes}
        error={errors.fields.max_minutes}
        keyboardType="number-pad"
        hint="Mạch tự tắt khi hết giờ, kể cả lúc mất mạng (an toàn cho máy bơm)."
      />
      <FormMessage errors={errors} />
      <Button label={busy ? 'Đang lưu…' : 'Lưu'} onPress={save} disabled={busy || name.trim() === '' || deviceId === null} />
      {actuator && (
        <Text onPress={remove} accessibilityRole="button" style={{ color: colors.error, textAlign: 'center', padding: 16 }}>
          Xóa thiết bị điều khiển
        </Text>
      )}
    </ScrollView>
  );
}
