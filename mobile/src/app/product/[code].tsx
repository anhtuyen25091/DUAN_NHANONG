import { ALERT_CONDITION_LABELS, ApiError, formatDate, formatNumber, formatPriceRange, parseVnd, readVnd, type AlertCondition } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { PriceChart } from '../../components/PriceChart';
import { Button, Card, Change, Chip, Status, styles } from '../../components/ui';
import { api } from '../../lib/api';
import { registerPush } from '../../lib/push';
import { colors, font } from '../../lib/theme';
import { useAsync } from '../../lib/useAsync';

const RANGES = [7, 30, 90];
const CONDITIONS = Object.keys(ALERT_CONDITION_LABELS) as AlertCondition[];

export default function ProductScreen() {
  const params = useLocalSearchParams<{ code: string; region?: string }>();
  const code = params.code;
  const [region, setRegion] = useState(params.region ?? '');
  const [days, setDays] = useState(30);
  const [showForm, setShowForm] = useState(false);

  const latest = useAsync(() => api.prices({ product: code }), [code]);
  const history = useAsync(() => api.history(code, { region: region || null, days }), [code, region, days]);

  const rows = latest.state.status === 'ok' ? latest.state.data.data : [];
  const product = history.state.status === 'ok' ? history.state.data.product : rows[0]?.product;
  const regionName = rows.find((r) => r.region.code === region)?.region.name ?? 'Trung bình các vùng';

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={history.refreshing}
          onRefresh={() => {
            latest.reload();
            history.reload();
          }}
          colors={[colors.primary]}
        />
      }
    >
      <Stack.Screen options={{ title: product?.name ?? '' }} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 10 }}>
        <Chip label="Trung bình" active={region === ''} onPress={() => setRegion('')} />
        {rows.map((row) => (
          <Chip key={row.region.code} label={row.region.name} active={row.region.code === region} onPress={() => setRegion(row.region.code)} />
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {RANGES.map((d) => (
          <Chip key={d} label={`${d} ngày`} active={d === days} onPress={() => setDays(d)} />
        ))}
      </View>

      <Card>
        <Status state={history.state} retry={history.reload} />
        {history.state.status === 'ok' && <PriceChart points={history.state.data.points} unit={product?.unit ?? 'kg'} />}
      </Card>

      {product && (
        <Card>
          {showForm ? (
            <AlertForm productCode={code} unit={product.unit} region={region} regionName={regionName} onDone={() => setShowForm(false)} />
          ) : (
            <Button label="🔔 Đặt cảnh báo giá" onPress={() => setShowForm(true)} />
          )}
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <Text style={{ fontSize: font.body + 1, fontWeight: '700', marginBottom: 4, color: colors.text }}>Giá mới nhất theo vùng</Text>
          {rows.map((row) => (
            <View
              key={row.region.code}
              style={{
                flexDirection: 'row',
                paddingVertical: 10,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                backgroundColor: row.region.code === region ? colors.primarySoft : undefined,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.body}>{row.region.name}</Text>
                <Text style={styles.muted}>{formatDate(row.date)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: font.body, fontWeight: '700', color: colors.text }}>{formatPriceRange(row)}</Text>
                <Change value={row.change} />
              </View>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

function AlertForm({ productCode, unit, region, regionName, onDone }: { productCode: string; unit: string; region: string; regionName: string; onDone: () => void }) {
  const [condition, setCondition] = useState<AlertCondition>('change');
  const [threshold, setThreshold] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const amount = parseVnd(threshold);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const push = await registerPush(true);
      await api.createAlert({ product: productCode, region: region || null, condition, threshold: condition === 'change' ? null : amount });
      if (!push.ok) {
        setMessage(`Đã lưu cảnh báo, nhưng máy chưa nhận được thông báo: ${push.reason}`);
        return;
      }
      onDone();
      router.navigate('/alerts');
    } catch (e) {
      const errors = e instanceof ApiError ? Object.values(e.errors).flat() : [];
      setMessage(errors[0] ?? (e instanceof Error ? e.message : 'Không lưu được.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.body}>
        Báo cho tôi về giá ở <Text style={{ fontWeight: '700' }}>{regionName}</Text>
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {CONDITIONS.map((c) => (
          <Chip key={c} label={ALERT_CONDITION_LABELS[c]} active={c === condition} onPress={() => setCondition(c)} />
        ))}
      </View>
      {condition !== 'change' && (
        <View>
          <TextInput
            keyboardType="number-pad"
            placeholder={`Giá (đ/${unit})`}
            placeholderTextColor={colors.muted}
            value={amount ? formatNumber(amount) : ''}
            onChangeText={setThreshold}
            style={{ minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, fontSize: font.title, color: colors.text }}
          />
          {amount > 0 && <Text style={styles.muted}>{readVnd(amount)} / {unit}</Text>}
        </View>
      )}
      {message && <Text style={[styles.body, { color: colors.down }]}>{message}</Text>}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button label={saving ? 'Đang lưu…' : 'Lưu cảnh báo'} onPress={save} disabled={saving || (condition !== 'change' && amount <= 0)} />
        </View>
        <Button label="Hủy" variant="outline" onPress={onDone} />
      </View>
    </View>
  );
}
