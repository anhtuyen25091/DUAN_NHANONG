import { formatIotValue, timeAgo, type IotAlert } from '@nhanong/shared';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { iotApi } from '../lib/iot';
import { colors, font } from '../lib/theme';
import { Button, Card, Chip, styles } from './ui';

/** Cảnh báo cảm biến đang mở, có nút "Đã xử lý" (vd đã thay nước, bật quạt oxy) */
export function AlertCard({ alert, canResolve = true, onResolved }: { alert: IotAlert; canResolve?: boolean; onResolved: () => void }) {
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
      {canResolve && (
        <Button
          label={busy ? 'Đang lưu…' : '✓ Đã xử lý'}
          variant="outline"
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await iotApi.resolveAlert(alert.id);
              onResolved();
            } catch (error) {
              Alert.alert('Chưa lưu được', (error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </Card>
  );
}

export function SectionTitle({ text }: { text: string }) {
  return <Text style={{ fontSize: font.small, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.muted, marginTop: 8, marginBottom: 8, marginLeft: 4 }}>{text}</Text>;
}

/** Tải số đo của lô ra Excel rồi mở bảng chia sẻ (gửi Zalo, lưu Drive, mở bằng Excel / Google Trang tính) */
export function ExportButton({ plotId, plotName }: { plotId: number; plotName: string }) {
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const { url, headers } = iotApi.exportRequest(plotId, days);
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? `Lỗi máy chủ (${response.status})`);
      const filename = /filename="?([^";]+)"?/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? `so-do-${plotId}.xlsx`;
      const data = await response.arrayBuffer();
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([data], { type: XLSX_MIME }));
        a.download = filename;
        a.click();
        return;
      }
      const file = new File(Paths.cache, filename);
      if (file.exists) file.delete();
      file.create();
      file.writeSync(new Uint8Array(data));
      await Sharing.shareAsync(file.uri, { mimeType: XLSX_MIME, dialogTitle: `Số đo ${plotName}`, UTI: 'org.openxmlformats.spreadsheetml.sheet' });
    } catch (error) {
      Alert.alert('Chưa tải được số liệu', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Text style={[styles.body, { fontWeight: '700', marginBottom: 6 }]}>📊 Tải số liệu (Excel)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {[7, 30, 90, 180].map((d) => (
          <Chip key={d} small label={`${d} ngày`} active={days === d} onPress={() => setDays(d)} />
        ))}
      </View>
      <Button label={busy ? 'Đang tải…' : `Tải ${days} ngày gần nhất`} variant="outline" onPress={download} disabled={busy} />
    </Card>
  );
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
