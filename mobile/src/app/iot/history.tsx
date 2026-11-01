import { describeCommand, timeAgo } from '@nhanong/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { RefreshControl, ScrollView, Text } from 'react-native';
import { Card, Status, styles } from '../../components/ui';
import { iotApi } from '../../lib/iot';
import { colors } from '../../lib/theme';
import { useAsync } from '../../lib/useAsync';

/** 30 lệnh bật / tắt gần nhất của 1 máy: ai bật (tay / luật / lịch tưới / khóa an toàn), vì sao, mạch đã làm chưa */
export default function IotHistoryScreen() {
  const { actuator, name } = useLocalSearchParams<{ actuator: string; name?: string }>();
  const history = useAsync(() => iotApi.commandHistory(Number(actuator)), [actuator]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={history.refreshing} onRefresh={history.reload} />}>
      <Stack.Screen options={{ title: `Lịch sử · ${name ?? 'máy'}` }} />
      <Status state={history.state} retry={history.reload} />
      {history.state.status === 'ok' && history.state.data.length === 0 && (
        <Card>
          <Text style={styles.body}>Chưa bật / tắt lần nào.</Text>
        </Card>
      )}
      {history.state.status === 'ok' &&
        history.state.data.map((command) => {
          const bad = command.status === 'failed' || command.status === 'expired';
          return (
            <Card key={command.id} style={{ borderLeftWidth: 6, borderLeftColor: bad ? colors.error : command.action === 'on' ? colors.primary : colors.muted }}>
              <Text style={[styles.body, { fontWeight: '700' }]}>{describeCommand(command)}</Text>
              {command.reason && <Text style={styles.muted}>{command.reason}</Text>}
              <Text style={[styles.muted, bad && { color: colors.error }]}>
                {timeAgo(command.created_at)} · {command.status_label}
                {command.message ? ` · ${command.message}` : ''}
              </Text>
            </Card>
          );
        })}
    </ScrollView>
  );
}
