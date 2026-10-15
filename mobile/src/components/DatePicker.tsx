import { formatDateLong, today } from '@nhanong/shared';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { colors, font } from '../lib/theme';
import { Button, Chip, styles } from './ui';

/** Lịch tuần bắt đầu từ Thứ 2, như lịch treo tường ở Việt Nam */
const WEEK_HEAD = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** "YYYY-MM-DD" của ngày cách hôm nay `days` ngày (âm = trước) */
function shiftDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return today(d);
}

/** Các ô của tháng: null là ô trống đầu/cuối tháng */
function monthCells(year: number, month: number): Array<number | null> {
  const first = new Date(year, month - 1, 1).getDay(); // 0 = CN
  const lead = (first + 6) % 7; // số ô trống trước ngày 1 khi tuần bắt đầu Thứ 2
  const days = new Date(year, month, 0).getDate();
  const cells: Array<number | null> = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  return cells;
}

/**
 * Ô chọn ngày: hiện "Thứ Năm, 15/10/2026", bấm vào mở lịch.
 * value: "YYYY-MM-DD" hoặc "" (chưa chọn, khi optional). max/min giới hạn ngày được chọn.
 */
export function DatePicker({
  value,
  onChange,
  optional,
  max,
  min,
  placeholder = 'Chọn ngày',
}: {
  value: string;
  onChange: (v: string) => void;
  optional?: boolean;
  max?: string;
  min?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const shown = value || today();
  const [view, setView] = useState({ y: Number(shown.slice(0, 4)), m: Number(shown.slice(5, 7)) });
  const now = today();
  const allowed = (d: string) => (!max || d <= max) && (!min || d >= min);
  const quick = [
    { label: 'Hôm nay', date: now },
    { label: 'Hôm qua', date: shiftDays(-1) },
  ].filter((q) => allowed(q.date));

  const show = () => {
    setView({ y: Number(shown.slice(0, 4)), m: Number(shown.slice(5, 7)) });
    setOpen(true);
  };
  const pick = (d: string) => {
    onChange(d);
    setOpen(false);
  };
  const move = (delta: number) => {
    const d = new Date(view.y, view.m - 1 + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() + 1 });
  };
  // Không cho lật sang tháng nằm hẳn ngoài giới hạn
  const canPrev = !min || iso(view.y, view.m, 1) > min;
  const canNext = !max || iso(view.y, view.m, new Date(view.y, view.m, 0).getDate()) < max;

  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Pressable
          onPress={show}
          accessibilityRole="button"
          accessibilityLabel={value ? `Ngày ${formatDateLong(value)}, bấm để đổi` : placeholder}
          style={({ pressed }) => ({
            flexGrow: 1,
            minHeight: 48,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 12,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            backgroundColor: colors.surface,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ fontSize: 20 }}>📅</Text>
          <Text style={[styles.body, !value && { color: colors.muted }]}>{value ? formatDateLong(value) : placeholder}</Text>
        </Pressable>
        {quick.map((q) => (
          <Chip key={q.label} label={q.label} active={value === q.date} onPress={() => onChange(q.date)} />
        ))}
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 16 }}>
          {/* Bấm trong lịch không đóng lịch */}
          <Pressable onPress={() => {}} style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, maxWidth: 420, width: '100%', alignSelf: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <NavButton label="‹" hint="Tháng trước" disabled={!canPrev} onPress={() => move(-1)} />
              <Text style={{ fontSize: font.title, fontWeight: '700', color: colors.text }}>
                Tháng {view.m}/{view.y}
              </Text>
              <NavButton label="›" hint="Tháng sau" disabled={!canNext} onPress={() => move(1)} />
            </View>

            <View style={{ flexDirection: 'row' }}>
              {WEEK_HEAD.map((w) => (
                <Text key={w} style={{ flex: 1, textAlign: 'center', fontSize: font.small, fontWeight: '600', color: w === 'CN' ? colors.loss : colors.muted, paddingVertical: 6 }}>
                  {w}
                </Text>
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {monthCells(view.y, view.m).map((day, i) => {
                if (day === null) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
                const d = iso(view.y, view.m, day);
                const selected = d === value;
                const isToday = d === now;
                const ok = allowed(d);
                return (
                  <Pressable
                    key={d}
                    onPress={() => ok && pick(d)}
                    disabled={!ok}
                    accessibilityRole="button"
                    accessibilityLabel={formatDateLong(d)}
                    accessibilityState={{ selected, disabled: !ok }}
                    style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}
                  >
                    <View
                      style={{
                        flex: 1,
                        borderRadius: 999,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: selected ? colors.primary : 'transparent',
                        borderWidth: isToday && !selected ? 2 : 0,
                        borderColor: colors.primary,
                      }}
                    >
                      <Text style={{ fontSize: font.body, fontWeight: selected || isToday ? '700' : '400', color: selected ? '#fff' : ok ? (i % 7 === 6 ? colors.loss : colors.text) : colors.border }}>
                        {day}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {allowed(now) && (
                <View style={{ flex: 1 }}>
                  <Button label="Hôm nay" variant="outline" onPress={() => pick(now)} />
                </View>
              )}
              {optional && value !== '' && (
                <View style={{ flex: 1 }}>
                  <Button label="Bỏ ngày" variant="outline" onPress={() => pick('')} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Button label="Đóng" variant="outline" onPress={() => setOpen(false)} />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function NavButton({ label, hint, disabled, onPress }: { label: string; hint: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={hint}
      hitSlop={8}
      style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, opacity: disabled ? 0.3 : 1 }}
    >
      <Text style={{ fontSize: 26, color: colors.primary, lineHeight: 30 }}>{label}</Text>
    </Pressable>
  );
}
