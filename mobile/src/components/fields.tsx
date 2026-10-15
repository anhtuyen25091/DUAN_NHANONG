import { parseVnd, readVnd, today, type EntryType, type LedgerSnapshot } from '@nhanong/shared';
import type { ReactNode } from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, font } from '../lib/theme';
import { DatePicker } from './DatePicker';
import { Chip, styles } from './ui';

export const inputStyle = {
  minHeight: 48,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 10,
  paddingHorizontal: 12,
  fontSize: font.body,
  backgroundColor: colors.surface,
  color: colors.text,
};

/** Nhãn + ô (hoặc nhóm nút) bên dưới */
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string | null }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={[styles.body, { marginBottom: 6 }]}>{label}</Text>
      {children}
      {hint ? <Text style={[styles.muted, { marginTop: 4 }]}>{hint}</Text> : null}
    </View>
  );
}

/** Ô chữ thường */
export function TextField({ label, value, onChange, ...props }: { label: string; value: string; onChange: (v: string) => void } & Omit<TextInputProps, 'value' | 'onChangeText' | 'onChange'>) {
  return (
    <Field label={label}>
      <TextInput value={value} onChangeText={onChange} placeholderTextColor={colors.muted} style={inputStyle} {...props} />
    </Field>
  );
}

/** "1500000" -> "1.500.000" để dễ đếm số 0 khi gõ */
export function groupDigits(n: number): string {
  return n ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '';
}

/** Ô nhập tiền: tự thêm dấu chấm, đọc thành chữ bên dưới ("1 triệu 500 nghìn đồng") */
export function MoneyField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={label} hint={value > 0 ? readVnd(value) : null}>
      <TextInput
        value={groupDigits(value)}
        onChangeText={(text) => onChange(Math.min(parseVnd(text), 999_999_999_999))}
        keyboardType="number-pad"
        placeholder="0"
        placeholderTextColor={colors.muted}
        style={inputStyle}
      />
    </Field>
  );
}

/** Ô số lượng: giữ nguyên chữ người dùng gõ (để gõ được "2,"), có thể kèm đơn vị */
export function QtyField({ label, text, onText, suffix }: { label: string; text: string; onText: (t: string) => void; suffix?: string }) {
  return (
    <Field label={label}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput
          value={text}
          onChangeText={(t) => onText(t.replace(/[^\d.,]/g, ''))}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.muted}
          style={[inputStyle, { flex: 1 }]}
        />
        {suffix ? <Text style={styles.body}>{suffix}</Text> : null}
      </View>
    </Field>
  );
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Ngày gõ tay dạng năm-tháng-ngày (chưa có lịch chọn ngày), như màn Ghi tiền */
/** Chọn ngày bằng lịch (hiện "Thứ Năm, 15/10/2026"). notFuture: không cho chọn sau hôm nay */
export function DateField({ label, value, onChange, optional, notFuture, min }: { label: string; value: string; onChange: (v: string) => void; optional?: boolean; notFuture?: boolean; min?: string }) {
  return (
    <Field label={label} hint={optional && !value ? 'Để trống nếu không có' : null}>
      <DatePicker value={value} onChange={onChange} optional={optional} max={notFuture ? today() : undefined} min={min || undefined} placeholder={optional ? 'Chưa chọn ngày' : 'Chọn ngày'} />
    </Field>
  );
}

/** Kiểm tra ngày gõ tay; trả câu báo lỗi hoặc null */
export function checkDate(value: string, label: string, opts: { optional?: boolean; notFuture?: boolean } = {}): string | null {
  if (!value && opts.optional) return null;
  const valid = DATE_RE.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!valid) return `${label} chưa đúng. Hãy chọn lại ngày.`;
  if (opts.notFuture && value > today()) return `${label} không được sau hôm nay.`;
  return null;
}

/** Chọn vườn bằng nút bấm; allowShared: có lựa chọn "Chi chung" (null) */
export function GardenPicker({ data, value, onChange, allowShared, label = 'Vườn' }: { data: LedgerSnapshot; value: string | null; onChange: (id: string | null) => void; allowShared?: boolean; label?: string }) {
  return (
    <Field label={label}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {data.gardens.map((g) => (
          <Chip key={g.id} label={g.name} active={g.id === value} onPress={() => onChange(g.id)} />
        ))}
        {allowShared && <Chip label="Chi chung" active={value === null} onPress={() => onChange(null)} />}
      </View>
    </Field>
  );
}

/** Chọn hạng mục (icon + tên) theo loại tiền vào / tiền ra */
export function CategoryPicker({ data, type, value, onChange, label = 'Hạng mục' }: { data: LedgerSnapshot; type: EntryType; value: string; onChange: (id: string) => void; label?: string }) {
  return (
    <Field label={label}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {data.categories
          .filter((c) => c.type === type)
          .map((c) => (
            <Chip key={c.id} label={`${c.icon} ${c.name}`} active={c.id === value} onPress={() => onChange(c.id)} />
          ))}
      </View>
    </Field>
  );
}

/** Ô đánh dấu (☑) cả dòng bấm được */
export function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, marginBottom: 8 }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: checked ? colors.primary : colors.muted,
          backgroundColor: checked ? colors.primary : colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>✓</Text> : null}
      </View>
      <Text style={[styles.body, { flex: 1 }]}>{label}</Text>
    </Pressable>
  );
}

/** Ô báo lỗi đỏ dưới form */
export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.error, backgroundColor: colors.lossSoft, marginBottom: 12 }}>
      <Text style={[styles.body, { color: colors.error }]}>{message}</Text>
    </View>
  );
}
