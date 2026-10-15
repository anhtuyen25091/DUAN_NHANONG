import { today, type DealRole } from '@nhanong/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { DealsSignIn } from '../../components/deals';
import { checkDate, DateField, ErrorNote, MoneyField, TextField } from '../../components/fields';
import { Button, styles } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { colors, font } from '../../lib/theme';

/** Tạo đơn mua bán chung: chọn mình là bên mua / bên bán, tạo xong có mã gửi bên kia */
export default function DealCreateScreen() {
  const auth = useAuth();
  const [role, setRole] = useState<DealRole>('buyer');
  const [title, setTitle] = useState('');
  const [counterpart, setCounterpart] = useState('');
  const [deposit, setDeposit] = useState(0);
  const [depositDate, setDepositDate] = useState(today());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  if (!auth) return <DealsSignIn />;

  const submit = async () => {
    if (deposit > 0) {
      const dateError = checkDate(depositDate, 'Ngày cọc', { notFuture: true });
      if (dateError) return setError(dateError);
    }
    setSending(true);
    setError(null);
    try {
      const deal = await api.createDeal(auth.token, {
        role,
        title: title.trim(),
        counterpart_name: counterpart.trim() || null,
        note: note.trim() || null,
        deposit: deposit || undefined,
        deposit_date: depositDate,
      });
      router.replace({ pathname: '/deals/[id]', params: { id: deal.uuid } });
    } catch (err) {
      setError((err as Error).message);
      setSending(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <RoleButton label="🛒 Tôi là bên mua" active={role === 'buyer'} color={colors.loss} onPress={() => setRole('buyer')} />
        <RoleButton label="🌳 Tôi là bên bán" active={role === 'seller'} color={colors.gain} onPress={() => setRole('seller')} />
      </View>
      <Text style={[styles.muted, { marginBottom: 12 }]}>
        {role === 'buyer' ? 'Thương lái / chi nhánh đi mua, đặt cọc cho nông dân hoặc lái nhỏ.' : 'Nông dân bán vườn, hoặc thương lái bán lại hàng cho chi nhánh.'} Tạo xong sẽ có mã để gửi cho bên kia tham gia.
      </Text>
      <TextField label="Tên đơn *" value={title} onChange={setTitle} maxLength={120} placeholder="Ví dụ: Sầu riêng Ri6 vườn chú Ba" accessibilityLabel="Tên đơn" />
      <TextField
        label={role === 'buyer' ? 'Mua của ai' : 'Bán cho ai'}
        value={counterpart}
        onChange={setCounterpart}
        maxLength={120}
        placeholder={role === 'buyer' ? 'Ví dụ: Vườn chú Ba' : 'Ví dụ: Chi nhánh Tân Phú'}
        accessibilityLabel={role === 'buyer' ? 'Mua của ai' : 'Bán cho ai'}
      />
      <MoneyField label="Tiền cọc (nếu có)" value={deposit} onChange={setDeposit} />
      {deposit > 0 && <DateField label="Ngày cọc" value={depositDate} onChange={setDepositDate} notFuture />}
      <TextField label="Ghi chú" value={note} onChange={setNote} maxLength={1000} placeholder="Ví dụ: bao cả vườn, giá theo chợ từng đợt" accessibilityLabel="Ghi chú" />
      <ErrorNote message={error} />
      <Button label={sending ? 'Đang tạo…' : 'Tạo đơn và lấy mã'} onPress={submit} disabled={!title.trim() || sending} />
    </ScrollView>
  );
}

function RoleButton({ label, active, color, onPress }: { label: string; active: boolean; color: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={{ flex: 1, minHeight: 52, borderRadius: 12, borderWidth: active ? 2 : 1, borderColor: active ? color : colors.border, backgroundColor: active ? colors.surface : colors.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }}
    >
      <Text style={{ fontSize: font.body, fontWeight: active ? '700' : '400', color: active ? color : colors.text, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}
