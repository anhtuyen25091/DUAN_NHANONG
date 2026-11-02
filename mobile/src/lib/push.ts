import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api } from './api';
import { getAuth } from './auth';

export type NotificationsModule = typeof import('expo-notifications');

export const ALERT_CHANNEL = 'price-alerts';
/** Kênh cho thông báo đơn mua bán / phiếu (backend PushNotifier::CHANNEL) */
export const UPDATES_CHANNEL = 'updates';
/** Kênh cho cảnh báo cảm biến ruộng / ao (iot ExpoPushClient::CHANNEL) */
export const IOT_CHANNEL = 'iot-alerts';

let lastPushToken: string | null = null;

/** Expo push token lấy được ở lần registerPush gần nhất (để gửi cả cho máy chủ cảm biến) */
export function getLastPushToken(): string | null {
  return lastPushToken;
}

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

export type OpenedData =
  | {
      product?: string;
      region?: string | null;
      debtId?: string;
      dealId?: string;
      purchaseId?: string;
      /** Chủ doanh nghiệp: phiếu lái con lập (vd mua vượt giá chốt) */
      businessPurchaseId?: string;
      /** Lái: chủ vừa chốt giá mua */
      business?: string;
      /** Chào bán: lô hàng mới gần mình / có người trả giá / được chọn giá */
      offerId?: string;
      /** Cảm biến: số đo của lô vượt ngưỡng */
      iotPlotId?: number;
      iotAlertId?: number;
      /** Cảm biến: trời bắt đầu mưa tại trang trại */
      iotFarmId?: number;
      iotFarmName?: string;
    }
  | undefined;

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

  // Expo Go trên Android: tạo kênh có thể lỗi ở phía máy (NullPointerException) → bỏ qua, máy dùng kênh mặc định
  if (Platform.OS === 'android') await createChannels(Notifications).catch(() => {});

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
    lastPushToken = token;
    // Kèm token đăng nhập: máy gắn với tài khoản để nhận thông báo đơn / phiếu cả khi app đóng
    await api.updateDevice(token, Platform.OS === 'ios' ? 'ios' : 'android', getAuth()?.token ?? null);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Không lấy được mã thông báo.' };
  }
}

/** Kênh thông báo Android (đặt mức ưu tiên / rung cho từng loại) */
async function createChannels(N: NotificationsModule) {
  // Backend gửi với channelId "price-alerts"
  await N.setNotificationChannelAsync(ALERT_CHANNEL, {
    name: 'Báo giá',
    importance: N.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });
  await N.setNotificationChannelAsync(UPDATES_CHANNEL, {
    name: 'Đơn mua bán, phiếu',
    importance: N.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });
  await N.setNotificationChannelAsync(IOT_CHANNEL, {
    name: 'Cảnh báo cảm biến ruộng / ao',
    importance: N.AndroidImportance.HIGH,
    vibrationPattern: [0, 400, 200, 400],
  });
}
