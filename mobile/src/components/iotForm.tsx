import { ApiError } from '@nhanong/shared';
import type { ReactNode } from 'react';
import { View, type TextInputProps } from 'react-native';
import { Text, TextInput } from './AppText';
import { colors, font } from '../lib/theme';
import { inputStyle } from './fields';
import { styles } from './ui';

/** Lỗi từ máy chủ cảm biến: theo từng ô (422) + câu chung */
export type FormErrors = { fields: Record<string, string[]>; message: string | null };

export const NO_ERRORS: FormErrors = { fields: {}, message: null };

export function toFormErrors(error: unknown): FormErrors {
  if (error instanceof ApiError) return { fields: error.errors, message: Object.keys(error.errors).length ? null : error.message };
  return { fields: {}, message: (error as Error).message };
}

/** Nhãn + ô nhập + lỗi của ô (theo tên trường máy chủ trả về) */
export function FormInput({ label, value, onChange, error, hint, ...props }: { label: string; value: string; onChange: (v: string) => void; error?: string[]; hint?: string } & Omit<TextInputProps, 'value' | 'onChangeText' | 'onChange'>) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={[styles.body, { marginBottom: 6 }]}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} placeholderTextColor={colors.muted} style={[inputStyle, error && { borderColor: colors.error }]} {...props} />
      {error ? <Text style={{ color: colors.error, fontSize: font.small, marginTop: 4 }}>{error[0]}</Text> : hint ? <Text style={[styles.muted, { marginTop: 4 }]}>{hint}</Text> : null}
    </View>
  );
}

export function FormSection({ label, children, error }: { label: string; children: ReactNode; error?: string[] }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={[styles.body, { marginBottom: 6 }]}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
      {error && <Text style={{ color: colors.error, fontSize: font.small, marginTop: 4 }}>{error[0]}</Text>}
    </View>
  );
}

export function FormMessage({ errors }: { errors: FormErrors }) {
  return errors.message ? <Text style={[styles.body, { color: colors.error, marginVertical: 8 }]}>{errors.message}</Text> : null;
}
