import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, type TextInputProps } from 'react-native';
import { Button, styles } from '../../components/ui';
import { useLedger } from '../../lib/ledger';
import { colors, font } from '../../lib/theme';

/** Thêm vườn mới, hoặc sửa vườn (param id) */
export default function GardenFormScreen() {
  const state = useLedger();
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  return <GardenForm ledger={state.ledger} gardens={state.data.gardens} />;
}

function GardenForm({ ledger, gardens }: { ledger: NonNullable<ReturnType<typeof useLedger>['ledger']>; gardens: ReturnType<typeof ledger.getSnapshot>['gardens'] }) {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const garden = gardens.find((g) => g.id === id);
  const [name, setName] = useState(garden?.name ?? '');
  const [crop, setCrop] = useState(garden?.crop ?? '');
  const [area, setArea] = useState(garden?.area_m2 ? String(garden.area_m2) : '');
  const [note, setNote] = useState(garden?.note ?? '');

  const save = async () => {
    const input = { name, crop, note, area_m2: Number(area.replace(/\D/g, '')) || null };
    if (garden) {
      await ledger.updateGarden(garden.id, input);
      router.back();
    } else {
      const created = await ledger.addGarden(input);
      router.replace({ pathname: '/ledger/garden/[id]', params: { id: created.id } });
    }
  };

  const field = (label: string, value: string, onChange: (v: string) => void, props: TextInputProps = {}) => (
    <>
      <Text style={styles.body}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholderTextColor={colors.muted}
        style={{ minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, fontSize: font.body, backgroundColor: colors.surface, color: colors.text, marginBottom: 6 }}
        {...props}
      />
    </>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 6 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: garden ? 'Sửa vườn' : 'Thêm vườn' }} />
      {field('Tên vườn *', name, setName, { maxLength: 60, placeholder: 'Ví dụ: Vườn sau nhà, Rẫy trên đồi', autoFocus: !garden })}
      {field('Cây trồng', crop, setCrop, { maxLength: 60, placeholder: 'Ví dụ: Cà phê, Sầu riêng' })}
      {field('Diện tích (m²)', area, setArea, { keyboardType: 'number-pad', placeholder: 'Ví dụ: 5000 (= nửa hécta)' })}
      {field('Ghi chú', note, setNote, { maxLength: 200 })}
      <Button label="Lưu" onPress={save} disabled={!name.trim()} />
    </ScrollView>
  );
}
