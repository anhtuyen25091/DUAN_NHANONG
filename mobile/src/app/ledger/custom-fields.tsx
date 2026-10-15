import { CUSTOM_FIELD_TARGET_LABELS, CUSTOM_FIELD_TYPE_LABELS, type CustomFieldTarget, type CustomFieldType, type Ledger, type LedgerSnapshot } from '@nhanong/shared';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { ErrorNote, Field, TextField } from '../../components/fields';
import { Button, Card, Chip, styles } from '../../components/ui';
import { confirmAsync } from '../../lib/confirm';
import { useLedger } from '../../lib/ledger';
import { colors, font } from '../../lib/theme';
import { showToast } from '../../lib/toast';

const TARGETS = Object.keys(CUSTOM_FIELD_TARGET_LABELS) as CustomFieldTarget[];
const TYPES = Object.keys(CUSTOM_FIELD_TYPE_LABELS) as CustomFieldType[];

/** Thêm ô thông tin riêng cho vườn / khoản thu chi / vật tư */
export default function CustomFieldsScreen() {
  const state = useLedger();
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  return <CustomFields ledger={state.ledger} data={state.data} />;
}

function CustomFields({ ledger, data }: { ledger: Ledger; data: LedgerSnapshot }) {
  const [target, setTarget] = useState<CustomFieldTarget>('garden');
  const [label, setLabel] = useState('');
  const [type, setType] = useState<CustomFieldType>('text');
  const [options, setOptions] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setError(null);
    try {
      await ledger.addCustomField({ target, label, type, options: options.split(/[,\n]/) });
      showToast({ message: `Đã thêm ô “${label.trim()}” cho ${CUSTOM_FIELD_TARGET_LABELS[target].toLowerCase()}` });
      setLabel('');
      setOptions('');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const rename = async () => {
    if (!renaming) return;
    await ledger.updateCustomField(renaming.id, { label: renaming.label }).catch((e: Error) => showToast({ message: e.message }));
    setRenaming(null);
  };
  const remove = async (id: string, name: string) => {
    if (!(await confirmAsync(`Xóa ô “${name}”?`, 'Giá trị đã nhập vẫn giữ trong sổ; thêm lại hoặc hoàn tác là hiện lại.'))) return;
    const undo = await ledger.removeCustomField(id);
    showToast({ message: `Đã xóa ô “${name}”`, undo });
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: '🏷️ Thông tin tự thêm' }} />
      <Text style={[styles.muted, { marginBottom: 12 }]}>Thêm ô riêng để ghi những gì sổ chưa có, ví dụ vườn: “Số gốc cây”, “Giống”; khoản thu chi: “Người mua”.</Text>

      {TARGETS.map((t) => {
        const list = data.custom_fields.filter((f) => f.target === t);
        return (
          <Card key={t}>
            <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text, marginBottom: 6 }}>{CUSTOM_FIELD_TARGET_LABELS[t]}</Text>
            {list.length === 0 && <Text style={styles.muted}>Chưa có ô nào.</Text>}
            {list.map((f) =>
              renaming?.id === f.id ? (
                <View key={f.id} style={{ marginTop: 8 }}>
                  <TextField label="Tên mới" value={renaming.label} onChange={(v) => setRenaming({ id: f.id, label: v })} maxLength={40} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Button label="Lưu" onPress={rename} disabled={!renaming.label.trim()} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button label="Thôi" variant="outline" onPress={() => setRenaming(null)} />
                    </View>
                  </View>
                </View>
              ) : (
                <View key={f.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 8, gap: 6 }}>
                  <Text style={styles.body}>
                    <Text style={{ fontWeight: '700' }}>{f.label}</Text>
                    <Text style={styles.muted}>
                      {' '}
                      · {CUSTOM_FIELD_TYPE_LABELS[f.type]}
                      {f.options ? `: ${f.options.join(', ')}` : ''}
                    </Text>
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Chip label="Đổi tên" active={false} onPress={() => setRenaming({ id: f.id, label: f.label })} />
                    <Chip label="Xóa" active={false} onPress={() => remove(f.id, f.label)} />
                  </View>
                </View>
              ),
            )}
          </Card>
        );
      })}

      <Card>
        <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text, marginBottom: 8 }}>＋ Thêm ô mới</Text>
        <Field label="Cho">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {TARGETS.map((t) => (
              <Chip key={t} label={CUSTOM_FIELD_TARGET_LABELS[t]} active={t === target} onPress={() => setTarget(t)} />
            ))}
          </View>
        </Field>
        <TextField label="Tên ô *" value={label} onChange={setLabel} maxLength={40} placeholder="Ví dụ: Số gốc cây" />
        <Field label="Loại">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {TYPES.map((t) => (
              <Chip key={t} label={CUSTOM_FIELD_TYPE_LABELS[t]} active={t === type} onPress={() => setType(t)} />
            ))}
          </View>
        </Field>
        {type === 'select' && <TextField label="Các lựa chọn (cách nhau bằng dấu phẩy)" value={options} onChange={setOptions} placeholder="Ví dụ: TR4, TR9, Xanh lùn" />}
        <ErrorNote message={error} />
        <Button label="Thêm ô" onPress={add} disabled={!label.trim()} />
      </Card>
    </ScrollView>
  );
}
