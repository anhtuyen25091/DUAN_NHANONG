import { fieldLines, fieldsFor, type CustomFieldDef, type CustomFieldTarget } from '@nhanong/shared';
import { Text, View } from 'react-native';
import { DateField, Field, TextField } from './fields';
import { Chip, styles } from './ui';

/** Các ô người dùng tự thêm cho vườn / khoản thu chi / vật tư */
export function CustomFieldInputs({ fields, target, texts, onChange }: { fields: CustomFieldDef[]; target: CustomFieldTarget; texts: Record<string, string>; onChange: (texts: Record<string, string>) => void }) {
  const list = fieldsFor(fields, target);
  if (list.length === 0) return null;
  const set = (key: string, value: string) => onChange({ ...texts, [key]: value });
  return (
    <>
      {list.map((f) =>
        f.type === 'date' ? (
          <DateField key={f.id} label={f.label} value={texts[f.key] ?? ''} onChange={(v) => set(f.key, v)} optional />
        ) : f.type === 'select' ? (
          <Field key={f.id} label={f.label}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(f.options ?? []).map((o) => (
                <Chip key={o} label={o} active={texts[f.key] === o} onPress={() => set(f.key, texts[f.key] === o ? '' : o)} />
              ))}
            </View>
          </Field>
        ) : (
          <TextField
            key={f.id}
            label={f.label}
            value={texts[f.key] ?? ''}
            onChange={(v) => set(f.key, f.type === 'number' ? v.replace(/[^\d.,-]/g, '') : v)}
            keyboardType={f.type === 'number' ? 'decimal-pad' : 'default'}
            maxLength={200}
          />
        ),
      )}
    </>
  );
}

/** "Số gốc cây: 1.200 · Giống: TR9" */
export function FieldLines({ fields, target, extra }: { fields: CustomFieldDef[]; target: CustomFieldTarget; extra: Record<string, string | number | null> | undefined }) {
  const lines = fieldLines(fields, target, extra);
  if (lines.length === 0) return null;
  return <Text style={[styles.muted, { marginBottom: 8 }]}>{lines.map((l) => `${l.label}: ${l.value}`).join(' · ')}</Text>;
}
