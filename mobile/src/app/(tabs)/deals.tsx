import { formatVnd, type Deal } from '@nhanong/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { DealsSignIn, Notice, Tag } from '../../components/deals';
import { Button, Card, Chip, Status, styles } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { counterpartName } from '../../lib/deals';
import { colors, font } from '../../lib/theme';
import { useAsync } from '../../lib/useAsync';

/** Tab 🤝 Đơn: các đơn mua bán chung 2 bên */
export default function DealsTab() {
  const auth = useAuth();
  if (!auth) return <DealsSignIn />;
  return <DealList token={auth.token} />;
}

function DealList({ token }: { token: string }) {
  const deals = useAsync(() => api.deals(token), [token]);
  const [tab, setTab] = useState<'open' | 'closed'>('open');

  // Quay lại tab (vừa tạo / tham gia / xác nhận): tải lại ngầm
  const { refetch } = deals;
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const all = deals.state.status === 'ok' ? deals.state.data : [];
  const list = all.filter((d) => (tab === 'open' ? d.status === 'open' : d.status !== 'open'));
  const waiting = all.reduce((s, d) => s + d.summary.awaiting_me, 0);

  return (
    <FlatList
      data={list}
      keyExtractor={(d) => d.uuid}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={deals.refreshing} onRefresh={deals.reload} colors={[colors.primary]} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View>
          <Text style={[styles.muted, { marginBottom: 10 }]}>Đơn dùng chung 2 bên: bên mua (thương lái, chi nhánh) và bên bán (nông dân, lái bán lại). Mỗi bên ghi, bên kia xác nhận.</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Button label="＋ Tạo đơn" onPress={() => router.push('/deals/new')} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="🔑 Nhập mã" variant="outline" onPress={() => router.push('/deals/join')} />
            </View>
          </View>
          {waiting > 0 && <Notice text={`🔔 Có ${waiting} mục bên kia vừa ghi, chờ bạn xác nhận.`} />}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <Chip label="Đang mở" active={tab === 'open'} onPress={() => setTab('open')} />
            <Chip label="Đã xong / hủy" active={tab === 'closed'} onPress={() => setTab('closed')} />
          </View>
          <Status state={deals.state} retry={deals.reload} />
          {deals.state.status === 'ok' && list.length === 0 && <Text style={styles.muted}>Chưa có đơn nào.</Text>}
        </View>
      }
      renderItem={({ item }) => <DealRow deal={item} />}
    />
  );
}

function DealRow({ deal: d }: { deal: Deal }) {
  return (
    <Pressable onPress={() => router.push({ pathname: '/deals/[id]', params: { id: d.uuid } })} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text }}>
            {d.my_role === 'buyer' ? '🛒' : '🌳'} {d.title}
          </Text>
          <Text style={styles.muted}>
            {d.my_role === 'buyer' ? 'mình mua của' : 'mình bán cho'} {counterpartName(d)}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
            {!d.joined && <Tag label={`Mã ${d.code}`} />}
            {d.summary.awaiting_me > 0 && <Tag warn label={`🔔 ${d.summary.awaiting_me} chờ bạn`} />}
            {d.summary.disputed > 0 && <Tag warn label={`⚠️ ${d.summary.disputed} báo sai`} />}
          </View>
        </View>
        <Text style={{ fontSize: font.body, fontWeight: '700', color: colors.text }}>{formatVnd(d.summary.confirmed.delivered)}</Text>
      </Card>
    </Pressable>
  );
}
