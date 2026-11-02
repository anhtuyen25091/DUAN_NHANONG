import { canManage, describeRule, formatDecimal, parseDecimalInput, timeAgo, type IotActuator, type IotMetric, type IotPlotType, type IotRole, type IotRule } from '@nhanong/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SectionTitle } from '../../components/iot';
import { FormInput, FormMessage, FormSection, NO_ERRORS, toFormErrors } from '../../components/iotForm';
import { Button, Card, Chip, Status, styles } from '../../components/ui';
import { confirmAsync } from '../../lib/confirm';
import { iotApi } from '../../lib/iot';
import { colors } from '../../lib/theme';
import { useAsync } from '../../lib/useAsync';

const GROUPS: Record<IotPlotType, IotMetric['group'][]> = {
  pond: ['water'],
  field: ['water', 'soil'],
  garden: ['soil', 'weather'],
  greenhouse: ['soil', 'weather'],
  other: ['soil', 'water', 'weather'],
};

/** Luật tự động của 1 lô: số đo vượt mức thì tự bật / tắt máy */
export default function IotRulesScreen() {
  const { plot, name, type, role } = useLocalSearchParams<{ plot: string; name?: string; type?: IotPlotType; role?: IotRole }>();
  // Người dùng chung chỉ xem, không sửa
  const manage = canManage(role);
  const data = useAsync(() => Promise.all([iotApi.rules(Number(plot)), iotApi.actuators(Number(plot)), iotApi.metrics()]), [plot]);
  const [editing, setEditing] = useState<IotRule | 'new' | null>(null);

  if (data.state.status !== 'ok') return <Status state={data.state} retry={data.reload} />;
  const [rules, actuators, metrics] = data.state.data;

  if (editing && manage) {
    return (
      <RuleForm
        plotId={Number(plot)}
        rule={editing === 'new' ? undefined : editing}
        actuators={actuators}
        metrics={metrics.filter((m) => GROUPS[type ?? 'other'].includes(m.group))}
        onDone={() => {
          setEditing(null);
          data.refetch();
        }}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Stack.Screen options={{ title: `Luật tự động · ${name ?? 'lô'}` }} />
      <Text style={[styles.muted, { marginBottom: 8 }]}>
        Số đo vượt mức thì app tự bật máy và báo về điện thoại. Có thời gian nghỉ giữa 2 lần bật để máy không bật / tắt liên tục. Máy bạn bật tay thì luật không tự tắt.
      </Text>
      {!manage && <Text style={[styles.muted, { marginBottom: 8 }]}>🔒 Bạn đang xem trang trại được chia sẻ. Chỉ chủ trang trại được thêm / sửa / xóa.</Text>}
      {actuators.length === 0 && (
        <Card>
          <Text style={styles.body}>Lô chưa có thiết bị điều khiển. Thêm máy bơm / quạt oxy ở màn hình lô trước.</Text>
        </Card>
      )}
      <SectionTitle text="Đang có" />
      {rules.length === 0 && (
        <Card>
          <Text style={styles.body}>Chưa có luật nào.</Text>
        </Card>
      )}
      {rules.map((rule) => (
        <Pressable key={rule.id} disabled={!manage} onPress={() => setEditing(rule)} accessibilityRole="button">
          <Card style={!rule.enabled ? { opacity: 0.6 } : undefined}>
            <Text style={[styles.body, { fontWeight: '700' }]}>{describeRule(rule)}</Text>
            <Text style={styles.muted}>
              {rule.enabled ? 'Đang dùng' : 'Đang tạm tắt'} · nghỉ {rule.cooldown_minutes} phút giữa 2 lần
              {rule.last_triggered_at ? ` · chạy lần cuối ${timeAgo(rule.last_triggered_at)}` : ''}
            </Text>
          </Card>
        </Pressable>
      ))}
      {manage && actuators.length > 0 && <Button label="＋ Thêm luật" onPress={() => setEditing('new')} />}
    </ScrollView>
  );
}

function RuleForm({ plotId, rule, actuators, metrics, onDone }: { plotId: number; rule?: IotRule; actuators: IotActuator[]; metrics: IotMetric[]; onDone: () => void }) {
  const [metric, setMetric] = useState(rule?.metric.code ?? metrics.find((m) => m.code === 'water_do')?.code ?? metrics[0]?.code ?? '');
  const [operator, setOperator] = useState<'below' | 'above'>(rule?.operator ?? 'below');
  const [value, setValue] = useState(rule ? formatDecimal(rule.value) : '');
  const [offValue, setOffValue] = useState(rule?.off_value != null ? formatDecimal(rule.off_value) : '');
  const [actuatorId, setActuatorId] = useState(rule?.actuator.id ?? actuators[0]?.id);
  const [minutes, setMinutes] = useState(String(rule?.minutes ?? 60));
  const [cooldown, setCooldown] = useState(String(rule?.cooldown_minutes ?? 30));
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [errors, setErrors] = useState(NO_ERRORS);
  const [busy, setBusy] = useState(false);
  const unit = metrics.find((m) => m.code === metric)?.unit;

  const save = async () => {
    const v = parseDecimalInput(value);
    const off = parseDecimalInput(offValue);
    if (v === null || Number.isNaN(v) || Number.isNaN(off)) return setErrors({ fields: {}, message: 'Nhập mức bật là số, VD 4 hoặc 7,5.' });
    if (actuatorId === undefined) return;
    setBusy(true);
    setErrors(NO_ERRORS);
    try {
      const input = { metric, actuator_id: actuatorId, operator, value: v, off_value: off, minutes: Number(minutes) || 60, cooldown_minutes: Number(cooldown) || 30, enabled };
      if (rule) await iotApi.updateRule(rule.id, input);
      else await iotApi.createRule(plotId, input);
      onDone();
    } catch (error) {
      setErrors(toFormErrors(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!rule || !(await confirmAsync('Xóa luật?', describeRule(rule)))) return;
    await iotApi.deleteRule(rule.id).then(onDone, (error) => setErrors(toFormErrors(error)));
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: rule ? 'Sửa luật' : 'Thêm luật tự động' }} />
      <FormSection label="Khi chỉ số" error={errors.fields.metric}>
        {metrics.map((m) => (
          <Chip key={m.code} small label={m.name} active={metric === m.code} onPress={() => setMetric(m.code)} />
        ))}
      </FormSection>
      <FormSection label="Xuống thấp hay lên cao">
        <Chip label="Thấp hơn" active={operator === 'below'} onPress={() => setOperator('below')} />
        <Chip label="Cao hơn" active={operator === 'above'} onPress={() => setOperator('above')} />
      </FormSection>
      <FormInput label={`Mức bật${unit ? ` (${unit})` : ''}`} value={value} onChange={setValue} error={errors.fields.value} keyboardType="decimal-pad" placeholder="VD 4" />
      <FormSection label="Thì bật" error={errors.fields.actuator_id}>
        {actuators.map((a) => (
          <Chip key={a.id} small label={a.name} active={actuatorId === a.id} onPress={() => setActuatorId(a.id)} />
        ))}
      </FormSection>
      <FormInput label="Chạy (phút)" value={minutes} onChange={setMinutes} error={errors.fields.minutes} keyboardType="number-pad" />
      <FormInput
        label={`Tắt sớm khi trở lại mức${unit ? ` (${unit})` : ''}`}
        value={offValue}
        onChange={setOffValue}
        error={errors.fields.off_value}
        keyboardType="decimal-pad"
        placeholder="Bỏ trống: chạy đủ số phút"
        hint={operator === 'below' ? 'Phải lớn hơn mức bật, VD bật khi < 4 thì tắt khi ≥ 5' : 'Phải nhỏ hơn mức bật'}
      />
      <FormInput label="Nghỉ giữa 2 lần tự bật (phút)" value={cooldown} onChange={setCooldown} error={errors.fields.cooldown_minutes} keyboardType="number-pad" />
      <FormSection label="Trạng thái">
        <Chip label="Đang dùng" active={enabled} onPress={() => setEnabled(true)} />
        <Chip label="Tạm tắt" active={!enabled} onPress={() => setEnabled(false)} />
      </FormSection>
      <FormMessage errors={errors} />
      <Button label={busy ? 'Đang lưu…' : 'Lưu luật'} onPress={save} disabled={busy} />
      <View style={{ height: 12 }} />
      <Button label="Quay lại" variant="outline" onPress={onDone} />
      {rule && (
        <Text onPress={remove} accessibilityRole="button" style={{ color: colors.error, textAlign: 'center', padding: 16 }}>
          Xóa luật
        </Text>
      )}
    </ScrollView>
  );
}
