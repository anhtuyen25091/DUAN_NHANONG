import { formatDate, formatDays, formatVnd, formatWage, today, workerBalances, workLogAmount, type Ledger, type LedgerSnapshot } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, Text, View } from 'react-native';
import { DateField } from '../../../components/fields';
import { ItemRow } from '../../../components/ledger';
import { Button, Card, styles } from '../../../components/ui';
import { useLedger } from '../../../lib/ledger';
import { colors, font } from '../../../lib/theme';
import { showToast } from '../../../lib/toast';

/** Các ngày công của 1 người, trả công */
export default function WorkerScreen() {
  const state = useLedger();
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  return <WorkerDetail ledger={state.ledger} data={state.data} />;
}

function WorkerDetail({ ledger, data }: { ledger: Ledger; data: LedgerSnapshot }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [payDate, setPayDate] = useState(today());
  const balance = workerBalances(data).find((b) => b.worker.id === id);
  if (!balance) return <Text style={[styles.body, { padding: 16 }]}>Không tìm thấy người này (có thể đã xóa).</Text>;
  const { worker } = balance;
  const logs = data.work_logs.filter((l) => l.worker_id === id);
  const gardenName = (gid: string | null) => (gid ? (data.gardens.find((g) => g.id === gid)?.name ?? 'vườn đã xóa') : 'Chi chung');

  const pay = async () => {
    try {
      const undo = await ledger.payWorker(worker.id, { date: payDate });
      showToast({ message: `Đã trả công ${worker.name}: ${formatVnd(balance.owed)}`, undo });
    } catch (e) {
      showToast({ message: (e as Error).message });
    }
  };
  const unpay = async (transactionId: string) => {
    const undo = await ledger.unpayWork(transactionId);
    showToast({ message: 'Đã bỏ lần trả công này', undo });
  };
  const removeLog = async (logId: string) => {
    try {
      const undo = await ledger.removeWorkLog(logId);
      showToast({ message: 'Đã xóa ngày công', undo });
    } catch (e) {
      showToast({ message: (e as Error).message });
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Stack.Screen
        options={{
          title: worker.name,
          headerRight: () => (
            <Text accessibilityRole="button" onPress={() => router.push({ pathname: '/ledger/workers/form', params: { id: worker.id } })} style={{ color: colors.primary, fontSize: font.body, padding: 8 }}>
              Sửa
            </Text>
          ),
        }}
      />
      <Text style={[styles.body, { marginBottom: 8 }]}>
        {formatWage(worker.wage)}
        {worker.phone ? (
          <Text style={{ color: colors.primary }} onPress={() => Linking.openURL(`tel:${worker.phone!.replace(/[^\d+]/g, '')}`)}>
            {'  '}📞 {worker.phone}
          </Text>
        ) : null}
      </Text>

      <Card>
        <Text style={styles.muted}>Chưa trả</Text>
        <Text style={{ fontSize: 30, fontWeight: '800', color: balance.owed ? colors.loss : colors.text }}>{formatVnd(balance.owed)}</Text>
        <Text style={[styles.muted, { marginBottom: 8 }]}>
          {formatDays(balance.unpaidDays)} công · đã trả từ trước tới nay {formatVnd(balance.paid)}
        </Text>
        {balance.owed > 0 && (
          <>
            <DateField label="Ngày trả" value={payDate} onChange={setPayDate} notFuture />
            <Button label={`💵 Trả công ${formatVnd(balance.owed)}`} onPress={pay} />
          </>
        )}
      </Card>

      <View style={{ marginBottom: 12 }}>
        <Button label={`✅ Chấm công cho ${worker.name}`} variant="outline" onPress={() => router.push({ pathname: '/ledger/workers/work-day', params: { nguoi: worker.id } })} />
      </View>

      <Text style={{ fontSize: font.title - 2, fontWeight: '700', color: colors.text, marginBottom: 6 }}>Các ngày công</Text>
      {logs.length === 0 && <Text style={styles.muted}>Chưa chấm công ngày nào.</Text>}
      {logs.map((l) =>
        l.paid_on && l.transaction_id ? (
          <ItemRow
            key={l.id}
            icon="✅"
            title={`${formatDate(l.date)} · ${formatDays(l.days)}`}
            sub={`${gardenName(l.garden_id)} · đã trả ${formatDate(l.paid_on)}${l.note ? ` · ${l.note}` : ''}\nBấm để bỏ lần trả công này`}
            amount={formatVnd(workLogAmount(l))}
            amountColor={colors.loss}
            onPress={() => unpay(l.transaction_id!)}
          />
        ) : (
          <ItemRow
            key={l.id}
            icon="🕒"
            title={`${formatDate(l.date)} · ${formatDays(l.days)}`}
            sub={`${gardenName(l.garden_id)} · chưa trả${l.note ? ` · ${l.note}` : ''}`}
            amount={formatVnd(workLogAmount(l))}
            amountColor={colors.loss}
            onDelete={() => removeLog(l.id)}
            deleteLabel="Xóa ngày công này"
          />
        ),
      )}
    </ScrollView>
  );
}
