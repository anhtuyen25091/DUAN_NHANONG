import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api } from './api';
import { getAuth } from './auth';

export type NotificationsModule = typeof import('expo-notifications');

export const ALERT_CHANNEL = 'price-alerts';
/** Kênh cho thông báo đơn mua bán / phiếu (backend PushNotifier::CHANNEL) */
export const UPDATES_CHANNEL = 'updates';

/**
 * Lý do máy này không dùng được thông báo đẩy (null = dùng được).
 * Từ SDK 53, chỉ cần nạp expo-notifications trong Expo Go trên Android là báo lỗi và làm sập màn hình,
 * nên phải kiểm tra trước rồi mới nạp thư viện.
 */
export const notificationsUnsupported: string | null =
  Platform.OS === 'web'
    ? 'Trình duyệt không hỗ trợ thông báo của app.'
    : Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient
      ? 'Expo Go trên Android không nhận được thông báo đẩy. Cần cài bản build riêng của app.'
      : null;

let loaded: NotificationsModule | null = null;

/** Nạp expo-notifications khi cần (null nếu máy không hỗ trợ). Không import thư viện này ở đầu file nào khác. */
export function notifications(): NotificationsModule | null {
  if (notificationsUnsupported) return null;
  if (!loaded) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('expo-notifications') as NotificationsModule;
    loaded.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }
  return loaded;
}

export type OpenedData = { product?: string; region?: string | null; debtId?: string; dealId?: string; purchaseId?: string } | undefined;

/** Bấm vào thông báo (kể cả thông báo đã mở app từ trước): gọi onOpen với data; trả về hàm hủy */
export function onNotificationOpened(onOpen: (data: OpenedData) => void): () => void {
  const N = notifications();
  if (!N) return () => {};
  const read = (response: import('expo-notifications').NotificationResponse | null) => {
    if (response) onOpen(response.notification.request.content.data as OpenedData);
  };
  read(N.getLastNotificationResponse());
  const subscription = N.addNotificationResponseReceivedListener(read);
  return () => subscription.remove();
}

export type PushResult = { ok: true } | { ok: false; reason: string };

/**
 * Xin quyền thông báo, lấy Expo push token và gửi lên server.
 * Thông báo đẩy cần máy thật + bản build (development build / EAS), không chạy trong Expo Go trên Android.
 */
export async function registerPush(askPermission: boolean): Promise<PushResult> {
  const Notifications = notifications();
  if (!Notifications) return { ok: false, reason: notificationsUnsupported! };

  if (Platform.OS === 'android') {
    // Backend gửi với channelId "price-alerts"
    await Notifications.setNotificationChannelAsync(ALERT_CHANNEL, {
      name: 'Báo giá',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
    await Notifications.setNotificationChannelAsync(UPDATES_CHANNEL, {
      name: 'Đơn mua bán, phiếu',
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
    // Kèm token đăng nhập: máy gắn với tài khoản để nhận thông báo đơn / phiếu cả khi app đóng
    await api.updateDevice(token, Platform.OS === 'ios' ? 'ios' : 'android', getAuth()?.token ?? null);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Không lấy được mã thông báo.' };
  }
}
