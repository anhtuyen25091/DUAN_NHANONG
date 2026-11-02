import { ROLE_LABELS, type IotRole } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { Text } from '../../components/AppText';
import { FormInput, FormMessage, FormSection, NO_ERRORS, toFormErrors } from '../../components/iotForm';
import { Button, Card, Chip, Status, styles } from '../../components/ui';
import { confirmAsync } from '../../lib/confirm';
import { iotApi, useIotAuth } from '../../lib/iot';
import { colors } from '../../lib/theme';
import { useAsync } from '../../lib/useAsync';

type ShareRole = Exclude<IotRole, 'owner'>;
const SHARE_ROLES: ShareRole[] = ['operator', 'viewer'];

/** Chia sẻ trang trại cho người nhà / người làm công: xem số đo, nhận thông báo; operator được bật / tắt máy */
export default function IotMembersScreen() {
  const { farm, name } = useLocalSearchParams<{ farm: string; name?: string }>();
  const auth = useIotAuth();
  const members = useAsync(() => iotApi.members(Number(farm)), [farm]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ShareRole>('operator');
  const [errors, setErrors] = useState(NO_ERRORS);
  const [busy, setBusy] = useState(false);
  const list = members.state.status === 'ok' ? members.state.data : [];
  const isOwner = list[0]?.user_id === auth?.user.id;
  const me = list.find((m) => m.user_id === auth?.user.id);

  const invite = async () => {
    setBusy(true);
    setErrors(NO_ERRORS);
    try {
      await iotApi.addMember(Number(farm), email.trim(), role);
      setEmail('');
      members.refetch();
    } catch (error) {
      setErrors(toFormErrors(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={members.refreshing} onRefresh={members.reload} />}>
      <Stack.Screen options={{ title: `Người dùng chung${name ? ` · ${name}` : ''}` }} />
      <Text style={[styles.muted, { marginBottom: 12 }]}>
        Người được chia sẻ xem được số đo, thời tiết, lượng mưa và cũng nhận thông báo của trang trại. Chỉ chủ trang trại được thêm / sửa / xóa.
      </Text>
      <Status state={members.state} retry={members.reload} />
      {list.map((m) => (
        <Card key={m.user_id}>
          <Text style={[styles.body, { fontWeight: '700' }]}>{m.name}</Text>
          <Text style={[styles.muted, { marginBottom: 6 }]}>{m.email}</Text>
          {isOwner && m.id !== null ? (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                {SHARE_ROLES.map((r) => (
                  <Chip key={r} small label={ROLE_LABELS[r]} active={m.role === r} onPress={() => void iotApi.updateMember(m.id as number, r).then(members.refetch)} />
                ))}
              </View>
              <Text
                onPress={async () => {
                  if (await confirmAsync('Bỏ chia sẻ?', `${m.name} sẽ không xem được trang trại này nữa.`, 'Bỏ chia sẻ')) {
                    await iotApi.removeMember(m.id as number).catch(() => {});
                    members.refetch();
                  }
                }}
                accessibilityRole="button"
                style={{ color: colors.error, fontWeight: '600' }}
              >
                Bỏ chia sẻ
              </Text>
            </>
          ) : (
            <Text style={styles.body}>{ROLE_LABELS[m.role]}</Text>
          )}
        </Card>
      ))}
      {isOwner && (
        <Card>
          <Text style={[styles.body, { fontWeight: '700', marginBottom: 8 }]}>＋ Chia sẻ cho người khác</Text>
          <FormInput
            label="Email tài khoản cảm biến của người đó"
            value={email}
            onChange={setEmail}
            error={errors.fields.email}
            hint="Người đó cần tạo tài khoản cảm biến trước (app Nhà Nông › 📡 Cảm biến)."
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <FormSection label="Quyền">
            {SHARE_ROLES.map((r) => (
              <Chip key={r} label={ROLE_LABELS[r]} active={role === r} onPress={() => setRole(r)} />
            ))}
          </FormSection>
          <FormMessage errors={errors} />
          <Button label={busy ? 'Đang chia sẻ…' : 'Chia sẻ'} onPress={invite} disabled={busy || !email.trim()} />
        </Card>
      )}
      {!isOwner && me?.id && (
        <Text
          onPress={async () => {
            if (!(await confirmAsync('Rời trang trại?', 'Bạn sẽ không xem được và không nhận thông báo nữa.', 'Rời'))) return;
            await iotApi.removeMember(me.id as number).catch(() => {});
            router.back();
          }}
          accessibilityRole="button"
          style={{ color: colors.error, textAlign: 'center', padding: 12 }}
        >
          Rời trang trại này
        </Text>
      )}
    </ScrollView>
  );
}
