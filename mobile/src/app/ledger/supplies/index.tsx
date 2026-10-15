import { formatQty, formatVnd, supplyStock, type LedgerSnapshot } from '@nhanong/shared';
import { router } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Fab, RowCard, SectionTitle } from '../../../components/ledger';
import { Card, styles } from '../../../components/ui';
import { useLedger } from '../../../lib/ledger';
import { colors } from '../../../lib/theme';

/** Kho vật tư: vật tư còn bao nhiêu */
export default function SupplyListScreen() {
  const state = useLedger();
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  return <SupplyList data={state.data} />;
}

function SupplyList({ data }: { data: LedgerSnapshot }) {
  const stock = supplyStock(data);
  const inStock = stock.filter((s) => s.left > 1e-9);
  const used = stock.filter((s) => s.left <= 1e-9);
  const value = inStock.reduce((sum, s) => sum + s.leftValue, 0);

  const row = ({ supply, left, leftValue }: (typeof stock)[number], faded = false) => (
    <RowCard
      key={supply.id}
      title={`${data.categories.find((c) => c.id === supply.category_id)?.icon ?? '📦'} ${supply.name}`}
      sub={`còn ${formatQty(left)}/${formatQty(supply.quantity)} ${supply.unit}`}
      right={left > 1e-9 ? formatVnd(leftValue) : 'Hết'}
      faded={faded}
      onPress={() => router.push({ pathname: '/ledger/supplies/[id]', params: { id: supply.id } })}
    />
  );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <Text style={[styles.muted, { marginBottom: 12 }]}>
          Mua phân, thuốc về để dành: ghi vào kho. Khi đem bón/xịt cho vườn nào thì bấm vào vật tư → “Dùng cho vườn”, tiền sẽ tính vào vườn đó.
        </Text>
        <Card>
          <Text style={styles.muted}>Giá trị vật tư còn trong kho</Text>
          <Text style={{ fontSize: 30, fontWeight: '800', color: colors.text }}>{formatVnd(value)}</Text>
        </Card>
        {stock.length === 0 && (
          <Card style={{ backgroundColor: colors.primarySoft }}>
            <Text style={styles.body}>Kho chưa có gì. Bấm “＋ Mua vật tư” để ghi lần mua đầu tiên.</Text>
          </Card>
        )}
        {inStock.map((s) => row(s))}
        {used.length > 0 && (
          <>
            <SectionTitle>Đã dùng hết</SectionTitle>
            {used.map((s) => row(s, true))}
          </>
        )}
      </ScrollView>
      <Fab label="＋ Mua vật tư" href="/ledger/supplies/form" />
    </View>
  );
}
