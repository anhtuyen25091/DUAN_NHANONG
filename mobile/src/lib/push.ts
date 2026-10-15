import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

export const ALERT_CHANNEL = 'price-alerts';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type PushResult = { ok: true } | { ok: false; reason: string };

/**
 * Xin quyền thông báo, lấy Expo push token và gửi lên server.
 * Thông báo đẩy cần máy thật + bản build (development build / EAS), không chạy trong Expo Go trên Android.
 */
export async function registerPush(askPermission: boolean): Promise<PushResult> {
  if (Platform.OS === 'web') return { ok: false, reason: 'Trình duyệt không hỗ trợ thông báo của app.' };

  if (Platform.OS === 'android') {
    // Backend gửi với channelId "price-alerts"
    await Notifications.setNotificationChannelAsync(ALERT_CHANNEL, {
      name: 'Báo giá',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  if (!Device.isDevice) return { ok: false, reason: 'Cần chạy trên điện thoại thật để nhận thông báo.' };

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && askPermission) {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') {
    return { ok: false, reason: 'Chưa cho phép thông báo. Vào Cài đặt của máy để bật cho Nhà Nông.' };
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return { ok: false, reason: 'App chưa được cấu hình EAS (thiếu projectId).' };

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.updateDevice(token, Platform.OS === 'ios' ? 'ios' : 'android');
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Không lấy được mã thông báo.' };
  }
}
