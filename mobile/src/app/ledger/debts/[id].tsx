import { DEBT_KIND_LABELS, debtStatus, formatDate, formatVnd, telHref, today, type Ledger, type LedgerSnapshot } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { checkDate, DateField, ErrorNote, MoneyField } from '../../../components/fields';
import { ItemRow, SectionTitle } from '../../../components/ledger';
import { Button, Card, styles } from '../../../components/ui';
import { confirmAsync } from '../../../lib/confirm';
import { useLedger } from '../../../lib/ledger';
import { colors, font } from '../../../lib/theme';
import { showToast } from '../../../lib/toast';

/** Một khoản nợ: còn nợ bao nhiêu, các lần trả, ghi lần trả mới */
export default function DebtDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useLedger();
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  return <DebtDetail ledger={state.ledger} data={state.data} id={id} />;
}

function DebtDetail({ ledger, data, id }: { ledger: Ledger; data: LedgerSnapshot; id: string }) {
  const status = debtStatus(data, today()).find((s) => s.debt.id === id);
  const [amount, setAmount] = useState(status?.left ?? 0);
  const [date, setDate] = useState(today());
  const [error, setError] = useState<string | null>(null);

  if (!status) {
    return (
      <Card style={{ margin: 16 }}>
        <Stack.Screen options={{ title: 'Công nợ' }} />
        <Text style={styles.body}>Không tìm thấy khoản nợ này (có thể đã xóa).</Text>
      </Card>
    );
  }
  const { debt, paid, left, overdue } = status;
  const payable = debt.kind === 'payable';
  const payments = data.debt_payments.filter((p) => p.debt_id === id);
  const garden = data.gardens.find((g) => g.id === debt.garden_id);
  const supply = data.supplies.find((s) => s.id === debt.supply_id);
  const color = payable ? colors.loss : colors.gain;

  const pay = async () => {
    const dateError = checkDate(date, 'Ngày', { notFuture: true });
    if (dateError) return setError(dateError);
    setError(null);
    try {
      await ledger.payDebt({ debt_id: id, amount, date });
      showToast({ message: `Đã ghi ${payable ? 'trả' : 'thu'} ${formatVnd(amount)}${amount === left ? '. Đã hết nợ 🎉' : ''}` });
      setAmount(left - amount);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async () => {
    const ok = await confirmAsync(`Xóa khoản nợ với ${debt.party}?`, debt.transaction_id ? 'Khoản thu chi đi kèm cũng bị xóa.' : 'Các lần trả cũng bị xóa.');
    if (!ok) return;
    const undo = await ledger.removeDebt(id);
    showToast({ message: 'Đã xóa khoản nợ', undo });
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{
          title: `${payable ? '🔴' : '🟢'} ${debt.party}`,
          headerRight: () => (
            <Text accessibilityRole="button" onPress={() => router.push({ pathname: '/ledger/debts/form', params: { id } })} style={{ color: colors.primary, fontSize: font.body, padding: 8 }}>
              Sửa
            </Text>
          ),
        }}
      />
      <Text style={[styles.body, { marginBottom: 8 }]}>
        {DEBT_KIND_LABELS[debt.kind]} · {formatDate(debt.date)}
        {garden ? ` · ${garden.name}` : ''}
        {debt.note ? ` · ${debt.note}` : ''}
      </Text>
      {debt.phone && (
        <View style={{ marginBottom: 8 }}>
          <Button label={`📞 Gọi ${debt.phone}`} variant="outline" onPress={() => void Linking.openURL(telHref(debt.phone!))} />
        </View>
      )}
      {supply && (
        <Pressable onPress={() => router.push({ pathname: '/ledger/supplies/[id]', params: { id: supply.id } })} accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center', marginBottom: 4 }}>
          <Text style={{ color: colors.primary, fontSize: font.body, fontWeight: '600' }}>📦 Xem vật tư: {supply.name}</Text>
        </Pressable>
      )}

      <Card style={{ borderLeftWidth: 6, borderLeftColor: color }}>
        <Text style={styles.muted}>{left > 0 ? (payable ? 'Mình còn nợ' : 'Còn phải thu') : 'Đã trả xong'}</Text>
        <Text style={{ fontSize: 30, fontWeight: '800', color, marginVertical: 2 }}>{formatVnd(left)}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 18 }}>
          <Text style={styles.body}>
            Tổng nợ <Text style={{ fontWeight: '700' }}>{formatVnd(debt.amount)}</Text>
          </Text>
          <Text style={styles.body}>
            Đã {payable ? 'trả' : 'thu'} <Text style={{ fontWeight: '700' }}>{formatVnd(paid)}</Text>
          </Text>
        </View>
        {debt.due_on && (
          <Text style={[styles.muted, overdue && { color: colors.loss, fontWeight: '700' }, { marginTop: 4 }]}>
            Hẹn trả: {formatDate(debt.due_on)}
            {overdue ? ' (quá hạn)' : ''}
          </Text>
        )}
      </Card>

      {left > 0 && (
        <Card>
          <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text, marginBottom: 8 }}>{payable ? 'Ghi lần trả nợ' : 'Ghi lần thu nợ'}</Text>
          <MoneyField label="Số tiền" value={amount} onChange={setAmount} />
          <View style={{ marginTop: -4, marginBottom: 12 }}>
            <Button label={`${payable ? 'Trả hết' : 'Thu hết'} ${formatVnd(left)}`} variant="outline" onPress={() => setAmount(left)} />
          </View>
          <DateField label="Ngày" value={date} onChange={setDate} />
          <ErrorNote message={error} />
          <Button label="Lưu" onPress={pay} disabled={amount <= 0} />
          <Text style={[styles.muted, { marginTop: 8 }]}>Trả/thu nợ không tính lại vào lời/lỗ: tiền đã tính lúc {payable ? 'mua' : 'bán'}.</Text>
        </Card>
      )}

      <SectionTitle>Các lần {payable ? 'trả' : 'thu'}</SectionTitle>
      {payments.length === 0 && <Text style={styles.muted}>Chưa có lần nào.</Text>}
      {payments.map((p) => (
        <ItemRow
          key={p.id}
          icon="💵"
          title={formatDate(p.date)}
          sub={p.note}
          amount={formatVnd(p.amount)}
          deleteLabel="Xóa lần trả này"
          onDelete={async () => {
            const undo = await ledger.removePayment(p.id);
            showToast({ message: `Đã xóa lần ${payable ? 'trả' : 'thu'} ${formatVnd(p.amount)}`, undo });
          }}
        />
      ))}

      <View style={{ marginTop: 16 }}>
        <Button label="Xóa khoản nợ này" variant="danger" onPress={remove} />
      </View>
    </ScrollView>
  );
}
