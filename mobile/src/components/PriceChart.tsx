import { formatDate, formatNumber, type HistoryPoint } from '@nhanong/shared';
import { useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { colors } from '../lib/theme';
import { styles } from './ui';

const H = 200;
const PAD = { top: 10, right: 10, bottom: 22, left: 54 };

type Interval = 'day' | 'week' | 'month';

/** Nhãn 1 điểm: ngày, "tuần từ 13/10/2025" hoặc "tháng 10/2025" */
function pointLabel(date: string, interval: Interval): string {
  if (interval === 'month') return `tháng ${Number(date.slice(5, 7))}/${date.slice(0, 4)}`;
  if (interval === 'week') return `tuần từ ${formatDate(date)}`;
  return formatDate(date);
}

/** Đường giá trung bình + dải thấp–cao. Chạm/kéo ngón tay để xem giá từng ngày (từng tuần / tháng khi xem khoảng dài). */
export function PriceChart({ points, unit, interval = 'day' }: { points: HistoryPoint[]; unit: string; interval?: Interval }) {
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  if (points.length === 0) return <Text style={styles.muted}>Chưa có dữ liệu trong khoảng này.</Text>;
  if (points.length === 1)
    return (
      <Text style={styles.body}>
        Mới có giá {interval === 'day' ? 'ngày ' : ''}{pointLabel(points[0].date, interval)}: {formatNumber(points[0].avg)} đ/{unit}. Biểu đồ sẽ hiện khi có thêm ngày.
      </Text>
    );

  const values = points.flatMap((p) => [p.min, p.max]);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const margin = Math.max((hi - lo) * 0.1, hi * 0.01, 1);
  lo -= margin;
  hi += margin;

  const innerW = Math.max(width - PAD.left - PAD.right, 1);
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * innerW;
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * innerH;

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.avg)}`).join('');
  const band =
    points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.max)}`).join('') +
    points
      .map((p, i) => ({ p, i }))
      .reverse()
      .map(({ p, i }) => `L${x(i)},${y(p.min)}`)
      .join('') +
    'Z';

  const ticks = [0, 0.5, 1].map((t) => lo + (hi - lo) * t);
  const labelEvery = Math.max(1, Math.ceil(points.length / 5));
  const current = active === null ? null : points[active];

  const pick = (locationX: number) => {
    const i = Math.round(((locationX - PAD.left) / innerW) * (points.length - 1));
    setActive(Math.min(points.length - 1, Math.max(0, i)));
  };

  return (
    <View>
      <Text style={[styles.body, { minHeight: 24, marginBottom: 4 }]} accessibilityLiveRegion="polite">
        {current ? (
          <>
            <Text style={{ fontWeight: '700' }}>{pointLabel(current.date, interval)}</Text>: {formatNumber(current.avg)} đ/{unit}
            {current.min !== current.max && <Text style={styles.muted}> ({formatNumber(current.min)} – {formatNumber(current.max)})</Text>}
          </>
        ) : (
          <Text style={styles.muted}>Chạm vào biểu đồ để xem giá từng ngày</Text>
        )}
      </Text>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => pick(e.nativeEvent.locationX)}
        onResponderMove={(e) => pick(e.nativeEvent.locationX)}
        accessibilityLabel={`Biểu đồ giá ${points.length} ngày`}
      >
        {width > 0 && (
          <Svg width={width} height={H}>
            {ticks.map((v) => (
              <Line key={`g${v}`} x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke={colors.border} />
            ))}
            {ticks.map((v) => (
              <SvgText key={`t${v}`} x={PAD.left - 6} y={y(v) + 4} fontSize={11} fill={colors.muted} textAnchor="end">
                {formatNumber(v)}
              </SvgText>
            ))}
            {points.map(
              (p, i) =>
                ((i % labelEvery === 0 && points.length - 1 - i >= labelEvery / 2) || i === points.length - 1) && (
                  <SvgText
                    key={p.date}
                    x={x(i)}
                    y={H - 6}
                    fontSize={11}
                    fill={colors.muted}
                    textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
                  >
                    {interval === 'day' ? formatDate(p.date, true) : `${p.date.slice(5, 7)}/${p.date.slice(2, 4)}`}
                  </SvgText>
                ),
            )}
            <Path d={band} fill={colors.band} />
            <Path d={line} fill="none" stroke={colors.primary} strokeWidth={2} strokeLinejoin="round" />
            {current && active !== null && (
              <>
                <Line x1={x(active)} x2={x(active)} y1={PAD.top} y2={H - PAD.bottom} stroke={colors.muted} strokeDasharray="3 3" />
                <Circle cx={x(active)} cy={y(current.avg)} r={5} fill={colors.primary} />
              </>
            )}
          </Svg>
        )}
      </View>
    </View>
  );
}
