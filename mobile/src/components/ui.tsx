import { formatChange, trendOf } from '@nhanong/shared';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, font } from '../lib/theme';
import type { AsyncState } from '../lib/useAsync';

const ARROWS = { up: '▲', down: '▼', flat: '–', none: '' };

export function Change({ value }: { value: number | null }) {
  const trend = trendOf(value);
  if (trend === 'none') return <Text style={[styles.change, { color: colors.muted }]}>mới</Text>;
  const color = trend === 'up' ? colors.up : trend === 'down' ? colors.down : colors.muted;
  return (
    <Text style={[styles.change, { color }]}>
      {ARROWS[trend]} {formatChange(value).replace(/^[+-]/, '')}
    </Text>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function Button({ label, onPress, disabled, variant = 'primary' }: { label: string; onPress: () => void; disabled?: boolean; variant?: 'primary' | 'outline' }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [styles.button, variant === 'outline' && styles.buttonOutline, (pressed || disabled) && { opacity: 0.6 }]}
    >
      <Text style={[styles.buttonText, variant === 'outline' && { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

/** Đang tải / lỗi; trả null khi đã có dữ liệu */
export function Status({ state, retry }: { state: AsyncState<unknown>; retry: () => void }) {
  if (state.status === 'loading') return <ActivityIndicator style={{ margin: 24 }} color={colors.primary} />;
  if (state.status === 'error')
    return (
      <Card style={{ borderColor: colors.error }}>
        <Text style={[styles.body, { color: colors.error, marginBottom: 8 }]}>{state.error.message}</Text>
        <Button label="Thử lại" onPress={retry} variant="outline" />
      </Card>
    );
  return null;
}

export const styles = StyleSheet.create({
  body: { fontSize: font.body, color: colors.text },
  muted: { fontSize: font.small, color: colors.muted },
  change: { fontSize: font.small, fontWeight: '600' },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: font.body, color: colors.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  button: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.primary },
  buttonText: { color: '#fff', fontSize: font.body, fontWeight: '600' },
});
