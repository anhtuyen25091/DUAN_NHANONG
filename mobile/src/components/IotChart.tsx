import { formatDecimal, pointValue, type IotInterval, type IotPlotEvent, type IotPoint } from '@nhanong/shared';
import { useState } from 'react';
import { View } from 'react-native';
import { Text } from './AppText';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { colors, fontFamilyFor } from '../lib/theme';
import { styles } from './ui';
import { WORK_ICONS } from './farmWork';

const H = 200;
const PAD = { top: 10, right: 10, bottom: 22, left: 46 };

/** "14:30" (từng lần đo, theo giờ) hoặc "28/10" (theo ngày); kèm ngày khi cần phân biệt */
function timeLabel(iso: string, interval: IotInterval, withDate = false): string {
  const d = new Date(iso);
  const day = `${d.getDate()}/${d.getMonth() + 1}`;
  if (interval === 'day') return day;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return withDate ? `${time} ${day}` : time;
}

/** Đường số đo (trung bình nếu đã gộp) + dải thấp–cao + vạch ngưỡng. Chạm / kéo để xem từng điểm. */
export function IotChart({
  points,
  interval,
  unit,
  min,
  max,
  events = [],
}: {
  points: IotPoint[];
  interval: IotInterval;
  unit: string | null;
  min: number | null;
  max: number | null;
  /** Việc làm vườn của lô: vạch dọc + biểu tượng tại lúc làm */
  events?: IotPlotEvent[];
}) {
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  if (points.length === 0) return <Text style={styles.muted}>Chưa có số đo trong khoảng này.</Text>;

  const values = points.flatMap((p) => ('avg' in p ? [p.min, p.max] : [p.value]));
  const limits = [min, max].filter((v): v is number => v !== null);
  let lo = Math.min(...values, ...limits);
  let hi = Math.max(...values, ...limits);
  const margin = Math.max((hi - lo) * 0.1, Math.abs(hi) * 0.01, 0.1);
  lo -= margin;
  hi += margin;

  const innerW = Math.max(width - PAD.left - PAD.right, 1);
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * innerH;

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(pointValue(p))}`).join('');
  const grouped = points.every((p) => 'avg' in p);
  const band = grouped
    ? points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y((p as { max: number }).max)}`).join('') +
      points
        .map((p, i) => ({ p, i }))
        .reverse()
        .map(({ p, i }) => `L${x(i)},${y((p as { min: number }).min)}`)
        .join('') +
      'Z'
    : null;

  const ticks = [0, 0.5, 1].map((t) => lo + (hi - lo) * t);
  const labelEvery = Math.max(1, Math.ceil(points.length / 4));
  const current = active === null ? null : points[active];
  const outside = (v: number) => (min !== null && v < min) || (max !== null && v > max);

  // Vị trí việc làm vườn trên trục ngang (trục theo thứ tự điểm đo: nội suy giữa 2 điểm kề nhau)
  const times = points.map((p) => new Date(p.t).getTime());
  const markers = events
    .filter((e) => !e.planned)
    .map((e) => {
      const t = new Date(e.done_at).getTime();
      if (points.length < 2 || t < times[0] || t > times[times.length - 1]) return null;
      let i = 0;
      while (i < times.length - 2 && times[i + 1] < t) i++;
      const span = times[i + 1] - times[i];
      return { event: e, x: x(i + (span > 0 ? (t - times[i]) / span : 0)) };
    })
    .filter((m): m is { event: IotPlotEvent; x: number } => m !== null)
    .sort((a, b) => a.x - b.x)
    // Biểu tượng sát nhau thì xếp hàng dưới (row) để không đè lên nhau
    .map((m, i, all) => {
      let row = 0;
      for (let j = i - 1; j >= 0 && m.x - all[j].x < 16; j--) row = Math.max(row, (all[j] as { row?: number }).row ?? 0) + 1;
      return Object.assign(m, { row: Math.min(row, 3) });
    })
    // Việc tưới vẽ trước (nằm dưới)
    .sort((a, b) => Number(b.event.kind === 'water') - Number(a.event.kind === 'water'));

  const pick = (locationX: number) => {
    const i = Math.round(((locationX - PAD.left) / innerW) * (points.length - 1));
    setActive(Math.min(points.length - 1, Math.max(0, i)));
  };

  return (
    <View>
      <Text style={[styles.body, { minHeight: 24, marginBottom: 4 }]} accessibilityLiveRegion="polite">
        {current ? (
          <>
            <Text style={{ fontWeight: '700' }}>{timeLabel(current.t, interval, true)}</Text>:{' '}
            <Text style={{ color: outside(pointValue(current)) ? colors.error : colors.text, fontWeight: '700' }}>
              {formatDecimal(pointValue(current))}
              {unit ? ` ${unit}` : ''}
            </Text>
            {'avg' in current && current.min !== current.max && (
              <Text style={styles.muted}>
                {' '}
                ({formatDecimal(current.min)} – {formatDecimal(current.max)})
              </Text>
            )}
          </>
        ) : (
          <Text style={styles.muted}>Chạm vào biểu đồ để xem từng lần đo</Text>
        )}
      </Text>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => pick(e.nativeEvent.locationX)}
        onResponderMove={(e) => pick(e.nativeEvent.locationX)}
        accessibilityLabel={`Biểu đồ ${points.length} điểm`}
      >
        {width > 0 && (
          <Svg width={width} height={H}>
            {ticks.map((v) => (
              <Line key={`g${v}`} x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke={colors.border} />
            ))}
            {ticks.map((v) => (
              <SvgText fontFamily={fontFamilyFor('400') ?? undefined} key={`t${v}`} x={PAD.left - 6} y={y(v) + 4} fontSize={11} fill={colors.muted} textAnchor="end">
                {formatDecimal(v)}
              </SvgText>
            ))}
            {limits.map((v) => (
              <Line key={`l${v}`} x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke={colors.error} strokeDasharray="6 4" />
            ))}
            {points.map(
              (p, i) =>
                ((i % labelEvery === 0 && points.length - 1 - i >= labelEvery / 2) || i === points.length - 1) && (
                  <SvgText fontFamily={fontFamilyFor('400') ?? undefined} key={p.t} x={x(i)} y={H - 6} fontSize={11} fill={colors.muted} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>
                    {timeLabel(p.t, interval)}
                  </SvgText>
                ),
            )}
            {markers.map(({ event, x: mx, row }) => {
              const water = event.kind === 'water';
              const iconY = PAD.top + 12 + row * 16;
              return (
                <G key={`e${event.id}`} opacity={water ? 0.45 : 0.9}>
                  <Line x1={mx} x2={mx} y1={iconY + 2} y2={H - PAD.bottom} stroke={water ? colors.info : colors.accentText} strokeWidth={water ? 1 : 1.5} strokeDasharray={water ? '2 3' : undefined} />
                  <SvgText x={Math.min(Math.max(mx, PAD.left + 7), width - 8)} y={iconY} fontSize={water ? 10 : 14} textAnchor="middle">
                    {WORK_ICONS[event.kind]}
                  </SvgText>
                </G>
              );
            })}
            {band && <Path d={band} fill={colors.band} />}
            <Path d={line} fill="none" stroke={colors.primary} strokeWidth={2} strokeLinejoin="round" />
            {current && active !== null && (
              <>
                <Line x1={x(active)} x2={x(active)} y1={PAD.top} y2={H - PAD.bottom} stroke={colors.muted} strokeDasharray="3 3" />
                <Circle cx={x(active)} cy={y(pointValue(current))} r={5} fill={outside(pointValue(current)) ? colors.error : colors.primary} />
              </>
            )}
          </Svg>
        )}
      </View>
      {limits.length > 0 && <Text style={[styles.muted, { marginTop: 4 }]}>Vạch đỏ đứt: ngưỡng an toàn</Text>}
      {markers.length > 0 && <Text style={[styles.muted, { marginTop: 4 }]}>🧴 phun thuốc · 🌱 bón phân · 💧 tưới · ✂️ tỉa cành · 📝 việc khác</Text>}
    </View>
  );
}
