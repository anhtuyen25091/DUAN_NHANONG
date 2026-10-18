import { router, Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDealWatch } from '../../lib/dealWatch';
import { gradientHeader } from '../../components/Gradient';
import { colors, shadow } from '../../lib/theme';

/** Khung biểu tượng tab: Android mặc định chỉ 24×24 nên phải nới ra (tabBarIconStyle) để emoji + nền không bị cắt */
const ICON_BOX = { width: 56, height: 32 };

/** Nút chữ trên đầu trang xanh: viên thuốc trắng mờ */
const HEADER_ACTION = { color: '#fff', fontSize: 15, fontWeight: '700', paddingVertical: 6, paddingHorizontal: 12, marginRight: 10, borderRadius: 999, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.18)' } as const;

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
        // Biểu tượng 32 + chữ ~18 + lề của ô (~10): Android mặc định chỉ cao ~56 nên chữ bị đẩy mất; tính đủ chỗ + vùng thanh điều hướng của máy
        tabBarStyle: {
          height: 76 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + 8,
          borderTopWidth: 0,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          backgroundColor: colors.surface,
          ...shadow,
          shadowOffset: { width: 0, height: -4 },
          elevation: 12,
        },
        tabBarLabelPosition: 'below-icon',
        headerStyle: { backgroundColor: colors.primary },
        headerBackground: gradientHeader,
        headerTintColor: '#fff',
        headerTitleStyle: { color: '#fff', fontWeight: '800', fontSize: 19 },
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
            <Text accessibilityRole="button" accessibilityLabel="Tài khoản" onPress={() => router.push('/account')} style={HEADER_ACTION}>
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
            <Text accessibilityRole="button" onPress={() => router.push('/ledger/settings')} style={HEADER_ACTION}>
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
