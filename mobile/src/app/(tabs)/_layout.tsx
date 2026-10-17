import { router, Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDealWatch } from '../../lib/dealWatch';
import { colors } from '../../lib/theme';

/** Khung biểu tượng tab: Android mặc định chỉ 24×24 nên phải nới ra (tabBarIconStyle) để emoji + nền không bị cắt */
const ICON_BOX = { width: 56, height: 32 };

const icon = (emoji: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    // Ô đang chọn có nền xanh nhạt quanh biểu tượng (dễ nhận ra mình đang ở đâu)
    return (
      <View style={{ ...ICON_BOX, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? colors.primarySoft : 'transparent' }}>
        <Text style={{ fontSize: 22, lineHeight: 28, textAlign: 'center', includeFontPadding: false, opacity: focused ? 1 : 0.65 }}>{emoji}</Text>
      </View>
    );
  };

export default function TabsLayout() {
  const { awaiting } = useDealWatch();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600', marginTop: 2 },
        tabBarIconStyle: ICON_BOX,
        // Biểu tượng 32 + chữ ~18 + lề: Android mặc định chỉ cao ~56 nên chữ bị đẩy mất; tính đủ chỗ + vùng thanh điều hướng của máy
        tabBarStyle: { height: 62 + insets.bottom, paddingTop: 6, paddingBottom: insets.bottom + 6 },
        tabBarLabelPosition: 'below-icon',
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text, fontWeight: '700' },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '🌾 Nhà Nông',
          tabBarLabel: 'Bảng giá',
          tabBarIcon: icon('🌾'),
          headerRight: () => (
            <Text accessibilityRole="button" accessibilityLabel="Tài khoản" onPress={() => router.push('/account')} style={{ color: colors.primary, fontSize: 16, padding: 12 }}>
              👤 Tài khoản
            </Text>
          ),
        }}
      />
      <Tabs.Screen
        name="ledger"
        options={{
          title: 'Sổ thu chi',
          tabBarIcon: icon('📒'),
          headerRight: () => (
            <Text accessibilityRole="button" onPress={() => router.push('/ledger/settings')} style={{ color: colors.primary, fontSize: 16, padding: 12 }}>
              ⚙️ Cài đặt
            </Text>
          ),
        }}
      />
      <Tabs.Screen
        name="deals"
        options={{ title: '🤝 Đơn mua bán', tabBarLabel: 'Đơn', tabBarIcon: icon('🤝'), tabBarBadge: awaiting > 0 ? awaiting : undefined }}
      />
      <Tabs.Screen name="shops" options={{ title: 'Điểm bán · thu mua', tabBarLabel: 'Điểm bán', tabBarIcon: icon('🏪') }} />
      <Tabs.Screen name="alerts" options={{ title: 'Cảnh báo giá', tabBarLabel: 'Cảnh báo', tabBarIcon: icon('🔔') }} />
    </Tabs>
  );
}
