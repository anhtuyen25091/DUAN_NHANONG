import { DOCUMENT_FORMAT_LABELS, type DocumentFormat, type DocumentTarget } from '@nhanong/shared';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { api } from '../lib/api';
import { Button, styles } from './ui';

/**
 * Tạo giấy tờ PDF / Word (phiếu, bảng kê, báo cáo) rồi mở bảng chia sẻ của máy:
 * gửi Zalo / Messenger, lưu vào Tệp, hoặc in qua máy in.
 */
export function PrintButtons({ token, target, label }: { token: string; target: DocumentTarget; label?: string }) {
  const [busy, setBusy] = useState<DocumentFormat | null>(null);

  const share = async (format: DocumentFormat) => {
    setBusy(format);
    try {
      const { data, filename, mime } = await api.downloadDocument(token, target, format);
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([data], { type: mime }));
        a.download = filename;
        a.click();
        return;
      }
      const file = new File(Paths.cache, filename);
      if (file.exists) file.delete();
      file.create();
      file.write(new Uint8Array(data));
      await Sharing.shareAsync(file.uri, {
        mimeType: mime,
        dialogTitle: `Gửi ${filename}`,
        UTI: format === 'pdf' ? 'com.adobe.pdf' : 'org.openxmlformats.wordprocessingml.document',
      });
    } catch (error) {
      Alert.alert('Chưa tạo được file', (error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      {label ? <Text style={styles.muted}>{label}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['pdf', 'docx'] as const).map((format) => (
          <View key={format} style={{ flex: 1 }}>
            <Button
              label={busy === format ? 'Đang tạo…' : `${format === 'pdf' ? '📄' : '📝'} Gửi ${DOCUMENT_FORMAT_LABELS[format]}`}
              variant={format === 'pdf' ? 'primary' : 'outline'}
              disabled={busy !== null}
              onPress={() => share(format)}
            />
          </View>
        ))}
      </View>
    </View>
  );
}
