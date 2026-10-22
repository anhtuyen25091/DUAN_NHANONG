import { farmLogLine, farmLogText, today, type LedgerSnapshot } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { WithholdingNotice } from '../../components/farmLogs';
import { DateField } from '../../components/fields';
import { Button, Card, styles } from '../../components/ui';
import { useLedger } from '../../lib/ledger';
import { colors } from '../../lib/theme';

/** Cả nhật ký canh tác 1 vườn theo khoảng ngày, gửi qua Zalo / tin nhắn (param gardenId) */
export default function FarmLogBookScreen() {
  const state = useLedger();
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  return <FarmLogBook data={state.data} />;
}

function FarmLogBook({ data }: { data: LedgerSnapshot }) {
  const { gardenId } = useLocalSearchParams<{ gardenId: string }>();
  const garden = data.gardens.find((g) => g.id === gardenId);
  const [from, setFrom] = useState(`${today().slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today());
  if (!garden) return <Text style={[styles.body, { padding: 16 }]}>Không tìm thấy vườn này.</Text>;
  const logs = data.farm_logs.filter((l) => l.garden_id === gardenId && l.date >= from && l.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  const text = farmLogText(garden, data.farm_logs.filter((l) => l.garden_id === gardenId), { from, to });

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Stack.Screen options={{ title: `📓 ${garden.name}` }} />
      <DateField label="Từ ngày" value={from} onChange={setFrom} notFuture />
      <DateField label="Đến ngày" value={to} onChange={setTo} notFuture min={from} />
      <View style={{ gap: 8, marginBottom: 12 }}>
        <Button label="📤 Gửi nhật ký (Zalo, tin nhắn…)" onPress={() => Share.share({ title: `Nhật ký canh tác ${garden.name}`, message: text }).catch(() => {})} />
        <Button label="＋ Ghi việc" variant="outline" onPress={() => router.push({ pathname: '/ledger/farm-log-form', params: { gardenId } })} />
      </View>
      <WithholdingNotice data={data} gardenId={gardenId} />
      {logs.length === 0 && <Text style={styles.muted}>Chưa ghi việc nào trong khoảng ngày này.</Text>}
      {logs.length > 0 && (
        <Card style={{ gap: 6 }}>
          {logs.map((l, i) => (
            <Pressable key={l.id} onPress={() => router.push({ pathname: '/ledger/farm-log-form', params: { id: l.id } })}>
              <Text style={styles.body}>
                {i + 1}. {farmLogLine(l)}
              </Text>
            </Pressable>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}
