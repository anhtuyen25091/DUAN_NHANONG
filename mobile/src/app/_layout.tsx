import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { DealNotices } from '../components/DealNotices';
import { ToastHost } from '../components/ledger';
import { startDealWatch } from '../lib/dealWatch';
import { getAuth, subscribeAuth } from '../lib/auth';
import { openLedger } from '../lib/ledger';
import { onNotificationOpened, registerPush, type OpenedData } from '../lib/push';
import { colors } from '../lib/theme';

function openFromNotification(data: OpenedData) {
  // Thông báo nhắc hạn trả nợ: mở khoản nợ
  if (data?.dealId) {
    router.push({ pathname: '/deals/[id]', params: { id: data.dealId } });
  } else if (data?.purchaseId) {
    router.push({ pathname: '/trade/received/[id]', params: { id: data.purchaseId } });
  } else if (data?.debtId) {
    router.push({ pathname: '/ledger/debts/[id]', params: { id: data.debtId } });
  } else if (data?.product) {
    router.push({ pathname: '/product/[code]', params: { code: data.product, region: data.region ?? '' } });
  }
}

export default function RootLayout() {
  useEffect(() => startDealWatch(), []);
  useEffect(() => {
    // Token có thể đổi: cập nhật mỗi lần mở app, không hỏi quyền (chỉ hỏi khi người dùng đặt cảnh báo).
    // Máy không hỗ trợ (web, Expo Go trên Android) thì registerPush / onNotificationOpened không làm gì.
    registerPush(false).catch(() => {});
    // Đăng nhập / đăng xuất: gửi lại để máy gắn với (hoặc gỡ khỏi) tài khoản
    let lastToken = getAuth()?.token ?? null;
    const unsubscribeAuth = subscribeAuth(() => {
      const token = getAuth()?.token ?? null;
      if (token === lastToken) return;
      lastToken = token;
      // Vừa đăng nhập: hỏi quyền thông báo (để báo đơn / phiếu cả khi app đóng); đăng xuất: chỉ gỡ máy khỏi tài khoản
      registerPush(token !== null).catch(() => {});
    });

    // Mở sổ ngay khi mở app để đặt lại thông báo nhắc hạn trả nợ (nếu đã bật)
    openLedger().catch(() => {});

    // Bấm vào thông báo: mở trang mặt hàng / khoản nợ
    const unsubscribeOpened = onNotificationOpened(openFromNotification);
    return () => {
      unsubscribeOpened();
      unsubscribeAuth();
    };
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
        <Stack.Screen name="account" options={{ title: 'Tài khoản' }} />
        <Stack.Screen name="local-prices" options={{ title: '📍 Giá quanh tôi' }} />
        <Stack.Screen name="buyer" options={{ title: '🏪 Điểm mua đăng giá' }} />
        <Stack.Screen name="shop/new" options={{ title: 'Thêm điểm' }} />
        <Stack.Screen name="shop/remove" options={{ title: 'Xin gỡ điểm' }} />
        <Stack.Screen name="ledger/add" options={{ title: 'Ghi tiền' }} />
        <Stack.Screen name="ledger/entries" options={{ title: 'Tất cả khoản thu chi' }} />
        <Stack.Screen name="ledger/garden/[id]" options={{ title: '' }} />
        <Stack.Screen name="ledger/garden-form" options={{ title: 'Thêm vườn' }} />
        <Stack.Screen name="ledger/settings" options={{ title: 'Cài đặt sổ' }} />
        <Stack.Screen name="ledger/sign-in" options={{ title: 'Lưu cả trên mạng' }} />
        <Stack.Screen name="ledger/season-form" options={{ title: 'Vụ' }} />
        <Stack.Screen name="ledger/supplies/index" options={{ title: '📦 Kho vật tư' }} />
        <Stack.Screen name="ledger/supplies/form" options={{ title: 'Mua vật tư' }} />
        <Stack.Screen name="ledger/supplies/[id]" options={{ title: 'Vật tư' }} />
        <Stack.Screen name="ledger/debts/index" options={{ title: '🧾 Công nợ & tiền vay' }} />
        <Stack.Screen name="ledger/debts/form" options={{ title: 'Ghi nợ' }} />
        <Stack.Screen name="ledger/debts/[id]" options={{ title: 'Công nợ' }} />
        <Stack.Screen name="ledger/debts/party" options={{ title: 'Công nợ' }} />
        <Stack.Screen name="ledger/contracts/index" options={{ title: '🤝 Bán cho lái' }} />
        <Stack.Screen name="ledger/contracts/form" options={{ title: 'Nhận cọc của lái' }} />
        <Stack.Screen name="ledger/contracts/[id]" options={{ title: 'Bán cho lái' }} />
        <Stack.Screen name="ledger/contracts/cut-form" options={{ title: 'Ghi đợt cắt' }} />
        <Stack.Screen name="ledger/templates" options={{ title: '⭐ Khoản hay dùng' }} />
        <Stack.Screen name="ledger/custom-fields" options={{ title: '🏷️ Thông tin tự thêm' }} />
        <Stack.Screen name="ledger/harvest-form" options={{ title: '🌾 Ghi thu hoạch' }} />
        <Stack.Screen name="ledger/workers/index" options={{ title: '👷 Nhân công' }} />
        <Stack.Screen name="ledger/workers/form" options={{ title: 'Người làm' }} />
        <Stack.Screen name="ledger/workers/[id]" options={{ title: 'Người làm' }} />
        <Stack.Screen name="ledger/workers/work-day" options={{ title: '✅ Chấm công' }} />
        <Stack.Screen name="deals/new" options={{ title: 'Tạo đơn mua bán' }} />
        <Stack.Screen name="deals/join" options={{ title: '🔑 Nhập mã đơn / phiếu' }} />
        <Stack.Screen name="deals/[id]" options={{ title: 'Đơn mua bán' }} />
        <Stack.Screen name="deals/entry" options={{ title: 'Ghi mục' }} />
        <Stack.Screen name="trade/index" options={{ title: '📒 Sổ giao dịch' }} />
        <Stack.Screen name="trade/form" options={{ title: 'Phiếu mua / bán' }} />
        <Stack.Screen name="trade/[id]" options={{ title: 'Phiếu' }} />
        <Stack.Screen name="trade/customer/[id]" options={{ title: 'Khách hàng' }} />
        <Stack.Screen name="trade/received/[id]" options={{ title: '📄 Phiếu được gửi' }} />
        <Stack.Screen name="business/index" options={{ title: '🏢 Doanh nghiệp' }} />
      </Stack>
      <ToastHost />
      <DealNotices />
      <StatusBar style="dark" />
    </>
  );
}
