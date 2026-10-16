import { formatVnd, monthStart, telHref, today } from '@nhanong/shared';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { DealsSignIn, Notice } from '../../../components/deals';
import { DateField } from '../../../components/fields';
import { PrintButtons } from '../../../components/PrintButtons';
import { CustomerForm, TradeRowCard, TradeTotalsCard } from '../../../components/trade';
import { Button, Card, Status, styles } from '../../../components/ui';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { confirmAsync } from '../../../lib/confirm';
import { colors } from '../../../lib/theme';
import { useAsync } from '../../../lib/useAsync';

/** 1 khách: còn nợ 2 chiều, các phiếu trong khoảng ngày, gửi bảng kê PDF / Word */
export default function CustomerScreen() {
  const auth = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [from, setFrom] = useState(monthStart(today()));
  const [to, setTo] = useState(today());
  const [editing, setEditing] = useState(false);
  const customers = useAsync(() => (auth ? api.customers(auth.token) : Promise.resolve([])), [auth?.token]);
  const rows = useAsync(() => (auth ? api.transactions(auth.token, { from, to, customer: id }) : Promise.resolve(null)), [auth?.token, id, from, to]);
  const refetchCustomers = customers.refetch;
  const refetchRows = rows.refetch;
  useFocusEffect(
    useCallback(() => {
      refetchCustomers();
      refetchRows();
    }, [refetchCustomers, refetchRows]),
  );

  if (!auth) return <DealsSignIn />;
  if (customers.state.status !== 'ok') return <Status state={customers.state} retry={customers.reload} />;
  const c = customers.state.data.find((x) => x.id === id);
  if (!c) return <Text style={[styles.muted, { padding: 16 }]}>Không tìm thấy khách này.</Text>;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `👤 ${c.name}` }} />
      {c.phone && (
        <Text style={{ color: colors.primary, marginBottom: 4 }} onPress={() => Linking.openURL(telHref(c.phone!))}>
          📞 {c.phone}
        </Text>
      )}
      <Text style={[styles.muted, { marginBottom: 10 }]}>
        {c.address ? `${c.address} · ` : ''}
        {c.count} phiếu
      </Text>
      {c.i_owe > 0 && <Notice text={`Mình còn nợ khách ${formatVnd(c.i_owe)}`} />}
      {c.owes_me > 0 && <Notice text={`Khách còn nợ mình ${formatVnd(c.owes_me)}`} />}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Button label="＋ Phiếu mua" onPress={() => router.push({ pathname: '/trade/form', params: { kind: 'buy', customer: c.id } })} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="＋ Phiếu bán" variant="outline" onPress={() => router.push({ pathname: '/trade/form', params: { kind: 'sell', customer: c.id } })} />
        </View>
      </View>
      <View style={{ marginBottom: 12 }}>
        <Button label={editing ? 'Thôi' : 'Sửa thông tin khách'} variant="outline" onPress={() => setEditing(!editing)} />
      </View>
      {editing && (
        <CustomerForm
          token={auth.token}
          customer={c}
          onSaved={() => {
            setEditing(false);
            customers.refetch();
          }}
        />
      )}
      <DateField label="Từ ngày" value={from} onChange={setFrom} notFuture />
      <DateField label="Đến ngày" value={to} onChange={setTo} notFuture min={from} />
      <Status state={rows.state} retry={rows.reload} />
      {rows.state.status === 'ok' && rows.state.data && (
        <>
          <TradeTotalsCard totals={rows.state.data.meta.totals} />
          {rows.state.data.data.map((r) => (
            <TradeRowCard key={r.id} row={r} />
          ))}
          <Card>
            <PrintButtons token={auth.token} target={{ type: 'customer', id: c.id, from, to }} label="Gửi bảng kê giao dịch của khách trong khoảng ngày này" />
          </Card>
        </>
      )}
      <Button
        label="Xóa khách"
        variant="danger"
        onPress={async () => {
          if (!(await confirmAsync(`Xóa khách ${c.name}?`, 'Các phiếu cũ vẫn giữ.'))) return;
          await api.deleteCustomer(auth.token, c.id);
          router.back();
        }}
      />
    </ScrollView>
  );
}
