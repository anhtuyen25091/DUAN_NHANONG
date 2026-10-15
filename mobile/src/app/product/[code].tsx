import { ALERT_CONDITION_LABELS, ApiError, formatDate, formatNumber, formatPriceRange, parseVnd, readVnd, type AccessTier, type AlertCondition } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { PriceChart } from '../../components/PriceChart';
import { LocationBar } from '../../components/LocationPicker';
import { LocalPriceList } from '../../components/localPrices';
import { useMyLocation } from '../../lib/myLocation';
import { Button, Card, Change, Chip, Status, styles } from '../../components/ui';
import { api } from '../../lib/api';
import { setAuth, updateAuthUser, useAuth } from '../../lib/auth';
import { registerPush } from '../../lib/push';
import { colors, font } from '../../lib/theme';
import { useAsync } from '../../lib/useAsync';

const RANGES: Array<{ days: number; label: string }> = [
  { days: 10, label: '10 ngày' },
  { days: 30, label: '30 ngày' },
  { days: 90, label: '3 tháng' },
  { days: 365, label: '1 năm' },
  { days: 1827, label: '5 năm' },
];

/** Xem được bao nhiêu ngày theo mức tài khoản (khớp config/nhanong.php của backend) */
const TIER_DAYS: Record<AccessTier, number> = { guest: 10, member: 30, premium: Infinity };
const CONDITIONS = Object.keys(ALERT_CONDITION_LABELS) as AlertCondition[];

export default function ProductScreen() {
  const params = useLocalSearchParams<{ code: string; region?: string }>();
  const code = params.code;
  const [region, setRegion] = useState(params.region ?? '');
  const auth = useAuth();
  const tier: AccessTier = auth?.user.tier ?? (auth ? 'member' : 'guest');
  // Chưa chọn khoảng: khách xem 10 ngày, đã đăng nhập xem 30 ngày
  const [chosenDays, setDays] = useState<number | null>(null);
  const days = chosenDays ?? (tier === 'guest' ? 10 : 30);
  const locked = (d: number) => d > TIER_DAYS[tier];
  const [showForm, setShowForm] = useState(false);

  const latest = useAsync(() => api.prices({ product: code }), [code]);
  const history = useAsync(
    () =>
      api.history(code, { region: region || null, days, token: auth?.token }).catch((error) => {
        // Token hết hạn / bị hủy: đăng xuất trên máy rồi xem như khách
        if (error instanceof ApiError && error.status === 401 && auth) {
          setAuth(null);
          return api.history(code, { region: region || null, days });
        }
        throw error;
      }),
    [code, region, days, auth?.token],
  );
  // Mức xem thật do server trả về (admin vừa kích hoạt gói…)
  const served = history.state.status === 'ok' ? history.state.data.access.tier : null;
  useEffect(() => {
    // Lấy lại đủ thông tin tài khoản (mức xem + hạn gói) khi server báo mức xem khác
    if (auth && served && served !== 'guest' && served !== auth.user.tier) api.me(auth.token).then(updateAuthUser, () => {});
  }, [auth, served]);

  const rows = latest.state.status === 'ok' ? latest.state.data.data : [];
  const product = history.state.status === 'ok' ? history.state.data.product : rows[0]?.product;
  const interval = history.state.status === 'ok' ? history.state.data.interval : 'day';
  const points = history.state.status === 'ok' ? history.state.data.points : [];
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
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {RANGES.map((r) => (
          <Chip key={r.days} label={`${locked(r.days) ? '🔒 ' : ''}${r.label}`} active={r.days === days} onPress={() => setDays(r.days)} />
        ))}
      </View>

      {history.state.status === 'ok' && history.state.data.access.limited && (
        <UpgradeNotice tier={history.state.data.access.tier} firstDate={history.state.data.access.first_date} />
      )}

      <Card>
        <Status state={history.state} retry={history.reload} />
        {history.state.status === 'ok' && <PriceChart points={points} unit={product?.unit ?? 'kg'} interval={interval} />}
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

      {points.length > 0 && (
        <Card>
          <Text style={{ fontSize: font.body + 1, fontWeight: '700', marginBottom: 4, color: colors.text }}>
            {interval !== 'day' ? `Giá trung bình từng ${interval === 'week' ? 'tuần' : 'tháng'}` : 'Giá từng ngày'}
          </Text>
          {[...points].reverse().map((p) => (
            <View key={p.date} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text style={[styles.body, { flex: 1 }]}>{interval === 'month' ? `Tháng ${Number(p.date.slice(5, 7))}/${p.date.slice(0, 4)}` : formatDate(p.date)}</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: font.body, fontWeight: '700', color: colors.text }}>{formatNumber(p.avg)}</Text>
                {p.min !== p.max && <Text style={styles.muted}>{formatPriceRange({ price_min: p.min, price_max: p.max })}</Text>}
              </View>
            </View>
          ))}
        </Card>
      )}
      <LocalForProduct code={code} />
    </ScrollView>
  );
}

/** Khoảng xem bị giới hạn: mời đăng ký (khách) hoặc mua gói (thành viên) */
function UpgradeNotice({ tier, firstDate }: { tier: AccessTier; firstDate: string | null }) {
  const since = firstDate ? ` (có dữ liệu từ ${formatDate(firstDate)})` : '';
  const openAccount = () => router.push({ pathname: '/account', params: { back: '1' } });
  return (
    <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primary, gap: 10 }}>
      {tier === 'guest' ? (
        <>
          <Text style={styles.body}>
            Bạn đang xem <Text style={{ fontWeight: '700' }}>{TIER_DAYS.guest} ngày gần nhất</Text>. Đăng ký miễn phí để xem {TIER_DAYS.member} ngày; mua gói để xem toàn bộ lịch sử giá{since}.
          </Text>
          <Button label="Đăng ký / Đăng nhập" onPress={openAccount} />
        </>
      ) : (
        <>
          <Text style={styles.body}>
            Tài khoản thường xem được <Text style={{ fontWeight: '700' }}>{TIER_DAYS.member} ngày gần nhất</Text>. Mua gói tháng / năm để xem toàn bộ lịch sử giá{since}.
          </Text>
          <Button label="Xem các gói" onPress={openAccount} />
        </>
      )}
    </Card>
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

/** Giá các điểm mua quanh khu vực của tôi cho mặt hàng này */
function LocalForProduct({ code }: { code: string }) {
  const location = useMyLocation();
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={{ fontSize: font.title - 2, fontWeight: '700', color: colors.text, marginBottom: 6 }}>📍 Giá các điểm mua quanh bạn</Text>
      {location ? <LocalPriceList product={code} /> : <LocationBar />}
    </View>
  );
}
