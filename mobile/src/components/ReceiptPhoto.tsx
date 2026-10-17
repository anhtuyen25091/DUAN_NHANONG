import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Image, Modal, Pressable, Text, View } from 'react-native';
import { photoUri, savePhoto } from '../lib/receipts';
import { colors, font } from '../lib/theme';
import { Button, styles } from './ui';

/** Ảnh hóa đơn đang gắn với khoản: ảnh thu nhỏ (bấm để xem to) + Xóa ảnh; chưa có thì nút Chụp / Chọn ảnh */
export function ReceiptPhoto({ photoId, onChange }: { photoId: string | null; onChange: (id: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(false);
  const uri = photoId ? photoUri(photoId) : null;

  const pick = async (camera: boolean) => {
    const permission = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Chưa được phép', camera ? 'Hãy cho phép app dùng máy ảnh trong Cài đặt.' : 'Hãy cho phép app xem ảnh trong Cài đặt.');
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
    const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    setBusy(true);
    try {
      onChange(await savePhoto(asset.uri, asset.width, asset.height));
    } catch (error) {
      Alert.alert('Không lưu được ảnh', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (photoId) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        {uri ? (
          <Pressable onPress={() => setViewing(true)} accessibilityLabel="Xem ảnh hóa đơn">
            <Image source={{ uri }} style={{ width: 88, height: 88, borderRadius: 10, borderWidth: 1, borderColor: colors.border }} />
          </Pressable>
        ) : (
          <Text style={[styles.muted, { flex: 1 }]}>📷 Ảnh đang ở máy khác, sẽ tải về khi đồng bộ</Text>
        )}
        <Button label="Xóa ảnh" variant="outline" onPress={() => onChange(null)} />
        <Modal visible={viewing} animationType="fade" onRequestClose={() => setViewing(false)}>
          <Pressable style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }} onPress={() => setViewing(false)}>
            {uri && <Image source={{ uri }} style={{ width: '100%', height: '85%' }} resizeMode="contain" />}
            <Text style={{ color: '#fff', textAlign: 'center', fontSize: font.body, marginTop: 12 }}>Chạm để đóng</Text>
          </Pressable>
        </Modal>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
      <Button label={busy ? 'Đang xử lý ảnh…' : '📷 Chụp hóa đơn'} variant="outline" disabled={busy} onPress={() => void pick(true)} />
      <Button label="🖼 Chọn ảnh" variant="outline" disabled={busy} onPress={() => void pick(false)} />
    </View>
  );
}
