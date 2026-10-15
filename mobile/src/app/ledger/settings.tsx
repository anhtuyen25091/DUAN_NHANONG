import { formatVnd, totals } from '@nhanong/shared';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, Text, View } from 'react-native';
import { Button, Card, styles } from '../../components/ui';
import { useLedger } from '../../lib/ledger';
import { colors, font } from '../../lib/theme';
import { showToast } from '../../lib/toast';

export default function LedgerSettingsScreen() {
  const state = useLedger();
  const [busy, setBusy] = useState(false);
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  const { ledger, data } = state;

  /** Ghi file JSON rồi mở bảng chia sẻ (gửi Zalo, lưu Drive…) */
  const exportFile = async () => {
    const json = JSON.stringify(ledger.exportBackup());
    const name = `so-thu-chi-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        a.download = name;
        a.click();
        return;
      }
      const file = new File(Paths.cache, name);
      if (file.exists) file.delete();
      file.create();
      file.write(json);
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Lưu file sao lưu sổ thu chi' });
    } catch (error) {
      Alert.alert('Không tạo được file sao lưu', (error as Error).message);
    }
  };

  const importFile = async () => {
    setBusy(true);
    try {
      const picked = await File.pickFileAsync({ mimeTypes: ['application/json', '*/*'] });
      if (picked.canceled) return;
      const changed = await ledger.importBackup(await picked.result.text());
      showToast({ message: changed ? `Đã nhập ${changed} mục từ file sao lưu.` : 'File này không có gì mới.' });
    } catch (error) {
      Alert.alert('Không nhập được', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const wipe = () => {
    const t = totals(data.transactions);
    Alert.alert(
      'Xóa hết sổ trên máy này?',
      `${data.gardens.length} vườn, ${data.transactions.length} khoản (tiền ra ${formatVnd(t.expense)}). Nên sao lưu ra file trước. Không hoàn tác được.`,
      [
        { text: 'Không', style: 'cancel' },
        { text: 'Xóa hết', style: 'destructive', onPress: () => ledger.reset().then(() => showToast({ message: 'Đã xóa hết sổ thu chi trên máy này.' })) },
      ],
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Stack.Screen options={{ title: 'Cài đặt sổ' }} />
      <Card>
        <Text style={heading}>Nơi lưu</Text>
        <Text style={styles.body}>{data.meta.storage_mode === 'sync' ? '☁️ Lưu cả trên mạng' : '📱 Chỉ lưu trên điện thoại này'}</Text>
        <Text style={[styles.muted, { marginTop: 4 }]}>Lưu cả trên mạng (đổi máy không mất) sẽ có ở bản sau.</Text>
      </Card>
      <Card>
        <Text style={heading}>Sao lưu</Text>
        <Text style={[styles.muted, { marginBottom: 10 }]}>Lưu sổ ra 1 file (gửi qua Zalo, lưu Google Drive…). Đổi máy thì nhập lại file này.</Text>
        <View style={{ gap: 8 }}>
          <Button label="⬇️ Lưu file sao lưu" onPress={exportFile} />
          <Button label={busy ? 'Đang nhập…' : '⬆️ Nhập từ file'} variant="outline" onPress={importFile} disabled={busy} />
        </View>
      </Card>
      <Card>
        <Text style={heading}>Xóa dữ liệu</Text>
        <Button label="Xóa hết sổ trên máy này" variant="outline" onPress={wipe} />
      </Card>
    </ScrollView>
  );
}

const heading = { fontSize: font.body + 1, fontWeight: '700' as const, color: colors.text, marginBottom: 6 };
