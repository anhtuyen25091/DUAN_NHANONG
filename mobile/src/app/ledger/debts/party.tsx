import { DEBT_KIND_LABELS, debtsByParty, debtStatus, formatDate, formatVnd, telHref, today, type DebtKind, type Ledger, type LedgerSnapshot } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, Text, View } from 'react-native';
import { checkDate, DateField, ErrorNote, MoneyField } from '../../../components/fields';
import { KIND_ICON, RowCard, SectionTitle } from '../../../components/ledger';
import { Button, Card, styles } from '../../../components/ui';
import { useLedger } from '../../../lib/ledger';
import { colors, font } from '../../../lib/theme';
import { showToast } from '../../../lib/toast';

/** Các lần nợ của 1 người (cửa hàng mua thiếu nhiều lần), trả gộp. Params: kind, party */
export default function PartyDebtsScreen() {
  const { kind, party } = useLocalSearchParams<{ kind: DebtKind; party: string }>();
  const state = useLedger();
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  return <PartyDebts ledger={state.ledger} data={state.data} kind={kind} party={party} />;
}

function PartyDebts({ ledger, data, kind, party }: { ledger: Ledger; data: LedgerSnapshot; kind: DebtKind; party: string }) {
  const group = debtsByParty(debtStatus(data, today())).find((g) => g.kind === kind && g.party === party);
  const [amount, setAmount] = useState(group?.left ?? 0);
  const [date, setDate] = useState(today());
  const [error, setError] = useState<string | null>(null);

  if (!group) {
    return (
      <Card style={{ margin: 16 }}>
        <Stack.Screen options={{ title: 'Công nợ' }} />
        <Text style={styles.body}>Không còn khoản nợ nào với {party}.</Text>
      </Card>
    );
  }
  const receive = kind === 'receivable';
  const color = receive ? colors.gain : colors.loss;

  const pay = async () => {
    const dateError = checkDate(date, 'Ngày', { notFuture: true });
    if (dateError) return setError(dateError);
    setError(null);
    try {
      const n = await ledger.payParty({ kind, party, amount, date });
      showToast({ message: `Đã ghi ${receive ? 'thu' : 'trả'} ${formatVnd(amount)} cho ${n} lần nợ${amount === group.left ? '. Đã hết nợ 🎉' : ''}` });
      setAmount(group.left - amount);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `${KIND_ICON[kind]} ${party}` }} />
      <Text style={[styles.body, { marginBottom: 8 }]}>
        {DEBT_KIND_LABELS[kind]} · {group.count} lần
      </Text>
      {group.phone && (
        <View style={{ marginBottom: 8 }}>
          <Button label={`📞 Gọi ${group.phone}`} variant="outline" onPress={() => void Linking.openURL(telHref(group.phone!))} />
        </View>
      )}

      <Card style={{ borderLeftWidth: 6, borderLeftColor: color }}>
        <Text style={styles.muted}>{receive ? 'Còn phải thu' : 'Mình còn nợ'}</Text>
        <Text style={{ fontSize: 30, fontWeight: '800', color, marginVertical: 2 }}>{formatVnd(group.left)}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 18 }}>
          <Text style={styles.body}>
            Tổng nợ <Text style={{ fontWeight: '700' }}>{formatVnd(group.amount)}</Text>
          </Text>
          <Text style={styles.body}>
            Đã {receive ? 'thu' : 'trả'} <Text style={{ fontWeight: '700' }}>{formatVnd(group.amount - group.left)}</Text>
          </Text>
        </View>
      </Card>

      {group.left > 0 && (
        <Card>
          <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text, marginBottom: 4 }}>{receive ? 'Thu gộp' : 'Trả gộp'}</Text>
          <Text style={[styles.muted, { marginBottom: 8 }]}>Trừ vào lần nợ cũ nhất trước.</Text>
          <MoneyField label="Số tiền" value={amount} onChange={setAmount} />
          <View style={{ marginTop: -4, marginBottom: 12 }}>
            <Button label={`${receive ? 'Thu hết' : 'Trả hết'} ${formatVnd(group.left)}`} variant="outline" onPress={() => setAmount(group.left)} />
          </View>
          <DateField label="Ngày" value={date} onChange={setDate} notFuture />
          <ErrorNote message={error} />
          <Button label="Lưu" onPress={pay} disabled={amount <= 0} />
        </Card>
      )}

      <SectionTitle>Các lần nợ</SectionTitle>
      {group.statuses
        .slice()
        .sort((a, b) => a.debt.date.localeCompare(b.debt.date))
        .map(({ debt, left, overdue }) => (
          <RowCard
            key={debt.id}
            title={formatDate(debt.date)}
            sub={debt.note ?? formatVnd(debt.amount)}
            tag={overdue ? 'Quá hạn' : null}
            right={left > 0 ? formatVnd(left) : 'Đã trả'}
            rightColor={color}
            onPress={() => router.push({ pathname: '/ledger/debts/[id]', params: { id: debt.id } })}
          />
        ))}
    </ScrollView>
  );
}
