import { CONTRACT_STATUS_LABELS, contractSummaries, formatVnd, type LedgerSnapshot } from '@nhanong/shared';
import { router } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Fab, RowCard } from '../../../components/ledger';
import { Card, styles } from '../../../components/ui';
import { useLedger } from '../../../lib/ledger';
import { colors } from '../../../lib/theme';

/** Bán cho lái: các hợp đồng (đang cắt trước) */
export default function ContractListScreen() {
  const state = useLedger();
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  return <ContractList data={state.data} />;
}

function ContractList({ data }: { data: LedgerSnapshot }) {
  const summaries = contractSummaries(data);
  const gardens = new Map(data.gardens.map((g) => [g.id, g.name]));
  const depositLeft = summaries.reduce((s, x) => s + x.depositLeft, 0);
  const owing = summaries.reduce((s, x) => s + x.owing, 0);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <Text style={[styles.muted, { marginBottom: 12 }]}>
          Dùng khi lái đặt cọc trước rồi vào cắt nhiều đợt (sầu riêng…). Cọc chưa tính vào lời/lỗ; mỗi đợt cắt ghi tiền vào bằng giá trị hàng của đợt.
        </Text>
        {summaries.length > 0 && (
          <Card>
            <Text style={styles.muted}>Cọc của lái còn chưa trừ</Text>
            <Text style={{ fontSize: 30, fontWeight: '800', color: colors.text }}>{formatVnd(depositLeft)}</Text>
            {owing > 0 && <Text style={[styles.body, { color: colors.loss, fontWeight: '700' }]}>Lái còn nợ tiền hàng: {formatVnd(owing)}</Text>}
          </Card>
        )}
        {summaries.length === 0 && (
          <Card style={{ backgroundColor: colors.primarySoft }}>
            <Text style={styles.body}>Chưa có hợp đồng nào. Bấm “＋ Nhận cọc” khi lái đặt cọc vườn.</Text>
          </Card>
        )}
        {summaries.map(({ contract, cuts, delivered, depositLeft, owing: left }) => (
          <RowCard
            key={contract.id}
            title={`🤝 ${contract.buyer}`}
            sub={`${gardens.get(contract.garden_id) ?? 'Vườn đã xóa'} · ${cuts.length} đợt · ${CONTRACT_STATUS_LABELS[contract.status]}`}
            tag={left > 0 ? `Lái còn nợ ${formatVnd(left)}` : contract.status === 'open' && depositLeft > 0 ? `Cọc còn ${formatVnd(depositLeft)}` : null}
            right={formatVnd(delivered)}
            rightColor={colors.gain}
            faded={contract.status !== 'open'}
            onPress={() => router.push({ pathname: '/ledger/contracts/[id]', params: { id: contract.id } })}
          />
        ))}
      </ScrollView>
      <Fab label="＋ Nhận cọc" href="/ledger/contracts/form" />
    </View>
  );
}
