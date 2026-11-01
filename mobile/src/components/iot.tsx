import { formatIotValue, timeAgo, type IotAlert } from '@nhanong/shared';
import { useState } from 'react';
import { Text } from 'react-native';
import { iotApi } from '../lib/iot';
import { colors, font } from '../lib/theme';
import { Button, Card, styles } from './ui';

/** Cảnh báo cảm biến đang mở, có nút "Đã xử lý" (vd đã thay nước, bật quạt oxy) */
export function AlertCard({ alert, onResolved }: { alert: IotAlert; onResolved: () => void }) {
  const [busy, setBusy] = useState(false);
  const limit = alert.direction === 'below' ? `thấp hơn ${formatIotValue(alert.min ?? 0, alert.metric.unit)}` : `cao hơn ${formatIotValue(alert.max ?? 0, alert.metric.unit)}`;
  return (
    <Card style={{ borderLeftWidth: 6, borderLeftColor: colors.error }}>
      <Text style={[styles.body, { fontWeight: '700' }]}>
        {alert.plot.name}: {alert.metric.name} {formatIotValue(alert.value, alert.metric.unit)}
      </Text>
      <Text style={[styles.muted, { marginBottom: 8 }]}>
        {limit} · {timeAgo(alert.measured_at)} · {alert.device.name}
      </Text>
      <Button
        label={busy ? 'Đang lưu…' : '✓ Đã xử lý'}
        variant="outline"
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          await iotApi.resolveAlert(alert.id).catch(() => {});
          setBusy(false);
          onResolved();
        }}
      />
    </Card>
  );
}

export function SectionTitle({ text }: { text: string }) {
  return <Text style={{ fontSize: font.small, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.muted, marginTop: 8, marginBottom: 8, marginLeft: 4 }}>{text}</Text>;
}
