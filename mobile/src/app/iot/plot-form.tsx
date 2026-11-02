import { type IotPlot, type IotPlotInput, type IotPlotType, type IotRole } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from '../../components/AppText';
import { FormInput, FormMessage, FormSection, NO_ERRORS, toFormErrors } from '../../components/iotForm';
import { Button, Card, Chip, Status, styles } from '../../components/ui';
import { confirmAsync } from '../../lib/confirm';
import { syncFarmWork } from '../../lib/farmwork';
import { iotApi } from '../../lib/iot';
import { useLedger } from '../../lib/ledger';
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
  const farmId = plot?.farm_id ?? Number(farm);
  return <PlotForm plot={plot} farmId={farmId} role={farms.state.data.find((f) => f.id === farmId)?.role ?? 'viewer'} />;
}

function PlotForm({ plot, farmId, role }: { plot?: IotPlot; farmId: number; role: IotRole }) {
  const ledger = useLedger();
  const gardens = ledger.ledger ? ledger.data.gardens : [];
  const [gardenId, setGardenId] = useState<string | null>(plot?.ledger_garden_id ?? null);
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
      const input: IotPlotInput = { name: name.trim(), type, crop: crop.trim() || null, area_m2: Number(area.replace(/\D/g, '')) || null };
      // Nối với vườn trong Sổ thu chi (chỉ chủ trang trại; vườn nằm trong sổ trên máy này)
      if (role === 'owner') {
        input.ledger_garden_id = gardenId;
        input.ledger_garden_name = gardenId ? (gardens.find((g) => g.id === gardenId)?.name ?? plot?.ledger_garden_name ?? null) : null;
      }
      if (plot) await iotApi.updatePlot(plot.id, input);
      else await iotApi.createPlot(farmId, input);
      if (role === 'owner' && gardenId && gardenId !== (plot?.ledger_garden_id ?? null)) void syncFarmWork(true);
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
      {role === 'owner' && (
        <Card>
          <Text style={[styles.body, { fontWeight: '700', marginBottom: 4 }]}>📒 Vườn trong Sổ thu chi</Text>
          <Text style={[styles.muted, { marginBottom: 8 }]}>
            Nối lô với vườn trong sổ: việc phun thuốc, bón phân… ghi ở lô tự vào Nhật ký canh tác của vườn, và ngược lại.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip small label="Không nối" active={gardenId === null} onPress={() => setGardenId(null)} />
            {gardens.map((g) => (
              <Chip key={g.id} small label={g.name} active={gardenId === g.id} onPress={() => setGardenId(g.id)} />
            ))}
            {gardenId && !gardens.some((g) => g.id === gardenId) && <Chip small label={plot?.ledger_garden_name ?? 'Vườn đã nối'} active onPress={() => {}} />}
          </View>
          {ledger.ledger && gardens.length === 0 && <Text style={[styles.muted, { marginTop: 8 }]}>Sổ thu chi trên máy này chưa có vườn. Thêm vườn trong mục Sổ thu chi trước.</Text>}
          {errors.fields.ledger_garden_id && <Text style={{ color: colors.error, marginTop: 4 }}>{errors.fields.ledger_garden_id[0]}</Text>}
        </Card>
      )}
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
