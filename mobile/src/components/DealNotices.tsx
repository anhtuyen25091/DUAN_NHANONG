import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dealWatcher, useDealWatch } from '../lib/dealWatch';
import { colors, font } from '../lib/theme';

/** Băng thông báo trên cùng màn hình khi bên kia vừa ghi / xác nhận đơn mua bán */
export function DealNotices() {
  const { notices } = useDealWatch();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (notices.length === 0) return;
    const timer = setTimeout(() => dealWatcher.dismiss(notices[notices.length - 1].id), 12_000);
    return () => clearTimeout(timer);
  }, [notices]);

  if (notices.length === 0) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, top: insets.top + 8, gap: 8 }}>
      {notices.slice(0, 3).map((n) => (
        <View
          key={n.id}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            borderRadius: 12,
            backgroundColor: colors.surface,
            borderLeftWidth: 5,
            borderLeftColor: colors.primary,
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${n.title}: ${n.text}. Bấm để xem`}
            onPress={() => {
              dealWatcher.dismiss(n.id);
              if (n.businessDealUuid) router.push({ pathname: '/business', params: { tab: 'deals' } });
              else if (n.businessPurchaseId) router.push({ pathname: '/trade/[id]', params: { id: n.businessPurchaseId } });
              else if (n.purchaseId) router.push({ pathname: '/trade/received/[id]', params: { id: n.purchaseId } });
              else if (n.dealUuid) router.push({ pathname: '/deals/[id]', params: { id: n.dealUuid } });
            }}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}
          >
            <Text style={{ fontSize: 22 }}>🔔</Text>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontSize: font.body, fontWeight: '700', color: colors.text }}>
                {n.title}
              </Text>
              <Text style={{ fontSize: font.small, color: colors.text }}>{n.text}</Text>
            </View>
          </Pressable>
          <Pressable onPress={() => dealWatcher.dismiss(n.id)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Đóng thông báo" style={{ padding: 12 }}>
            <Text style={{ fontSize: 18, color: colors.muted }}>✕</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
