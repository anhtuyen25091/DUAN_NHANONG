import { BeVietnamPro_400Regular } from '@expo-google-fonts/be-vietnam-pro/400Regular';
import { BeVietnamPro_500Medium } from '@expo-google-fonts/be-vietnam-pro/500Medium';
import { BeVietnamPro_600SemiBold } from '@expo-google-fonts/be-vietnam-pro/600SemiBold';
import { BeVietnamPro_700Bold } from '@expo-google-fonts/be-vietnam-pro/700Bold';
import { BeVietnamPro_800ExtraBold } from '@expo-google-fonts/be-vietnam-pro/800ExtraBold';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { gradientHeader } from '../components/Gradient';
import { StatusBar } from 'expo-status-bar';
import { Fragment, useEffect, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { DealNotices } from '../components/DealNotices';
import { ToastHost } from '../components/ledger';
import { startDealWatch } from '../lib/dealWatch';
import { startPurchaseOutbox } from '../lib/outbox';
import { getAuth, subscribeAuth } from '../lib/auth';
import { openLedger } from '../lib/ledger';
import { syncIotPush } from '../lib/iot';
import { onNotificationOpened, registerPush, type OpenedData } from '../lib/push';
import { applyScheme, brandGradient, colors, fontFamilyFor, fontStyle, setFontsReady, type Scheme } from '../lib/theme';

function openFromNotification(data: OpenedData) {
  // Thông báo nhắc hạn trả nợ: mở khoản nợ
  if (data?.iotFarmId) {
    router.push({ pathname: '/iot/weather', params: { farm: String(data.iotFarmId), name: data.iotFarmName ?? '' } });
  } else if (data?.iotPlotId) {
    router.push({ pathname: '/iot/plot/[id]', params: { id: String(data.iotPlotId) } });
  } else if (data?.dealId) {
    router.push({ pathname: '/deals/[id]', params: { id: data.dealId } });
  } else if (data?.offerId) {
    router.push({ pathname: '/offers/[id]', params: { id: data.offerId } });
  } else if (data?.businessPurchaseId) {
    router.push({ pathname: '/trade/[id]', params: { id: data.businessPurchaseId } });
  } else if (data?.business) {
    router.push('/business');
  } else if (data?.purchaseId) {
    router.push({ pathname: '/trade/received/[id]', params: { id: data.purchaseId } });
  } else if (data?.debtId) {
    router.push({ pathname: '/ledger/debts/[id]', params: { id: data.debtId } });
  } else if (data?.product) {
    router.push({ pathname: '/product/[code]', params: { code: data.product, region: data.region ?? '' } });
  }
}

// Giữ màn hình chờ đến khi nạp xong phông (tránh chữ nhảy từ phông hệ thống sang Be Vietnam Pro)
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  // Chỉ nạp các độ đậm app dùng; mỗi độ đậm là một họ phông riêng (xem fontFamilyFor trong lib/theme)
  const [fontsLoaded, fontError] = useFonts({
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
    BeVietnamPro_800ExtraBold,
  });
  const ready = fontsLoaded || !!fontError;
  // Nạp lỗi thì dùng phông hệ thống
  setFontsReady(fontsLoaded);

  // Sáng / tối theo cài đặt của máy: đổi bảng màu ngay trong lúc dựng, trước khi các màn hình con đọc colors
  const scheme: Scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  applyScheme(scheme);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  useEffect(() => {
    // Nền gốc của app (lộ ra khi chuyển trang, bàn phím mở…) theo bảng màu
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
  }, [scheme]);

  if (!ready) return null;
  return <App scheme={scheme} />;
}

function App({ scheme }: { scheme: Scheme }) {
  useEffect(() => startDealWatch(), []);
  useEffect(() => startPurchaseOutbox(), []);
  useEffect(() => {
    // Token có thể đổi: cập nhật mỗi lần mở app, không hỏi quyền (chỉ hỏi khi người dùng đặt cảnh báo).
    // Máy không hỗ trợ (web, Expo Go trên Android) thì registerPush / onNotificationOpened không làm gì.
    // Đã đăng nhập tài khoản cảm biến: gửi token cho máy chủ cảm biến để nhận cảnh báo vượt ngưỡng
    registerPush(false)
      .then(syncIotPush)
      .catch(() => {});
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

  // Thanh điều hướng của react-navigation (nền màn hình, chữ, phông) theo bảng màu + phông của app
  const navTheme = useMemo<Theme>(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      dark: scheme === 'dark',
      colors: { ...base.colors, primary: colors.primary, background: colors.bg, card: colors.surface, text: colors.text, border: colors.border, notification: colors.loss },
      fonts: {
        regular: { ...base.fonts.regular, ...fontStyle('400') },
        medium: { ...base.fonts.medium, ...fontStyle('500') },
        bold: { ...base.fonts.bold, ...fontStyle('600') },
        heavy: { ...base.fonts.heavy, ...fontStyle('700') },
      } as Theme['fonts'],
    };
  }, [scheme]);

  return (
    <ThemeProvider value={navTheme}>
      <Stack
        // Đổi sáng / tối: dựng lại từng màn hình (giữ nguyên trang đang mở) để các style đọc màu mới
        screenLayout={({ children }: { children: ReactNode }) => <Fragment key={scheme}>{children}</Fragment>}
        screenOptions={{
          headerStyle: { backgroundColor: brandGradient[1] },
          headerBackground: gradientHeader,
          headerTintColor: '#fff',
          headerTitleStyle: { color: '#fff', ...fontStyle('700') },
          contentStyle: { backgroundColor: colors.bg },
          headerBackTitle: 'Quay lại',
          headerBackTitleStyle: { fontFamily: fontFamilyFor('400') ?? undefined },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="product/[code]" options={{ title: '' }} />
        <Stack.Screen name="account" options={{ title: 'Tài khoản' }} />
        <Stack.Screen name="forgot-password" options={{ title: 'Quên mật khẩu' }} />
        <Stack.Screen name="local-prices" options={{ title: '📍 Giá quanh tôi' }} />
        <Stack.Screen name="iot/index" options={{ title: '📡 Cảm biến ruộng · ao' }} />
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
        <Stack.Screen name="ledger/farm-log-form" options={{ title: '📓 Ghi việc' }} />
        <Stack.Screen name="ledger/farm-log-book" options={{ title: '📓 Nhật ký canh tác' }} />
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
        <Stack.Screen name="offers/index" options={{ title: '📣 Chào bán lô hàng' }} />
        <Stack.Screen name="offers/form" options={{ title: '📣 Chào bán lô hàng' }} />
        <Stack.Screen name="offers/[id]" options={{ title: 'Lô hàng' }} />
      </Stack>
      <Fragment key={scheme}>
        <ToastHost />
        <DealNotices />
      </Fragment>
      {/* Đầu trang luôn là dải xanh đậm (cả chế độ tối) → chữ thanh trạng thái màu trắng */}
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
