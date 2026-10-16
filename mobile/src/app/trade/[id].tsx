import { formatDate, formatKg, formatVnd, telHref, type Purchase } from '@nhanong/shared';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, ScrollView, Text, View } from 'react-native';
import { DealsSignIn } from '../../components/deals';
import { MoneyField } from '../../components/fields';
import { PrintButtons } from '../../components/PrintButtons';
import { PurchaseHistory, PurchaseLines, PurchaseShare } from '../../components/trade';
import { Button, Card, Status, styles } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { confirmAsync } from '../../lib/confirm';
import { colors, font } from '../../lib/theme';
import { showToast } from '../../lib/toast';
import { useAsync } from '../../lib/useAsync';

/** Xem 1 phiếu mua / bán: dòng hàng, đã trả / còn nợ, gửi PDF / Word cho khách */
export default function PurchaseScreen() {
  const auth = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const loaded = useAsync(() => (auth ? api.purchase(auth.token, id) : Promise.resolve(null)), [auth?.token, id]);
  const { refetch } = loaded;
  // Quay lại từ màn sửa phiếu: tải lại
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );
  if (!auth) return <DealsSignIn />;
  if (loaded.state.status !== 'ok' || !loaded.state.data) return <Status state={loaded.state} retry={loaded.reload} />;
  const data = loaded.state.data;
  // key: phiếu vừa sửa ở màn khác (tải lại khi quay về) thì vẽ lại từ dữ liệu mới
  return <PurchaseView key={`${data.id}|${data.version}`} token={auth.token} initial={data} />;
}

function PurchaseView({ token, initial }: { token: string; initial: Purchase }) {
  const [p, setP] = useState(initial);
  const [extra, setExtra] = useState(0);

  const addPayment = async () => {
    try {
      setP(await api.savePurchase(token, { date: p.date, lines: p.lines, paid: Math.min(p.amount, p.paid + extra) }, p.id));
      setExtra(0);
      showToast({ message: 'Đã ghi tiền trả' });
    } catch (err) {
      Alert.alert('Chưa ghi được', (err as Error).message);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `${p.kind === 'buy' ? 'Phiếu mua' : 'Phiếu bán'} ${p.code}` }} />
      <Text style={styles.muted}>
        {formatDate(p.date)} · {p.kind === 'buy' ? 'mua của' : 'bán cho'}
      </Text>
      <Text
        style={{ fontSize: font.title, fontWeight: '700', color: p.customer ? colors.primary : colors.text, marginBottom: 4 }}
        onPress={p.customer ? () => router.push({ pathname: '/trade/customer/[id]', params: { id: p.customer! } }) : undefined}
      >
        👤 {p.counterpart}
      </Text>
      {p.phone && (
        <Text style={{ color: colors.primary, marginBottom: 8 }} onPress={() => Linking.openURL(telHref(p.phone!))}>
          📞 {p.phone}
        </Text>
      )}
      <PurchaseLines lines={p.lines} />
      <Card>
        <Row label={`Tổng tiền hàng (${formatKg(p.kg)} kg tịnh)`} value={formatVnd(p.amount)} bold />
        <Row label="Đã trả" value={formatVnd(p.paid)} />
        {p.owing > 0 && <Row label={p.kind === 'buy' ? 'Còn nợ khách' : 'Khách còn nợ'} value={formatVnd(p.owing)} bold color={colors.loss} />}
        {p.note ? <Text style={[styles.muted, { marginTop: 6 }]}>Ghi chú: {p.note}</Text> : null}
      </Card>
      {p.owing > 0 && (
        <Card>
          <MoneyField label="Trả thêm" value={extra} onChange={setExtra} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button label="Trả hết phần còn nợ" variant="outline" onPress={() => setExtra(p.owing)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="💵 Ghi tiền trả" onPress={addPayment} disabled={extra <= 0} />
            </View>
          </View>
        </Card>
      )}
      <Card>
        <PrintButtons token={token} target={{ type: 'purchase', id: p.id }} label="Gửi phiếu cho khách (có chỗ ký 2 bên, số tiền bằng chữ)" />
      </Card>
      <PurchaseShare token={token} purchase={p} onChange={setP} />
      {p.history && p.history.length > 1 && <PurchaseHistory history={p.history} sharedVersion={p.shared_version ?? null} />}
      <View style={{ gap: 8 }}>
        <Button label="Sửa phiếu" variant="outline" onPress={() => router.push({ pathname: '/trade/form', params: { id: p.id } })} />
        <Button
          label="Xóa phiếu"
          variant="danger"
          onPress={async () => {
            if (!(await confirmAsync(`Xóa phiếu ${p.code}?`, 'Phiếu sẽ bị xóa khỏi sổ giao dịch.'))) return;
            await api.deletePurchase(token, p.id);
            showToast({ message: `Đã xóa phiếu ${p.code}` });
            router.back();
          }}
        />
      </View>
    </ScrollView>
  );
}

function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 2 }}>
      <Text style={[styles.body, { flex: 1 }]}>{label}</Text>
      <Text style={[styles.body, { fontWeight: bold ? '700' : '400', color: color ?? colors.text }]}>{value}</Text>
    </View>
  );
}
