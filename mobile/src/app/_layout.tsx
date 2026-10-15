import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { ToastHost } from '../components/ledger';
import { registerPush } from '../lib/push';
import { colors } from '../lib/theme';

function openFromNotification(response: Notifications.NotificationResponse | null) {
  const data = response?.notification.request.content.data as { product?: string; region?: string | null } | undefined;
  if (data?.product) {
    router.push({ pathname: '/product/[code]', params: { code: data.product, region: data.region ?? '' } });
  }
}

export default function RootLayout() {
  useEffect(() => {
    // Bản xem trước trên trình duyệt không có thông báo đẩy
    if (Platform.OS === 'web') return;

    // Token có thể đổi: cập nhật mỗi lần mở app, không hỏi quyền (chỉ hỏi khi người dùng đặt cảnh báo)
    registerPush(false).catch(() => {});

    // Bấm vào thông báo: mở trang mặt hàng
    openFromNotification(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(openFromNotification);
    return () => subscription.remove();
  }, []);

  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.text },
          contentStyle: { backgroundColor: colors.bg },
          headerBackTitle: 'Quay lại',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="product/[code]" options={{ title: '' }} />
        <Stack.Screen name="shop/new" options={{ title: 'Thêm điểm' }} />
        <Stack.Screen name="ledger/add" options={{ title: 'Ghi tiền' }} />
        <Stack.Screen name="ledger/garden/[id]" options={{ title: '' }} />
        <Stack.Screen name="ledger/garden-form" options={{ title: 'Thêm vườn' }} />
        <Stack.Screen name="ledger/settings" options={{ title: 'Cài đặt sổ' }} />
        <Stack.Screen name="ledger/sign-in" options={{ title: 'Lưu cả trên mạng' }} />
        <Stack.Screen name="ledger/season-form" options={{ title: 'Vụ' }} />
        <Stack.Screen name="ledger/supplies/index" options={{ title: '📦 Kho vật tư' }} />
        <Stack.Screen name="ledger/supplies/form" options={{ title: 'Mua vật tư' }} />
        <Stack.Screen name="ledger/supplies/[id]" options={{ title: 'Vật tư' }} />
        <Stack.Screen name="ledger/debts/index" options={{ title: '🧾 Công nợ' }} />
        <Stack.Screen name="ledger/debts/form" options={{ title: 'Ghi nợ' }} />
        <Stack.Screen name="ledger/debts/[id]" options={{ title: 'Công nợ' }} />
      </Stack>
      <ToastHost />
      <StatusBar style="dark" />
    </>
  );
}
