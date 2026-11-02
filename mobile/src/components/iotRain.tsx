import { formatDecimal, rainOfDay, type IotRainfall } from '@nhanong/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Text } from './AppText';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { iotApi } from '../lib/iot';
import { colors, font, fontFamilyFor } from '../lib/theme';
import { useAsync } from '../lib/useAsync';
import { Button, Card, Chip, Status, styles } from './ui';

const RANGES = [7, 30, 90, 365];
const H = 160;
const PAD = { top: 10, right: 6, bottom: 22, left: 34 };

/** Lượng mưa từng ngày tại vườn. Miễn phí xem 30 ngày, có gói Nhà Nông xem 1 năm. */
export function RainHistory({ farmId }: { farmId: number }) {
  const [days, setDays] = useState(30);
  const rainfall = useAsync(() => iotApi.rainfall(farmId, days), [farmId, days]);
  const data = rainfall.state.status === 'ok' ? rainfall.state.data : null;

  return (
    <Card>
      <Text style={[styles.body, { fontWeight: '700', marginBottom: 8 }]}>🌧️ Lượng mưa tại vườn</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {RANGES.map((n) => (
          <Chip key={n} small label={n === 365 ? '1 năm' : `${n} ngày`} active={n === days} onPress={() => setDays(n)} />
        ))}
      </View>
      <Status state={rainfall.state} retry={rainfall.reload} />
      {data && (
        <>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
            <Stat label="Tổng" value={`${formatDecimal(data.total_mm)} mm`} />
            <Stat label="Ngày có mưa" value={`${data.rainy_days}/${data.days}`} />
          </View>
          <RainBars data={data} />
          {data.has_gauge && <Text style={[styles.muted, { marginTop: 6 }]}>Ngày có máy đo mưa thì lấy số đo thật; các ngày khác theo dữ liệu thời tiết.</Text>}
          {data.locked && <PlanNotice data={data} />}
          {!data.locked && !data.plan.premium && days <= 30 && (
            <Text style={[styles.muted, { marginTop: 8 }]}>Tài khoản miễn phí xem {data.max_days} ngày gần nhất. Có gói Nhà Nông thì xem được 1 năm.</Text>
          )}
        </>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.infoSoft, borderRadius: 12, padding: 10 }}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={{ fontSize: font.title - 2, fontWeight: '800', color: colors.info }}>{value}</Text>
    </View>
  );
}

function PlanNotice({ data }: { data: IotRainfall }) {
  return (
    <View style={{ backgroundColor: colors.accentSoft, borderRadius: 12, padding: 12, marginTop: 10, gap: 8 }}>
      <Text style={[styles.body, { color: colors.accentText }]}>
        🔒 Tài khoản miễn phí chỉ xem được {data.max_days} ngày gần nhất. Có gói Nhà Nông thì xem lượng mưa 1 năm.
      </Text>
      {!data.plan.linked && <Text style={styles.muted}>Đăng nhập tài khoản Nhà Nông (mục Tài khoản) trên máy này để dùng chung gói.</Text>}
      <Button label="Xem gói Nhà Nông" variant="outline" onPress={() => router.push('/account')} />
    </View>
  );
}

/** Cột mưa từng ngày; nhiều ngày (1 năm) thì gộp theo tuần cho dễ nhìn */
function RainBars({ data }: { data: IotRainfall }) {
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  const step = data.days > 120 ? 7 : 1;
  const bars: { label: string; mm: number | null }[] = [];
  for (let i = 0; i < data.data.length; i += step) {
    const group = data.data.slice(i, i + step);
    const values = group.map(rainOfDay).filter((v): v is number => v !== null);
    const d = new Date(`${group[0].date}T00:00:00`);
    bars.push({ label: `${step > 1 ? 'tuần từ ' : ''}${d.getDate()}/${d.getMonth() + 1}`, mm: values.length ? values.reduce((a, b) => a + b, 0) : null });
  }

  const max = Math.max(5, ...bars.map((b) => b.mm ?? 0));
  const innerW = Math.max(width - PAD.left - PAD.right, 1);
  const innerH = H - PAD.top - PAD.bottom;
  const barW = innerW / bars.length;
  const y = (v: number) => PAD.top + (1 - v / max) * innerH;
  const current = active === null ? null : bars[active];

  const pick = (x: number) => setActive(Math.min(bars.length - 1, Math.max(0, Math.floor((x - PAD.left) / barW))));

  return (
    <View>
      <Text style={[styles.body, { minHeight: 24 }]}>
        {current ? (
          <>
            <Text style={{ fontWeight: '700' }}>{current.label}</Text>: {current.mm === null ? 'chưa có số liệu' : `${formatDecimal(current.mm)} mm`}
          </>
        ) : (
          <Text style={styles.muted}>Chạm vào cột để xem từng {step > 1 ? 'tuần' : 'ngày'}</Text>
        )}
      </Text>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => pick(e.nativeEvent.locationX)}
        onResponderMove={(e) => pick(e.nativeEvent.locationX)}
        accessibilityLabel={`Biểu đồ lượng mưa ${data.days} ngày`}
      >
        {width > 0 && (
          <Svg width={width} height={H}>
            {[0, max / 2, max].map((v) => (
              <Line key={`g${v}`} x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke={colors.border} />
            ))}
            {[0, max / 2, max].map((v) => (
              <SvgText fontFamily={fontFamilyFor('400') ?? undefined} key={`t${v}`} x={PAD.left - 4} y={y(v) + 4} fontSize={10} fill={colors.muted} textAnchor="end">
                {Math.round(v)}
              </SvgText>
            ))}
            {bars.map((b, i) =>
              b.mm === null || b.mm === 0 ? null : (
                <Rect key={i} x={PAD.left + i * barW + barW * 0.15} y={y(b.mm)} width={Math.max(barW * 0.7, 1)} height={Math.max(innerH - (y(b.mm) - PAD.top), 1)} rx={Math.min(3, barW / 3)} fill={i === active ? colors.primary : colors.info} />
              ),
            )}
            <SvgText fontFamily={fontFamilyFor('400') ?? undefined} x={PAD.left} y={H - 6} fontSize={11} fill={colors.muted}>
              {bars[0]?.label.replace('tuần từ ', '')}
            </SvgText>
            <SvgText fontFamily={fontFamilyFor('400') ?? undefined} x={width - PAD.right} y={H - 6} fontSize={11} fill={colors.muted} textAnchor="end">
              Hôm nay
            </SvgText>
          </Svg>
        )}
      </View>
      <Text style={styles.muted}>mm mưa / {step > 1 ? 'tuần' : 'ngày'}</Text>
    </View>
  );
}
