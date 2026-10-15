import { formatVnd, SYNC_STATUS_LABELS, totals, type LedgerSnapshot } from '@nhanong/shared';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, Switch, Text, View } from 'react-native';
import { Button, Card, styles } from '../../components/ui';
import { useLedger } from '../../lib/ledger';
import { getSync, useSyncStatus } from '../../lib/sync';
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
    const synced = data.meta.storage_mode === 'sync';
    Alert.alert(
      'Xóa hết sổ trên máy này?',
      `${data.gardens.length} vườn, ${data.transactions.length} khoản (tiền ra ${formatVnd(t.expense)}). ` +
        (synced ? 'Sổ trên mạng vẫn giữ; máy này sẽ đăng xuất. Đăng nhập lại để lấy sổ về.' : 'Nên sao lưu ra file trước. Không hoàn tác được.'),
      [
        { text: 'Không', style: 'cancel' },
        {
          text: 'Xóa hết',
          style: 'destructive',
          onPress: async () => {
            // Đang lưu cả trên mạng: đăng xuất trên máy này, sổ trên mạng vẫn giữ
            if (synced) await getSync().disable(false);
            await ledger.reset();
            showToast({ message: 'Đã xóa hết sổ thu chi trên máy này.' });
          },
        },
      ],
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Stack.Screen options={{ title: 'Cài đặt sổ' }} />
      <StoragePlace data={data} />
      <Card>
        <Text style={heading}>Chế độ Nâng cao</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.body, { fontWeight: '700' }]}>Bật mùa vụ, kho vật tư, công nợ</Text>
            <Text style={[styles.muted, { marginTop: 2 }]}>Chia lời/lỗ theo vụ; mua phân thuốc về kho rồi ghi dùng cho vườn nào; ghi mua thiếu, bán chịu. Tắt đi thì dữ liệu vẫn giữ.</Text>
          </View>
          <Switch
            value={!!data.meta.advanced}
            onValueChange={(advanced) => ledger.setMeta({ advanced })}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor="#fff"
            accessibilityLabel="Bật chế độ Nâng cao"
          />
        </View>
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

function StoragePlace({ data }: { data: LedgerSnapshot }) {
  const status = useSyncStatus();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const account = data.meta.account;

  if (data.meta.storage_mode !== 'sync' || !account)
    return (
      <Card>
        <Text style={heading}>Nơi lưu</Text>
        <Text style={styles.body}>📱 Chỉ lưu trên điện thoại này</Text>
        <Text style={[styles.muted, { marginTop: 4, marginBottom: 10 }]}>Bật lưu cả trên mạng để đổi máy, mất máy không mất sổ. Cần số điện thoại.</Text>
        <Button label="☁️ Bật lưu cả trên mạng" onPress={() => router.push('/ledger/sign-in')} />
      </Card>
    );

  const switchToLocal = async (deleteFromServer: boolean) => {
    setBusy(true);
    try {
      await getSync().disable(deleteFromServer);
      setAsking(false);
      showToast({ message: deleteFromServer ? 'Đã xóa sổ trên mạng. Từ nay chỉ lưu trên máy này.' : 'Từ nay chỉ lưu trên máy này.' });
    } catch (error) {
      showToast({ message: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Text style={heading}>Nơi lưu</Text>
      <Text style={styles.body}>☁️ Lưu cả trên mạng</Text>
      <Text style={[styles.body, { marginTop: 4 }]}>
        Tài khoản: <Text style={{ fontWeight: '700' }}>{account.name}</Text>
        {account.phone ? ` · ${account.phone}` : ''}
      </Text>
      <Text style={[styles.muted, { marginVertical: 6 }]}>
        {SYNC_STATUS_LABELS[status]}
        {data.meta.last_synced_at ? ` · Lần cuối: ${new Date(data.meta.last_synced_at).toLocaleString('vi-VN')}` : ''}
      </Text>
      <View style={{ gap: 8 }}>
        {status === 'expired' ? (
          <Button label="Đăng nhập lại" onPress={() => router.push('/ledger/sign-in')} />
        ) : (
          <Button label="🔄 Đồng bộ ngay" variant="outline" disabled={status === 'syncing'} onPress={() => void getSync().syncNow()} />
        )}
        {!asking && <Button label="📱 Chuyển về chỉ lưu trên máy" variant="outline" onPress={() => setAsking(true)} />}
      </View>

      {asking && (
        <View style={{ marginTop: 12, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, gap: 8 }}>
          <Text style={[styles.body, { fontWeight: '700' }]}>Sổ đang lưu trên mạng thì sao?</Text>
          <Text style={styles.muted}>Sổ trên máy này vẫn giữ nguyên dù chọn cách nào.</Text>
          <Button label="Giữ lại trên mạng" variant="outline" disabled={busy} onPress={() => switchToLocal(false)} />
          <Button label="Xóa hẳn trên mạng" variant="danger" disabled={busy} onPress={() => switchToLocal(true)} />
          <Button label="Hủy" variant="outline" disabled={busy} onPress={() => setAsking(false)} />
        </View>
      )}
    </Card>
  );
}

const heading = { fontSize: font.body + 1, fontWeight: '700' as const, color: colors.text, marginBottom: 6 };
