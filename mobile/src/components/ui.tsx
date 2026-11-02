import { ApiError, formatChange, trendOf } from '@nhanong/shared';
import { router } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './AppText';
import { colors, font, primaryShadow, radius, shadow, themed } from '../lib/theme';
import { BrandGradient } from './Gradient';
import { setAuth } from '../lib/auth';
import { syncIotWithNhanong } from '../lib/iot';
import type { AsyncState } from '../lib/useAsync';

const ARROWS = { up: '▲', down: '▼', flat: '–', none: '' };

export function Change({ value }: { value: number | null }) {
  const trend = trendOf(value);
  if (trend === 'none') return <Text style={[styles.change, { color: colors.muted }]}>giá mới</Text>;
  if (trend === 'flat') return <Text style={[styles.change, { color: colors.muted }]}>giữ giá</Text>;
  const color = trend === 'up' ? colors.up : trend === 'down' ? colors.down : colors.muted;
  // Viên màu nhạt quanh mức tăng / giảm cho dễ thấy
  const bg = trend === 'up' ? colors.gainSoft : trend === 'down' ? colors.lossSoft : colors.surface2;
  return (
    <Text style={[styles.change, { color, backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 1, borderRadius: 999, overflow: 'hidden' }]}>
      {ARROWS[trend]} {formatChange(value).replace(/^[+-]/, '')}
    </Text>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** small: chip thấp hơn (36), dùng ở chỗ cần nhường chỗ, vd thanh lọc trên bản đồ */
export function Chip({ label, active, onPress, small }: { label: string; active: boolean; onPress: () => void; small?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, small && { minHeight: 36, paddingHorizontal: 12 }, active && styles.chipActive]}
    >
      {active && <BrandGradient radius={999} />}
      <Text style={[styles.chipText, small && { fontSize: font.small + 1 }, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function Button({ label, onPress, disabled, variant = 'primary' }: { label: string; onPress: () => void; disabled?: boolean; variant?: 'primary' | 'outline' | 'danger' }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && !disabled && primaryShadow,
        variant !== 'primary' && styles.buttonOutline,
        variant === 'danger' && { borderColor: colors.error },
        // Bị khóa: nền phẳng + chữ xám (làm mờ dải xanh thì trên nền tối thành màu đục, khó đọc)
        disabled && styles.buttonDisabled,
        pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
      ]}
    >
      {variant === 'primary' && !disabled && <BrandGradient radius={radius.control} />}
      <Text
        style={[
          styles.buttonText,
          variant === 'outline' && { color: colors.primary },
          variant === 'danger' && { color: colors.error },
          disabled && { color: colors.muted },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

let lastIotReconnect = 0;

/** Vào lại Cảm biến bằng tài khoản Nhà Nông (lib/iot.ts) rồi tải lại; tự làm tối đa 1 lần / 30 giây để không lặp mãi */
function IotReconnect({ retry }: { retry: () => void }) {
  useEffect(() => {
    if (Date.now() - lastIotReconnect < 30_000) return;
    lastIotReconnect = Date.now();
    let active = true;
    syncIotWithNhanong().then(
      () => active && retry(),
      () => {},
    );
    return () => {
      active = false;
    };
  }, [retry]);
  return (
    <Card>
      <Text style={[styles.body, { marginBottom: 8 }]}>Đang kết nối mục Cảm biến với tài khoản của bạn…</Text>
      <Button label="Thử lại" onPress={() => syncIotWithNhanong().then(retry, retry)} variant="outline" />
    </Card>
  );
}

/** Đang tải / lỗi; trả null khi đã có dữ liệu */
export function Status({ state, retry }: { state: AsyncState<unknown>; retry: () => void }) {
  if (state.status === 'loading') return <ActivityIndicator style={{ margin: 24 }} color={colors.primary} />;
  // Máy chủ cảm biến từ chối token / chưa vào Cảm biến: vào lại bằng tài khoản Nhà Nông rồi tự tải lại
  if (state.status === 'error' && state.error instanceof ApiError && state.error.status === 401 && state.error.service === 'iot') return <IotReconnect retry={retry} />;
  // Phiên đăng nhập hết hạn: mời đăng nhập lại, không hiện chữ lỗi khó hiểu ("Unauthenticated.")
  if (state.status === 'error' && state.error instanceof ApiError && state.error.status === 401)
    return (
      <Card>
        <Text style={[styles.body, { marginBottom: 8 }]}>Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để tiếp tục.</Text>
        <Button
          label="Đăng nhập lại"
          onPress={() => {
            setAuth(null);
            router.push('/account');
          }}
        />
      </Card>
    );
  if (state.status === 'error')
    return (
      <Card style={{ borderColor: colors.error }}>
        <Text style={[styles.body, { color: colors.error, marginBottom: 8 }]}>{state.error.message}</Text>
        <Button label="Thử lại" onPress={retry} variant="outline" />
      </Card>
    );
  return null;
}

/** Tính lại khi đổi sáng / tối (xem themed trong lib/theme) */
export const styles = themed(() =>
  StyleSheet.create({
    body: { fontSize: font.body, color: colors.text },
    muted: { fontSize: font.small, color: colors.muted },
    change: { fontSize: font.small, fontWeight: '700' },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      padding: 16,
      marginBottom: 12,
      ...shadow,
    },
    chip: {
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      justifyContent: 'center',
      overflow: 'hidden',
    },
    chipActive: { backgroundColor: colors.primary, borderColor: 'transparent', ...primaryShadow },
    chipText: { fontSize: font.body, color: colors.muted, fontWeight: '600' },
    chipTextActive: { color: '#fff', fontWeight: '700' },
    button: {
      minHeight: 50,
      borderRadius: radius.control,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    buttonOutline: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary, elevation: 0, shadowOpacity: 0 },
    buttonText: { color: '#fff', fontSize: font.body, fontWeight: '700' },
    buttonDisabled: { backgroundColor: colors.surface2, borderWidth: 1.5, borderColor: colors.border, elevation: 0, shadowOpacity: 0 },
  }),
);
