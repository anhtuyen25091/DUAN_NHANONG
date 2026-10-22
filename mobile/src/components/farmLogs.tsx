import { FARM_LOG_KIND_LABELS, formatDate, formatQty, today, withholdingOn, withholdingText, type LedgerSnapshot } from '@nhanong/shared';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { colors, font } from '../lib/theme';
import { RowCard } from './ledger';
import { Button, Card, styles } from './ui';

/** Cảnh báo vườn đang trong thời gian cách ly thuốc (vào ngày `on`) */
export function WithholdingNotice({ data, gardenId, on = today() }: { data: LedgerSnapshot; gardenId: string | null; on?: string }) {
  const w = gardenId ? withholdingOn(data.farm_logs, gardenId, on) : null;
  if (!w) return null;
  return (
    <Card style={{ borderColor: colors.error, backgroundColor: colors.lossSoft }}>
      <Text style={[styles.body, { color: colors.loss }]}>⚠️ {withholdingText(w)}</Text>
    </Card>
  );
}

/** Trang vườn: 5 việc gần nhất, lối vào ghi việc / xem cả nhật ký */
export function FarmLogSection({ data, gardenId }: { data: LedgerSnapshot; gardenId: string }) {
  const logs = data.farm_logs.filter((l) => l.garden_id === gardenId);
  return (
    <View>
      <Text style={{ fontSize: font.title - 2, fontWeight: '700', color: colors.text, marginTop: 8, marginBottom: 6 }}>📓 Nhật ký canh tác</Text>
      {logs.length === 0 && (
        <Text style={[styles.muted, { marginBottom: 8 }]}>
          Ghi lại các lần phun thuốc, bón phân, tưới… Có thời gian cách ly thì app nhắc ngày được thu hoạch. Gửi nhật ký khi làm hồ sơ truy xuất nguồn gốc, mã vùng trồng.
        </Text>
      )}
      {logs.slice(0, 5).map((l) => (
        <RowCard
          key={l.id}
          title={`${FARM_LOG_KIND_LABELS[l.kind]}: ${l.title}`}
          sub={[formatDate(l.date), l.quantity ? `${formatQty(l.quantity)}${l.unit ? ` ${l.unit}` : ''}` : null, l.target ? `trị ${l.target}` : null, l.withholding_days ? `cách ly ${l.withholding_days} ngày` : null]
            .filter(Boolean)
            .join(' · ')}
          right=""
          onPress={() => router.push({ pathname: '/ledger/farm-log-form', params: { id: l.id } })}
        />
      ))}
      <View style={{ gap: 8, marginBottom: 12 }}>
        <Button label="＋ Ghi việc" variant="outline" onPress={() => router.push({ pathname: '/ledger/farm-log-form', params: { gardenId } })} />
        {logs.length > 0 && <Button label={`Xem cả nhật ký (${logs.length}) · gửi`} variant="outline" onPress={() => router.push({ pathname: '/ledger/farm-log-book', params: { gardenId } })} />}
      </View>
    </View>
  );
}
