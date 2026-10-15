import { formatDateTime, formatNumber, type PriceAlert } from '@nhanong/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { Button, Card, Status, styles } from '../../components/ui';
import { api } from '../../lib/api';
import { registerPush, type PushResult } from '../../lib/push';
import { colors, font } from '../../lib/theme';
import { useAsync } from '../../lib/useAsync';

export default function AlertsScreen() {
  const alerts = useAsync(() => api.alerts(), []);
  const [push, setPush] = useState<PushResult | null>(null);

  // Quay lại tab này sau khi đặt cảnh báo ở trang mặt hàng: tải lại
  useFocusEffect(
    useCallback(() => {
      alerts.refetch();
      registerPush(false).then(setPush);
    }, [alerts.refetch]),
  );

  const remove = (alert: PriceAlert) =>
    Alert.alert('Xóa cảnh báo?', `${alert.product.name} – ${describe(alert)}`, [
      { text: 'Không', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () =>
          api.deleteAlert(alert.id).then(alerts.reload, (e: Error) => Alert.alert('Không xóa được', e.message)),
      },
    ]);

  const data = alerts.state.status === 'ok' ? alerts.state.data : [];

  return (
    <FlatList
      data={data}
      keyExtractor={(a) => String(a.id)}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={alerts.refreshing} onRefresh={alerts.reload} colors={[colors.primary]} />}
      ListHeaderComponent={
        <View style={{ marginBottom: 4 }}>
          {push && !push.ok && (
            <Card style={{ borderColor: colors.down }}>
              <Text style={[styles.body, { marginBottom: 8 }]}>Máy này chưa nhận được thông báo: {push.reason}</Text>
              <Button label="Bật thông báo" variant="outline" onPress={() => registerPush(true).then(setPush)} />
            </Card>
          )}
          {alerts.state.status !== 'ok' && <Status state={alerts.state} retry={alerts.reload} />}
          {alerts.state.status === 'ok' && data.length === 0 && (
            <Card>
              <Text style={styles.body}>Chưa có cảnh báo nào.</Text>
              <Text style={[styles.muted, { marginTop: 4 }]}>Mở một mặt hàng ở tab Bảng giá rồi bấm “Đặt cảnh báo giá”.</Text>
            </Card>
          )}
        </View>
      }
      renderItem={({ item }) => (
        <Card>
          <Pressable
            onPress={() => router.push({ pathname: '/product/[code]', params: { code: item.product.code, region: item.region?.code ?? '' } })}
          >
            <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text }}>{item.product.name}</Text>
            <Text style={styles.body}>
              {item.region?.name ?? 'Trung bình các vùng'} · {describe(item)}
            </Text>
            {item.last_notified_at && (
              <Text style={styles.muted}>Lần báo gần nhất: {formatDateTime(item.last_notified_at)}</Text>
            )}
          </Pressable>
          <View style={{ marginTop: 10, alignSelf: 'flex-start' }}>
            <Button label="Xóa" variant="outline" onPress={() => remove(item)} />
          </View>
        </Card>
      )}
    />
  );
}

function describe(alert: PriceAlert): string {
  return alert.threshold === null ? alert.condition_label : `${alert.condition_label} ${formatNumber(alert.threshold)} đ/${alert.product.unit}`;
}
