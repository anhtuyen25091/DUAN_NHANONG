import { Alert, Platform } from 'react-native';

/**
 * Hỏi lại trước khi xóa. Trên điện thoại dùng Alert; bản xem trước trên trình duyệt
 * dùng window.confirm vì Alert.alert của react-native-web không làm gì.
 */
export function confirmAsync(title: string, message: string, okLabel = 'Xóa'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Không', style: 'cancel', onPress: () => resolve(false) },
      { text: okLabel, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}
