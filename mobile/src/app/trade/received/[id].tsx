import { formatDate, formatDateTime, formatKg, formatVnd, telHref } from '@nhanong/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Linking, ScrollView, Text, View } from 'react-native';
import { DealsSignIn } from '../../../components/deals';
import { PrintButtons } from '../../../components/PrintButtons';
import { PurchaseHistory, PurchaseLines } from '../../../components/trade';
import { Card, Status, styles } from '../../../components/ui';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { colors, font } from '../../../lib/theme';
import { useAsync } from '../../../lib/useAsync';

/** Phiếu điểm thu mua gửi cho mình: chỉ xem, tải PDF / Word, thấy mọi lần sửa sau khi gửi */
export default function ReceivedPurchaseScreen() {
  const auth = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const loaded = useAsync(() => (auth ? api.receivedPurchase(auth.token, id) : Promise.resolve(null)), [auth?.token, id]);
  if (!auth) return <DealsSignIn />;
  if (loaded.state.status !== 'ok' || !loaded.state.data) return <Status state={loaded.state} retry={loaded.reload} />;
  const p = loaded.state.data;

  const row = (label: string, value: string, bold?: boolean, color?: string) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 2 }}>
      <Text style={[styles.body, { flex: 1 }]}>{label}</Text>
      <Text style={[styles.body, { fontWeight: bold ? '700' : '400', color: color ?? colors.text }]}>{value}</Text>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `📄 Phiếu ${p.code}` }} />
      <Text style={styles.muted}>
        {formatDate(p.date)} · mình {p.kind === 'sell' ? 'bán cho' : 'mua của'}
      </Text>
      <Text style={{ fontSize: font.title, fontWeight: '700', color: colors.text }}>{p.issuer.name}</Text>
      {p.issuer.phone && (
        <Text style={{ color: colors.primary, marginBottom: 8 }} onPress={() => Linking.openURL(telHref(p.issuer.phone!))}>
          📞 {p.issuer.phone}
        </Text>
      )}
      {p.deleted_at ? (
        <Card style={{ borderColor: colors.error }}>
          <Text style={[styles.body, { color: colors.error }]}>Người lập phiếu đã xóa phiếu này lúc {formatDateTime(p.deleted_at)}. Phiếu vẫn được giữ ở đây để bạn đối chiếu.</Text>
        </Card>
      ) : p.edited_after_share ? (
        <Card style={{ backgroundColor: colors.primarySoft }}>
          <Text style={styles.body}>Phiếu đã được sửa sau khi gửi cho bạn. Xem các lần sửa ở dưới.</Text>
        </Card>
      ) : null}
      <PurchaseLines lines={p.lines} />
      <Card>
        {row(`Tổng tiền hàng (${formatKg(p.kg)} kg tịnh)`, formatVnd(p.amount), true)}
        {row('Đã trả', formatVnd(p.paid))}
        {p.owing > 0 && row(p.kind === 'sell' ? 'Bên mua còn nợ mình' : 'Mình còn nợ', formatVnd(p.owing), true, colors.loss)}
        {p.note ? <Text style={[styles.muted, { marginTop: 6 }]}>Ghi chú: {p.note}</Text> : null}
      </Card>
      <Card>
        <PrintButtons token={auth.token} target={{ type: 'purchase', id: p.id }} label="Tải / gửi phiếu (có lịch sử sửa nếu phiếu đã sửa sau khi gửi)" />
      </Card>
      {p.history.length > 1 && <PurchaseHistory history={p.history} sharedVersion={p.history[0].version} />}
    </ScrollView>
  );
}
