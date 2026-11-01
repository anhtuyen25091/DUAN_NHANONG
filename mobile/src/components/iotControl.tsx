import { ApiError, canControl, canManage, formatDecimal, timeAgo, type IotActuator, type IotPlotType, type IotRole } from '@nhanong/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { iotApi } from '../lib/iot';
import { colors, font } from '../lib/theme';
import { showToast } from '../lib/toast';
import { useAsync } from '../lib/useAsync';
import { SectionTitle } from './iot';
import { Button, Card, Chip, styles } from './ui';

const ICONS: Record<IotActuator['kind'], string> = { pump: '💧', aerator: '🌀', valve: '🚰', mister: '🌫️', light: '💡', other: '🔌' };
const DURATIONS = [15, 30, 60];

function timeOf(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Khu "Điều khiển" của 1 lô: bật / tắt máy bơm, quạt oxy…; lối vào luật tự động */
export function ControlSection({ plotId, plotName, plotType, farmId, role }: { plotId: number; plotName: string; plotType: IotPlotType; farmId: number; role: IotRole }) {
  const actuators = useAsync(() => iotApi.actuators(plotId), [plotId]);
  const list = actuators.state.status === 'ok' ? actuators.state.data : [];
  const waiting = list.some((a) => a.pending !== null);

  // Quay về từ màn thêm / sửa thiết bị: tải lại
  useFocusEffect(
    useCallback(() => {
      actuators.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  // Đang chờ mạch nhận lệnh: hỏi lại mỗi 3 giây để hiện "Đã bật"
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(actuators.refetch, 3000);
    return () => clearInterval(timer);
  }, [waiting, actuators.refetch]);

  if (!canManage(role) && list.length === 0) return null;

  return (
    <View>
      <SectionTitle text="⚙️ Điều khiển" />
      {actuators.state.status === 'error' && <Text style={[styles.muted, { marginBottom: 8 }]}>{actuators.state.error.message}</Text>}
      {actuators.state.status === 'ok' && list.length === 0 && canManage(role) && (
        <Card>
          <Text style={styles.body}>Chưa có máy bơm, quạt oxy… điều khiển được. Cần lắp mạch relay (ESP32) cắm điện tại {plotType === 'pond' ? 'ao' : 'ruộng / vườn'}.</Text>
        </Card>
      )}
      {list.map((actuator) => (
        <ActuatorCard key={actuator.id} actuator={actuator} role={role} onChanged={actuators.refetch} />
      ))}
      {canManage(role) && (
        <>
          <View style={{ marginBottom: 8 }}>
            <Button label="🗓️ Lịch tưới" variant="outline" onPress={() => router.push({ pathname: '/iot/schedules', params: { plot: String(plotId), name: plotName } })} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Button label="⚡ Luật tự động" variant="outline" onPress={() => router.push({ pathname: '/iot/rules', params: { plot: String(plotId), name: plotName, type: plotType } })} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="＋ Thêm máy bơm / quạt" variant="outline" onPress={() => router.push({ pathname: '/iot/actuator-form', params: { plot: String(plotId), farm: String(farmId) } })} />
            </View>
          </View>
        </>
      )}
    </View>
  );
}

function ActuatorCard({ actuator, role, onChanged }: { actuator: IotActuator; role: IotRole; onChanged: () => void }) {
  const [minutes, setMinutes] = useState(Math.min(30, actuator.max_minutes));
  const [busy, setBusy] = useState(false);
  const pending = actuator.pending;

  const send = async (action: 'on' | 'off') => {
    setBusy(true);
    try {
      await iotApi.command(actuator.id, action, action === 'on' ? minutes : undefined);
      onChanged();
    } catch (error) {
      showToast({ message: error instanceof ApiError ? error.message : 'Chưa gửi được lệnh.' });
    } finally {
      setBusy(false);
    }
  };

  const state = pending
    ? `⏳ Đang gửi lệnh ${pending.action === 'on' ? `bật ${pending.minutes} phút` : 'tắt'}… (mạch nhận trong vài giây)`
    : actuator.is_on
      ? `🟢 Đang chạy${actuator.auto_off_at ? `, tự tắt lúc ${timeOf(actuator.auto_off_at)}` : ''}`
      : `⚪ Đang tắt${actuator.state_changed_at ? ` (từ ${timeAgo(actuator.state_changed_at)})` : ''}`;

  return (
    <Card style={actuator.is_on ? { borderColor: colors.primary, borderWidth: 2 } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Text style={{ fontSize: 30 }}>{ICONS[actuator.kind]}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.body, { fontWeight: '700' }]}>{actuator.name}</Text>
          <Text style={styles.muted}>
            {actuator.kind_label} · {actuator.device_name}, kênh {actuator.channel}
          </Text>
        </View>
        {canManage(role) && (
          <Text
            onPress={() => router.push({ pathname: '/iot/actuator-form', params: { id: String(actuator.id), plot: String(actuator.plot_id ?? ''), farm: '' } })}
            accessibilityRole="button"
            style={{ color: colors.primary, fontWeight: '700', padding: 6 }}
          >
            Sửa
          </Text>
        )}
      </View>
      <Text style={{ fontSize: font.body, fontWeight: '600', color: pending ? '#7a4a00' : actuator.is_on ? colors.primary : colors.muted, marginBottom: 8 }}>{state}</Text>
      <Text
        onPress={() => router.push({ pathname: '/iot/history', params: { actuator: String(actuator.id), name: actuator.name } })}
        accessibilityRole="button"
        style={{ color: colors.primary, fontWeight: '600', marginBottom: 8 }}
      >
        🕘 Lịch sử bật / tắt
      </Text>
      {actuator.block && (
        <Text style={{ fontSize: font.small, color: colors.muted, marginBottom: 8 }}>
          🔒 Khóa an toàn: không bơm khi {actuator.block.metric_name} {actuator.block.operator === 'above' ? '>' : '<'} {formatDecimal(actuator.block.value)}
          {actuator.block.unit ? ` ${actuator.block.unit}` : ''} ({actuator.block.device_name})
        </Text>
      )}
      {!actuator.device_online && (
        <Text style={{ color: colors.error, fontSize: font.small, marginBottom: 8 }}>⚠️ Mạch điều khiển đang mất kết nối: lệnh sẽ hủy nếu 10 phút không nhận được.</Text>
      )}
      {canControl(role) && (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {DURATIONS.filter((d) => d <= actuator.max_minutes).map((d) => (
              <Chip key={d} small label={`${d} phút`} active={minutes === d} onPress={() => setMinutes(d)} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button label={`Bật ${minutes} phút`} onPress={() => send('on')} disabled={busy} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Tắt" variant="danger" onPress={() => send('off')} disabled={busy || (!actuator.is_on && pending?.action !== 'on')} />
            </View>
          </View>
        </>
      )}
    </Card>
  );
}
