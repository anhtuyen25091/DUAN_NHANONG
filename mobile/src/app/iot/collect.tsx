import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from '../../components/AppText';
import { Button, Card, styles } from '../../components/ui';
import { collectFromDevice, flushDeviceFiles, type PendingDeviceFile } from '../../lib/iot';
import { colors, font } from '../../lib/theme';

const STEPS = [
  'Bấm nút BOOT trên mạch thiết bị (giữ 1 giây). Thiết bị phát WiFi trong 10 phút.',
  'Vào Cài đặt WiFi của điện thoại, chọn mạng "NHANONG-…" (mật khẩu ghi trên thiết bị).',
  'Tắt dữ liệu di động (4G) trong lúc lấy, để điện thoại không bỏ qua WiFi của thiết bị.',
  'Quay lại đây, bấm "Lấy dữ liệu".',
];

/** Ruộng không có mạng: điện thoại vào WiFi của thiết bị, tải file số đo, về nơi có mạng thì app tự gửi */
export default function IotCollectScreen() {
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<PendingDeviceFile | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const collect = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await collectFromDevice();
      setFile(result);
      setMessage(
        result.rows === 0
          ? { text: `Thiết bị ${result.uid} không còn số đo nào chưa gửi.`, error: false }
          : { text: `Đã lưu ${result.rows} số đo của thiết bị ${result.uid} vào điện thoại.`, error: false },
      );
    } catch (error) {
      setMessage({ text: (error as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setBusy(true);
    const result = await flushDeviceFiles();
    setBusy(false);
    setMessage(
      result.failed
        ? { text: `Chưa gửi được: ${result.failed} App sẽ tự gửi lại khi bạn mở mục Cảm biến lúc có mạng.`, error: true }
        : { text: `Đã gửi xong, máy chủ nhận ${result.accepted} số đo mới.`, error: false },
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Stack.Screen options={{ title: '📥 Lấy dữ liệu từ thiết bị' }} />
      <Card>
        {STEPS.map((step, i) => (
          <View key={step} style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
            <Text style={{ fontSize: font.body, fontWeight: '800', color: colors.primary, width: 22 }}>{i + 1}.</Text>
            <Text style={[styles.body, { flex: 1 }]}>{step}</Text>
          </View>
        ))}
        <Button label={busy ? 'Đang lấy…' : 'Lấy dữ liệu'} onPress={collect} disabled={busy} />
      </Card>

      {message && (
        <Card style={{ borderLeftWidth: 6, borderLeftColor: message.error ? colors.error : colors.primary }}>
          <Text style={[styles.body, message.error && { color: colors.error }]}>{message.text}</Text>
        </Card>
      )}

      {file && file.rows > 0 && (
        <Card>
          <Text style={[styles.body, { marginBottom: 8 }]}>
            Xong việc ở ruộng: tắt WiFi của thiết bị, bật lại 4G rồi bấm gửi. Không gửi ngay cũng được, app giữ dữ liệu và tự gửi sau.
          </Text>
          <Button label={busy ? 'Đang gửi…' : 'Gửi lên máy chủ'} onPress={send} disabled={busy} variant="outline" />
        </Card>
      )}
    </ScrollView>
  );
}
