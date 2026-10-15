import { formatDate, formatVnd, formatWage, workerBalances } from '@nhanong/shared';
import { router, Stack } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Fab, RowCard } from '../../../components/ledger';
import { Button, Card, styles } from '../../../components/ui';
import { useLedger } from '../../../lib/ledger';
import { colors } from '../../../lib/theme';

/** Người làm thuê, công còn nợ */
export default function WorkersScreen() {
  const state = useLedger();
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  const balances = workerBalances(state.data);
  const owed = balances.reduce((s, b) => s + b.owed, 0);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: '👷 Nhân công' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <Text style={[styles.muted, { marginBottom: 12 }]}>Chấm công mỗi ngày làm. Khi trả tiền, sổ tự ghi khoản “Nhân công” vào đúng vườn đã làm.</Text>
        <Card>
          <Text style={styles.muted}>Công chưa trả</Text>
          <Text style={{ fontSize: 30, fontWeight: '800', color: owed ? colors.loss : colors.text }}>{formatVnd(owed)}</Text>
        </Card>
        {balances.length === 0 && (
          <Card>
            <Text style={styles.body}>Chưa có ai. Thêm người làm thuê và tiền công 1 ngày.</Text>
          </Card>
        )}
        {balances.map((b) => (
          <RowCard
            key={b.worker.id}
            title={b.worker.name}
            sub={`${formatWage(b.worker.wage)}${b.lastWorked ? ` · làm gần nhất ${formatDate(b.lastWorked)}` : ''}`}
            right={b.owed ? `nợ ${formatVnd(b.owed)}` : 'đã trả đủ'}
            rightColor={b.owed ? colors.loss : colors.muted}
            onPress={() => router.push({ pathname: '/ledger/workers/[id]', params: { id: b.worker.id } })}
          />
        ))}
        <Button label="＋ Thêm người làm" variant="outline" onPress={() => router.push('/ledger/workers/form')} />
      </ScrollView>
      {balances.length > 0 && <Fab label="✅ Chấm công" href="/ledger/workers/work-day" />}
    </View>
  );
}
