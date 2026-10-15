import { debtsByParty, debtStatus, debtSummary, formatDate, formatVnd, today, type LedgerSnapshot } from '@nhanong/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Fab, KIND_ICON, RowCard } from '../../../components/ledger';
import { Card, Chip, styles } from '../../../components/ui';
import { useLedger } from '../../../lib/ledger';
import { colors } from '../../../lib/theme';

/** Công nợ & tiền vay: ai nợ ai, còn bao nhiêu (gom theo người: cửa hàng mua thiếu nhiều lần hiện 1 dòng) */
export default function DebtListScreen() {
  const state = useLedger();
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  return <DebtList data={state.data} />;
}

function DebtList({ data }: { data: LedgerSnapshot }) {
  const [showPaid, setShowPaid] = useState(false);
  const statuses = debtStatus(data, today());
  const sum = debtSummary(statuses);
  const groups = debtsByParty(statuses).filter((g) => (showPaid ? g.left <= 0 : g.left > 0));
  const totals: Array<[string, number, string]> = [
    ['🏦 Tiền vay còn nợ', sum.loan, colors.loss],
    ['🔴 Còn nợ cửa hàng', sum.payable, colors.loss],
    ['🟢 Người ta còn nợ mình', sum.receivable, colors.gain],
  ];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <Card style={{ gap: 8 }}>
          {totals.map(([label, value, color]) => (
            <View key={label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <Text style={styles.body}>{label}</Text>
              <Text style={{ fontSize: 22, fontWeight: '800', color }}>{formatVnd(value)}</Text>
            </View>
          ))}
        </Card>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <Chip label="Còn nợ" active={!showPaid} onPress={() => setShowPaid(false)} />
          <Chip label="Đã trả xong" active={showPaid} onPress={() => setShowPaid(true)} />
        </View>

        {groups.length === 0 && (
          <Text style={styles.muted}>{showPaid ? 'Chưa có khoản nào trả xong.' : 'Không còn khoản nợ nào. Bấm “＋ Ghi nợ / vay” khi vay tiền, mua thiếu hoặc bán chịu.'}</Text>
        )}
        {groups.map((g) => (
          <RowCard
            key={`${g.kind}|${g.party}`}
            title={`${KIND_ICON[g.kind]} ${g.party}`}
            sub={`${g.kind === 'loan' ? 'mình vay' : g.kind === 'payable' ? 'mình nợ' : 'nợ mình'}${g.count > 1 ? ` · ${g.count} lần` : ` · ${formatDate(g.statuses[0].debt.date)}`}`}
            tag={g.overdue ? 'Quá hạn' : null}
            right={formatVnd(showPaid ? g.amount : g.left)}
            rightColor={g.kind === 'receivable' ? colors.gain : colors.loss}
            onPress={() =>
              g.count === 1
                ? router.push({ pathname: '/ledger/debts/[id]', params: { id: g.statuses[0].debt.id } })
                : router.push({ pathname: '/ledger/debts/party', params: { kind: g.kind, party: g.party } })
            }
          />
        ))}
      </ScrollView>
      <Fab label="＋ Ghi nợ / vay" href="/ledger/debts/form" />
    </View>
  );
}
