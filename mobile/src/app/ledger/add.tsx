import { extraTexts, fieldsFor, formatVnd, pressAmountKey, readVnd, saveExtra, today, type AmountKey, type EntryType, type QuickTemplate } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { DatePicker } from '../../components/DatePicker';
import { CustomFieldInputs } from '../../components/extraFields';
import { CheckRow } from '../../components/fields';
import { Button, Chip, styles } from '../../components/ui';
import { useLedger } from '../../lib/ledger';
import { colors, font } from '../../lib/theme';
import { showToast } from '../../lib/toast';

const KEYS: AmountKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'xóa'];

/** Ghi 1 khoản: chọn hạng mục → số tiền → Lưu. Params: sua (id khoản cần sửa), vuon (chọn sẵn vườn) */
export default function AddEntryScreen() {
  const state = useLedger();
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  return <AddEntry ledger={state.ledger} data={state.data} />;
}

function AddEntry({ ledger, data }: { ledger: NonNullable<ReturnType<typeof useLedger>['ledger']>; data: ReturnType<typeof ledger.getSnapshot> }) {
  const params = useLocalSearchParams<{ sua?: string; vuon?: string }>();
  const editing = data.transactions.find((t) => t.id === params.sua);
  const defaultGarden = params.vuon ?? data.meta.last_garden_id ?? data.gardens[0]?.id ?? null;

  const [type, setType] = useState<EntryType>(editing?.type ?? 'expense');
  const [categoryId, setCategoryId] = useState<string | null>(editing?.category_id ?? null);
  const [amount, setAmount] = useState(editing?.amount ?? 0);
  const [fresh, setFresh] = useState(!!editing);
  const [gardenId, setGardenId] = useState<string | null>(editing ? editing.garden_id : data.gardens.some((g) => g.id === defaultGarden) ? defaultGarden : null);
  const [date, setDate] = useState(editing?.date ?? today());
  const [note, setNote] = useState(editing?.note ?? '');
  const [more, setMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extra, setExtra] = useState(() => extraTexts(data.custom_fields, 'transaction', editing?.extra));
  const [keepAsTemplate, setKeepAsTemplate] = useState(false);
  const hasFields = fieldsFor(data.custom_fields, 'transaction').length > 0;

  /** Bấm 1 khoản hay dùng: điền sẵn mọi thứ, nhảy sang bước số tiền (vẫn sửa được trước khi Lưu) */
  const applyTemplate = (t: QuickTemplate) => {
    setType(t.type);
    setCategoryId(data.categories.some((c) => c.id === t.category_id) ? t.category_id : null);
    setAmount(t.amount);
    setFresh(true);
    if (t.garden_id === null || data.gardens.some((g) => g.id === t.garden_id)) setGardenId(t.garden_id);
    setNote(t.note ?? '');
  };

  const category = data.categories.find((c) => c.id === categoryId);

  const press = (key: AmountKey) => {
    // Khi sửa: phím số đầu tiên thay số cũ, không gõ nối vào
    const replace = fresh && /^[0-9]$/.test(key);
    setFresh(false);
    setAmount((a) => pressAmountKey(replace ? 0 : a, key));
  };

  const save = async () => {
    if (!category || amount <= 0) return;
    setSaving(true);
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today() ? date : today();
    const entry = { type, amount, category_id: category.id, garden_id: gardenId, date: validDate, note };
    let id = editing?.id;
    if (editing) await ledger.updateEntry(editing.id, entry);
    else id = (await ledger.addEntry(entry)).id;
    await saveExtra(ledger, data.custom_fields, 'transaction', id!, extra);
    if (keepAsTemplate && !editing) await ledger.templateFromEntry(id!);
    showToast({ message: `Đã lưu ${type === 'income' ? 'tiền vào' : 'tiền ra'} ${formatVnd(amount)}${keepAsTemplate && !editing ? ' · đã thêm vào khoản hay dùng' : ''}` });
    router.back();
  };

  const title = editing ? 'Sửa khoản' : 'Ghi tiền';

  if (!category) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Stack.Screen options={{ title }} />
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          {(['expense', 'income'] as const).map((t) => {
            const active = t === type;
            const color = t === 'expense' ? colors.loss : colors.gain;
            return (
              <Pressable
                key={t}
                onPress={() => setType(t)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={{ flex: 1, minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: active ? color : colors.border, backgroundColor: active ? color : colors.surface, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: active ? '#fff' : colors.text }}>{t === 'expense' ? 'Tiền ra' : 'Tiền vào'}</Text>
              </Pressable>
            );
          })}
        </View>
        {!editing && data.templates.length > 0 && (
          <View style={{ marginBottom: 14 }}>
            <Text style={[styles.muted, { marginBottom: 6 }]}>⭐ Khoản hay dùng</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {data.templates.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => applyTemplate(t)}
                  accessibilityRole="button"
                  accessibilityLabel={`Khoản hay dùng ${t.label}, ${formatVnd(t.amount)}`}
                  style={({ pressed }) => ({ minHeight: 64, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.primarySoft : colors.surface, justifyContent: 'center' })}
                >
                  <Text style={styles.body}>
                    {data.categories.find((c) => c.id === t.category_id)?.icon ?? '📦'} {t.label}
                  </Text>
                  <Text style={{ fontSize: font.body, fontWeight: '700', color: t.type === 'income' ? colors.gain : colors.loss }}>{formatVnd(t.amount)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
        <Text style={{ fontSize: font.title, fontWeight: '700', color: colors.text, marginBottom: 12 }}>{type === 'expense' ? 'Chi cho việc gì?' : 'Tiền vào từ đâu?'}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {data.categories
            .filter((c) => c.type === type)
            .map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setCategoryId(c.id)}
                accessibilityRole="button"
                style={({ pressed }) => ({ width: '31%', minHeight: 104, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.primarySoft : colors.surface, alignItems: 'center', justifyContent: 'center', padding: 6 })}
              >
                <Text style={{ fontSize: 36 }}>{c.icon}</Text>
                <Text style={{ fontSize: font.body, fontWeight: '600', color: colors.text, textAlign: 'center' }}>{c.name}</Text>
              </Pressable>
            ))}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title }} />
      <Pressable onPress={() => setCategoryId(null)} style={{ minHeight: 40, justifyContent: 'center' }}>
        <Text style={{ color: colors.primary, fontSize: font.body }}>‹ Đổi hạng mục</Text>
      </Pressable>
      <Text style={{ fontSize: font.title, fontWeight: '700', color: colors.text }}>
        {category.icon} {category.name}
      </Text>

      <View style={{ alignItems: 'center', marginVertical: 10 }}>
        <Text style={{ fontSize: 40, fontWeight: '800', color: type === 'income' ? colors.gain : colors.loss }} adjustsFontSizeToFit numberOfLines={1}>
          {formatVnd(amount)}
        </Text>
        <Text style={styles.muted}>{amount > 0 ? readVnd(amount) : 'Bấm số bên dưới'}</Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {[...KEYS, 'nghìn', 'triệu', 'C'].map((k) => (
          <Pressable
            key={k}
            onPress={() => press(k as AmountKey)}
            accessibilityRole="button"
            accessibilityLabel={k === 'xóa' ? 'Xóa 1 số' : k === 'C' ? 'Xóa hết' : k}
            style={({ pressed }) => ({
              width: '31.5%',
              minHeight: 60,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: pressed ? colors.border : ['nghìn', 'triệu', 'C'].includes(k) ? colors.primarySoft : colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <Text style={{ fontSize: k.length > 3 || k === 'C' ? font.body : 24, fontWeight: '600', color: colors.text }}>{k === 'xóa' ? '⌫' : k === 'C' ? 'Xóa hết' : k}</Text>
          </Pressable>
        ))}
      </View>

      {data.gardens.length > 0 && (
        <View style={{ marginBottom: 8 }}>
          <Text style={[styles.muted, { marginBottom: 6 }]}>Vườn</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {data.gardens.map((g) => (
              <Chip key={g.id} label={g.name} active={g.id === gardenId} onPress={() => setGardenId(g.id)} />
            ))}
            <Chip label="Chi chung" active={gardenId === null} onPress={() => setGardenId(null)} />
          </View>
        </View>
      )}

      <View style={{ marginBottom: 8 }}>
        <Text style={[styles.muted, { marginBottom: 6 }]}>Ngày</Text>
        <DatePicker value={date} onChange={setDate} max={today()} />
      </View>

      <Pressable onPress={() => setMore(!more)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: colors.primary, fontSize: font.body }}>
          {more ? '▾' : '▸'} Ghi chú{hasFields ? ' · thông tin thêm' : ''}{note.trim() ? `: ${note.trim()}` : ''}
        </Text>
      </Pressable>
      {more && (
        <View style={{ gap: 10, marginBottom: 12 }}>
          <TextInput value={note} onChangeText={setNote} placeholder="Ví dụ: 4 bao NPK" maxLength={200} style={inputStyle} />
          <CustomFieldInputs fields={data.custom_fields} target="transaction" texts={extra} onChange={setExtra} />
        </View>
      )}

      {!editing && <CheckRow label="⭐ Lưu làm khoản hay dùng (lần sau bấm 1 lần là ghi)" checked={keepAsTemplate} onChange={setKeepAsTemplate} />}

      <Button label={saving ? 'Đang lưu…' : 'Lưu'} onPress={save} disabled={amount <= 0 || saving} />
    </ScrollView>
  );
}

const inputStyle = { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, fontSize: font.body, backgroundColor: colors.surface, color: colors.text };
