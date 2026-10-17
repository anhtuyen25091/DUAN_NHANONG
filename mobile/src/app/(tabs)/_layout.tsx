import { router, Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useDealWatch } from '../../lib/dealWatch';
import { colors } from '../../lib/theme';

const icon = (emoji: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    // Ô đang chọn có nền xanh nhạt quanh biểu tượng (dễ nhận ra mình đang ở đâu)
    return (
      <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.6, backgroundColor: focused ? colors.primarySoft : 'transparent', borderRadius: 999, paddingHorizontal: 14, overflow: 'hidden' }}>
        {emoji}
      </Text>
    );
  };

export default function TabsLayout() {
  const { awaiting } = useDealWatch();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
        tabBarStyle: { height: 68, paddingTop: 6, paddingBottom: 8 },
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
