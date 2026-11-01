import { type IotPlot, type IotPlotType } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { FormInput, FormMessage, FormSection, NO_ERRORS, toFormErrors } from '../../components/iotForm';
import { Button, Chip, Status } from '../../components/ui';
import { confirmAsync } from '../../lib/confirm';
import { iotApi } from '../../lib/iot';
import { colors } from '../../lib/theme';
import { useAsync } from '../../lib/useAsync';

const TYPES: { value: IotPlotType; label: string }[] = [
  { value: 'field', label: '🌾 Ruộng' },
  { value: 'garden', label: '🌳 Vườn' },
  { value: 'pond', label: '🦐 Ao nuôi' },
  { value: 'greenhouse', label: '🏠 Nhà màng' },
  { value: 'other', label: 'Khác' },
];

/** Thêm lô vào trang trại (param farm), hoặc sửa lô (param id) */
export default function IotPlotFormScreen() {
  const { id, farm } = useLocalSearchParams<{ id?: string; farm?: string }>();
  const farms = useAsync(() => iotApi.farms(), []);
  if (farms.state.status !== 'ok') return <Status state={farms.state} retry={farms.reload} />;
  const plot = id ? farms.state.data.flatMap((f) => f.plots).find((p) => p.id === Number(id)) : undefined;
  return <PlotForm plot={plot} farmId={plot?.farm_id ?? Number(farm)} />;
}

function PlotForm({ plot, farmId }: { plot?: IotPlot; farmId: number }) {
  const [name, setName] = useState(plot?.name ?? '');
  const [type, setType] = useState<IotPlotType>(plot?.type ?? 'field');
  const [crop, setCrop] = useState(plot?.crop ?? '');
  const [area, setArea] = useState(plot?.area_m2 ? String(plot.area_m2) : '');
  const [errors, setErrors] = useState(NO_ERRORS);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setErrors(NO_ERRORS);
    try {
      const input = { name: name.trim(), type, crop: crop.trim() || null, area_m2: Number(area.replace(/\D/g, '')) || null };
      if (plot) await iotApi.updatePlot(plot.id, input);
      else await iotApi.createPlot(farmId, input);
      router.back();
    } catch (error) {
      setErrors(toFormErrors(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!plot) return;
    const ok = await confirmAsync('Xóa lô?', `Xóa "${plot.name}" và các ngưỡng cảnh báo của lô. Thiết bị trong lô vẫn giữ, chỉ bỏ gán lô.`);
    if (!ok) return;
    await iotApi.deletePlot(plot.id).then(() => router.dismissTo('/iot'), (error) => setErrors(toFormErrors(error)));
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: plot ? 'Sửa lô' : 'Thêm lô / ruộng / ao' }} />
      <FormInput label="Tên" value={name} onChange={setName} error={errors.fields.name} placeholder="VD: Ao tôm số 2" />
      <FormSection label="Loại" error={errors.fields.type}>
        {TYPES.map((t) => (
          <Chip key={t.value} label={t.label} active={type === t.value} onPress={() => setType(t.value)} />
        ))}
      </FormSection>
      <FormInput label={type === 'pond' ? 'Con nuôi' : 'Cây trồng'} value={crop} onChange={setCrop} error={errors.fields.crop} placeholder={type === 'pond' ? 'VD: Tôm thẻ' : 'VD: Lúa ST25'} />
      <FormInput label="Diện tích (m²)" value={area} onChange={setArea} error={errors.fields.area_m2} keyboardType="number-pad" />
      <FormMessage errors={errors} />
      <Button label={busy ? 'Đang lưu…' : 'Lưu'} onPress={save} disabled={busy || name.trim() === ''} />
      {plot && (
        <Text onPress={remove} accessibilityRole="button" style={{ color: colors.error, textAlign: 'center', padding: 16 }}>
          Xóa lô
        </Text>
      )}
    </ScrollView>
  );
}
