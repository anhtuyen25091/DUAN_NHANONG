import { router, Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors } from '../../lib/theme';

const icon = (emoji: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>;
  };

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarLabelStyle: { fontSize: 13 },
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Bảng giá',
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
      <Tabs.Screen name="shops" options={{ title: 'Điểm bán · thu mua', tabBarLabel: 'Điểm bán', tabBarIcon: icon('🏪') }} />
      <Tabs.Screen name="alerts" options={{ title: 'Cảnh báo giá', tabBarLabel: 'Cảnh báo', tabBarIcon: icon('🔔') }} />
    </Tabs>
  );
}
