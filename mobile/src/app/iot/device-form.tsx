import { normalizeDevEui, type IotDevice, type IotDeviceInput, type IotFarm } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Share, Text, View } from 'react-native';
import { FormInput, FormMessage, FormSection, NO_ERRORS, toFormErrors } from '../../components/iotForm';
import { Button, Card, Chip, Status, styles } from '../../components/ui';
import { confirmAsync } from '../../lib/confirm';
import { iotApi } from '../../lib/iot';
import { colors, font } from '../../lib/theme';
import { useAsync } from '../../lib/useAsync';

/** Thêm thiết bị (param farm, plot), hoặc sửa thiết bị (param id) */
export default function IotDeviceFormScreen() {
  const { id, farm, plot } = useLocalSearchParams<{ id?: string; farm?: string; plot?: string }>();
  const data = useAsync(() => Promise.all([iotApi.farms(), iotApi.devices(), iotApi.deviceProfiles()]), []);
  if (data.state.status !== 'ok') return <Status state={data.state} retry={data.reload} />;
  const [farms, devices, profiles] = data.state.data;
  const device = id ? devices.find((d) => d.id === Number(id)) : undefined;
  return <DeviceForm farms={farms} device={device} profiles={profiles.map((p) => ({ code: p.code, hint: p.metrics.join(', ') }))} farmId={device?.farm_id ?? Number(farm)} plotId={device ? device.plot_id : plot ? Number(plot) : null} />;
}

function DeviceForm({ farms, device, profiles, farmId, plotId: initialPlot }: { farms: IotFarm[]; device?: IotDevice; profiles: { code: string; hint: string }[]; farmId: number; plotId: number | null }) {
  const farm = farms.find((f) => f.id === farmId);
  const [name, setName] = useState(device?.name ?? '');
  const [kind, setKind] = useState<'esp32' | 'lorawan'>(device?.kind ?? 'esp32');
  const [plotId, setPlotId] = useState<number | null>(initialPlot);
  const [devEui, setDevEui] = useState(device?.dev_eui ?? '');
  const [profile, setProfile] = useState(device?.profile ?? 'generic');
  const [errors, setErrors] = useState(NO_ERRORS);
  const [busy, setBusy] = useState(false);
  // Khóa vừa tạo: chỉ hiện 1 lần
  const [created, setCreated] = useState<{ device: IotDevice; key: string } | null>(null);

  const input = (): IotDeviceInput => ({
    farm_id: farmId,
    plot_id: plotId,
    name: name.trim(),
    kind,
    profile: kind === 'lorawan' ? profile : 'generic',
    dev_eui: kind === 'lorawan' ? normalizeDevEui(devEui) || null : null,
  });

  const save = async () => {
    setBusy(true);
    setErrors(NO_ERRORS);
    try {
      if (device) {
        await iotApi.updateDevice(device.id, input());
        router.back();
      } else {
        const result = await iotApi.createDevice(input());
        if (kind === 'esp32') setCreated({ device: result.data, key: result.api_key });
        else router.back();
      }
    } catch (error) {
      setErrors(toFormErrors(error));
    } finally {
      setBusy(false);
    }
  };

  const rotate = async () => {
    if (!device) return;
    const ok = await confirmAsync('Tạo khóa mới?', 'Khóa cũ hết hiệu lực ngay. Thiết bị phải nạp khóa mới mới gửi được số đo.', 'Tạo khóa mới');
    if (!ok) return;
    await iotApi.rotateDeviceKey(device.id).then((r) => setCreated({ device: r.data, key: r.api_key }), (error) => setErrors(toFormErrors(error)));
  };

  const remove = async () => {
    if (!device) return;
    const ok = await confirmAsync('Xóa thiết bị?', `Xóa "${device.name}" cùng mọi số đo của thiết bị. Không lấy lại được.`);
    if (!ok) return;
    await iotApi.deleteDevice(device.id).then(() => router.back(), (error) => setErrors(toFormErrors(error)));
  };

  if (created) return <KeyPanel device={created.device} apiKey={created.key} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: device ? 'Sửa thiết bị' : 'Thêm thiết bị' }} />
      {device && <Text style={[styles.muted, { marginBottom: 12 }]}>Mã thiết bị: {device.uid}</Text>}
      <FormInput label="Tên thiết bị" value={name} onChange={setName} error={errors.fields.name} placeholder="VD: Đo nước ao 2" />
      <FormSection label="Kết nối" error={errors.fields.kind}>
        <Chip label="📶 WiFi / 4G (ESP32)" active={kind === 'esp32'} onPress={() => setKind('esp32')} />
        <Chip label="📡 LoRaWAN" active={kind === 'lorawan'} onPress={() => setKind('lorawan')} />
      </FormSection>
      <FormSection label={`Đặt ở lô (${farm?.name ?? ''})`} error={errors.fields.plot_id}>
        <Chip label="Chưa gán" active={plotId === null} onPress={() => setPlotId(null)} small />
        {farm?.plots.map((p) => (
          <Chip key={p.id} label={p.name} active={plotId === p.id} onPress={() => setPlotId(p.id)} small />
        ))}
      </FormSection>
      {kind === 'lorawan' && (
        <>
          <FormInput
            label="DevEUI"
            value={devEui}
            onChange={setDevEui}
            error={errors.fields.dev_eui}
            hint="16 ký tự in trên nhãn thiết bị, VD A8:40:41:00:01:81:C2:7A"
            autoCapitalize="characters"
          />
          <FormSection label="Dòng thiết bị" error={errors.fields.profile}>
            {profiles.map((p) => (
              <Chip key={p.code} label={p.code === 'generic' ? 'Khác (tự khai báo)' : p.code} active={profile === p.code} onPress={() => setProfile(p.code)} small />
            ))}
          </FormSection>
          <Text style={[styles.muted, { marginTop: -6, marginBottom: 12 }]}>{profiles.find((p) => p.code === profile)?.hint || 'Tên trường do decoder trả về phải trùng mã chỉ số (VD soil_ph, water_level).'}</Text>
        </>
      )}
      <FormMessage errors={errors} />
      <Button label={busy ? 'Đang lưu…' : 'Lưu'} onPress={save} disabled={busy || name.trim() === ''} />
      {device?.kind === 'esp32' && (
        <View style={{ marginTop: 12 }}>
          <Button label="🔑 Tạo khóa mới" onPress={rotate} variant="outline" />
        </View>
      )}
      {device && (
        <Text onPress={remove} accessibilityRole="button" style={{ color: colors.error, textAlign: 'center', padding: 16 }}>
          Xóa thiết bị
        </Text>
      )}
    </ScrollView>
  );
}

/** Mã + khóa để nạp vào firmware (config.h). Khóa chỉ hiện 1 lần. */
function KeyPanel({ device, apiKey }: { device: IotDevice; apiKey: string }) {
  const text = `Thiết bị: ${device.name}\nDEVICE_UID "${device.uid}"\nDEVICE_KEY "${apiKey}"`;
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Stack.Screen options={{ title: 'Khóa thiết bị' }} />
      <Card style={{ borderLeftWidth: 6, borderLeftColor: colors.star }}>
        <Text style={[styles.body, { fontWeight: '700', marginBottom: 6 }]}>Nạp 2 dòng này vào firmware (file config.h)</Text>
        <Text style={[styles.muted, { marginBottom: 10 }]}>Khóa chỉ hiện 1 lần. Lỡ mất thì vào Sửa thiết bị › Tạo khóa mới.</Text>
        <Text selectable style={{ fontFamily: 'monospace', fontSize: font.small + 1, color: colors.text, backgroundColor: colors.surface2, padding: 12, borderRadius: 10 }}>
          {`DEVICE_UID "${device.uid}"\nDEVICE_KEY "${apiKey}"`}
        </Text>
      </Card>
      <Button label="Gửi cho người lắp đặt (Zalo, tin nhắn…)" onPress={() => void Share.share({ message: text })} variant="outline" />
      <View style={{ height: 12 }} />
      <Button label="Xong" onPress={() => router.back()} />
    </ScrollView>
  );
}
