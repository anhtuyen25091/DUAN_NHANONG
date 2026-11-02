import { formatDecimal, isController, parseDecimalInput, type IotActuator, type IotActuatorKind, type IotDevice } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { Text } from '../../components/AppText';
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
  const controllers = devices.filter((d) => isController(d) && d.farm_id === farmId).sort((a, b) => Number(b.plot_id === Number(plot)) - Number(a.plot_id === Number(plot)));
  return <ActuatorForm actuator={actuator} controllers={controllers} sensors={devices.filter((d) => d.farm_id === farmId)} plotId={plot ? Number(plot) : null} />;
}

/** Chỉ số hay dùng làm khóa an toàn của máy bơm */
const BLOCK_METRICS = [
  { code: 'salinity', label: 'Độ mặn (‰)' },
  { code: 'water_ec', label: 'EC nước (µS/cm)' },
  { code: 'water_level', label: 'Mực nước (cm)' },
];

function ActuatorForm({ actuator, controllers, sensors, plotId }: { actuator?: IotActuator; controllers: IotDevice[]; sensors: IotDevice[]; plotId: number | null }) {
  const [deviceId, setDeviceId] = useState<number | null>(actuator?.device_id ?? controllers[0]?.id ?? null);
  const [name, setName] = useState(actuator?.name ?? '');
  const [kind, setKind] = useState<IotActuatorKind>(actuator?.kind ?? 'pump');
  const [channel, setChannel] = useState(String(actuator?.channel ?? 1));
  const [maxMinutes, setMaxMinutes] = useState(String(actuator?.max_minutes ?? 60));
  const [blockDeviceId, setBlockDeviceId] = useState<number | null>(actuator?.block?.device_id ?? null);
  const [blockMetric, setBlockMetric] = useState(actuator?.block?.metric ?? 'salinity');
  const [blockOperator, setBlockOperator] = useState<'above' | 'below'>(actuator?.block?.operator ?? 'above');
  const [blockValue, setBlockValue] = useState(actuator?.block ? formatDecimal(actuator.block.value) : '0,3');
  const [errors, setErrors] = useState(NO_ERRORS);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (deviceId === null) return;
    const value = parseDecimalInput(blockValue);
    if (blockDeviceId !== null && (value === null || Number.isNaN(value))) return setErrors({ fields: {}, message: 'Nhập mức chặn là số, VD 0,3.' });
    setBusy(true);
    setErrors(NO_ERRORS);
    try {
      const input = {
        name: name.trim(),
        kind,
        channel: Number(channel) || 0,
        plot_id: actuator?.plot_id ?? plotId,
        max_minutes: Number(maxMinutes) || 60,
        block_device_id: blockDeviceId,
        block_metric: blockDeviceId === null ? null : blockMetric,
        block_operator: blockDeviceId === null ? null : blockOperator,
        block_value: blockDeviceId === null ? null : value,
      };
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
          <Text style={styles.body}>Trang trại chưa có mạch điều khiển nào. Thêm thiết bị loại "WiFi / 4G (ESP32)" (mạch relay), hoặc LoRaWAN dòng "dragino-lt22222", rồi quay lại đây.</Text>
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
      <Card>
        <Text style={[styles.body, { fontWeight: '700', marginBottom: 4 }]}>🔒 Khóa an toàn (không bắt buộc)</Text>
        <Text style={[styles.muted, { marginBottom: 8 }]}>
          Theo một cảm biến đo nguồn nước: vượt mức thì không cho bơm (kể cả lịch tưới, luật tự động), đang chạy thì tự tắt. VD sầu riêng: nước tưới mặn trên 0,3‰ là không được tưới.
        </Text>
        <FormSection label="Cảm biến nguồn nước" error={errors.fields.block_device_id}>
          <Chip small label="Không dùng" active={blockDeviceId === null} onPress={() => setBlockDeviceId(null)} />
          {sensors.map((d) => (
            <Chip key={d.id} small label={d.name} active={blockDeviceId === d.id} onPress={() => setBlockDeviceId(d.id)} />
          ))}
        </FormSection>
        {blockDeviceId !== null && (
          <>
            <FormSection label="Chỉ số" error={errors.fields.block_metric}>
              {BLOCK_METRICS.map((m) => (
                <Chip key={m.code} small label={m.label} active={blockMetric === m.code} onPress={() => setBlockMetric(m.code)} />
              ))}
            </FormSection>
            <FormSection label="Chặn khi">
              <Chip small label="Cao hơn" active={blockOperator === 'above'} onPress={() => setBlockOperator('above')} />
              <Chip small label="Thấp hơn" active={blockOperator === 'below'} onPress={() => setBlockOperator('below')} />
            </FormSection>
            <FormInput label="Mức chặn" value={blockValue} onChange={setBlockValue} error={errors.fields.block_value} keyboardType="decimal-pad" hint="Mực nước: chọn 'Thấp hơn' để bơm không chạy khô khi hết nước." />
          </>
        )}
      </Card>

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
