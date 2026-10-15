import { debtStatus, debtSummary, formatDate, formatVnd, today, type LedgerSnapshot } from '@nhanong/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Fab, RowCard } from '../../../components/ledger';
import { Card, Chip, styles } from '../../../components/ui';
import { useLedger } from '../../../lib/ledger';
import { colors } from '../../../lib/theme';

/** Công nợ: ai nợ ai, còn bao nhiêu */
export default function DebtListScreen() {
  const state = useLedger();
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  return <DebtList data={state.data} />;
}

function DebtList({ data }: { data: LedgerSnapshot }) {
  const [showPaid, setShowPaid] = useState(false);
  const statuses = debtStatus(data, today());
  const sum = debtSummary(statuses);
  const shown = statuses.filter((s) => (showPaid ? s.left <= 0 : s.left > 0));

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <Card style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 140 }}>
            <Text style={styles.muted}>Mình còn nợ người ta</Text>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.loss }}>{formatVnd(sum.payable)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 140 }}>
            <Text style={styles.muted}>Người ta còn nợ mình</Text>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.gain }}>{formatVnd(sum.receivable)}</Text>
          </View>
        </Card>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <Chip label="Còn nợ" active={!showPaid} onPress={() => setShowPaid(false)} />
          <Chip label="Đã trả xong" active={showPaid} onPress={() => setShowPaid(true)} />
        </View>

        {shown.length === 0 && (
          <Text style={styles.muted}>{showPaid ? 'Chưa có khoản nào trả xong.' : 'Không còn khoản nợ nào. Bấm “＋ Ghi nợ” khi mua thiếu hoặc bán chịu.'}</Text>
        )}
        {shown.map(({ debt, left, overdue }) => (
          <RowCard
            key={debt.id}
            title={`${debt.kind === 'payable' ? '🔴' : '🟢'} ${debt.party}`}
            sub={`${debt.kind === 'payable' ? 'mình nợ' : 'nợ mình'} · ${formatDate(debt.date)}`}
            tag={overdue && debt.due_on ? `Quá hạn ${formatDate(debt.due_on)}` : null}
            right={formatVnd(showPaid ? debt.amount : left)}
            rightColor={debt.kind === 'payable' ? colors.loss : colors.gain}
            onPress={() => router.push({ pathname: '/ledger/debts/[id]', params: { id: debt.id } })}
          />
        ))}
      </ScrollView>
      <Fab label="＋ Ghi nợ" href="/ledger/debts/form" />
    </View>
  );
}
