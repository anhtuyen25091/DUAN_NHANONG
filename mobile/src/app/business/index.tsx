import {
  ADVANCE_KIND_LABELS,
  ApiError,
  businessInviteText,
  formatDate,
  formatKg,
  formatVnd,
  monthStart,
  today,
  TRADE_KIND_LABELS,
  type AdvanceKind,
  type Business,
  type BusinessMemberInfo,
  type MemberCash,
  type TradeKind,
} from '@nhanong/shared';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { DealsSignIn } from '../../components/deals';
import { DateField, ErrorNote, Field, inputStyle, MoneyField, TextField } from '../../components/fields';
import { RowCard } from '../../components/ledger';
import { PrintButtons } from '../../components/PrintButtons';
import { SmallTitle, TradeRowCard, TradeTotalsCard } from '../../components/trade';
import { Button, Card, Chip, Status, styles } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { confirmAsync } from '../../lib/confirm';
import { colors, font } from '../../lib/theme';
import { showToast } from '../../lib/toast';
import { useAsync } from '../../lib/useAsync';

type Tab = 'overview' | 'members' | 'advances' | 'trades' | 'deals' | 'info';

const OWNER_TABS: [Tab, string][] = [
  ['overview', 'Tổng quan'],
  ['members', 'Lái'],
  ['advances', 'Tiền ứng'],
  ['trades', 'Giao dịch'],
  ['deals', 'Đơn chung'],
  ['info', 'Thông tin'],
];

const errorText = (err: unknown) => (err instanceof ApiError ? (Object.values(err.errors)[0]?.[0] ?? err.message) : (err as Error).message);

/**
 * Doanh nghiệp thu mua. Chưa có: tạo doanh nghiệp / nhập mã mời. Chủ: tổng quan từng lái, quản lý lái, tiền ứng,
 * sổ cả doanh nghiệp, đơn chung. Lái con: tiền mình đang giữ, các lần ứng / nộp lại.
 */
export default function BusinessScreen() {
  const auth = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const loaded = useAsync(() => (auth ? api.business(auth.token) : Promise.resolve(null)), [auth?.token]);
  // ?tab=deals: mở từ thông báo đơn chung của lái
  const [tab, setTab] = useState<Tab>(OWNER_TABS.some(([t]) => t === params.tab) ? (params.tab as Tab) : 'overview');
  const [member, setMember] = useState<number | undefined>(undefined);
  const { refetch } = loaded;
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  if (!auth) return <DealsSignIn />;
  if (loaded.state.status !== 'ok') return <Status state={loaded.state} retry={loaded.reload} />;
  const business = loaded.state.data;
  if (!business) return <NoBusiness token={auth.token} onDone={loaded.reload} />;
  if (business.my_role !== 'owner') return <MemberView token={auth.token} business={business} onLeft={loaded.reload} />;

  const open = (next: Tab, memberId?: number) => {
    setMember(memberId);
    setTab(next);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `🏢 ${business.name}` }} />
      <Text style={[styles.muted, { marginBottom: 8 }]}>Bạn là chủ · {business.members?.length ?? 0} tài khoản (gồm chủ). Phiếu, đơn chung các lái lập đều về đây.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {OWNER_TABS.map(([key, label]) => (
          <Chip key={key} label={label} active={tab === key} onPress={() => open(key)} />
        ))}
      </View>
      {tab === 'overview' && <Overview token={auth.token} onMember={(id) => open('trades', id)} />}
      {tab === 'members' && <Members token={auth.token} business={business} onChange={loaded.refetch} onOpen={open} />}
      {tab === 'advances' && <Advances key={`a${member}`} token={auth.token} business={business} initialMember={member} />}
      {tab === 'trades' && <Trades key={`t${member}`} token={auth.token} business={business} initialMember={member} onDeal={() => open('deals')} />}
      {tab === 'deals' && <Deals token={auth.token} />}
      {tab === 'info' && <BusinessForm token={auth.token} business={business} onSaved={loaded.refetch} />}
    </ScrollView>
  );
}

function NoBusiness({ token, onDone }: { token: string; onDone: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const join = async () => {
    try {
      await api.joinBusiness(token, code);
      showToast({ message: 'Đã vào doanh nghiệp' });
      onDone();
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Text style={[styles.muted, { marginBottom: 12 }]}>Doanh nghiệp thu mua có nhiều lái đi mua giùm: chủ tạo tài khoản cho từng lái, ứng tiền, xem lái nào mua bao nhiêu, đang giữ bao nhiêu tiền.</Text>
      <Card>
        <SmallTitle>Tôi là lái: nhập mã mời</SmallTitle>
        <Field label="Mã mời chủ gửi">
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            maxLength={12}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="NN7K3P"
            placeholderTextColor={colors.muted}
            style={[inputStyle, { fontSize: 24, letterSpacing: 4, fontWeight: '700', textAlign: 'center' }]}
          />
        </Field>
        <ErrorNote message={error} />
        <Button label="Vào doanh nghiệp" onPress={join} disabled={code.replace(/[^A-Za-z0-9]/g, '').length < 6} />
      </Card>
      <SmallTitle>Tôi là chủ: tạo doanh nghiệp</SmallTitle>
      <BusinessForm token={token} onSaved={onDone} />
    </ScrollView>
  );
}

function BusinessForm({ token, business, onSaved }: { token: string; business?: Business; onSaved: () => void }) {
  const [name, setName] = useState(business?.name ?? '');
  const [phone, setPhone] = useState(business?.phone ?? '');
  const [address, setAddress] = useState(business?.address ?? '');
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    try {
      const input = { name: name.trim(), phone: phone.trim() || null, address: address.trim() || null };
      await (business ? api.updateBusiness(token, input) : api.createBusiness(token, input));
      showToast({ message: business ? 'Đã lưu thông tin' : 'Đã tạo doanh nghiệp' });
      onSaved();
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <Card>
      <Text style={[styles.muted, { marginBottom: 8 }]}>Tên, SĐT, địa chỉ in trên đầu mọi phiếu các lái lập.</Text>
      <TextField label="Tên doanh nghiệp *" value={name} onChange={setName} maxLength={150} placeholder="Ví dụ: Công ty Nông sản Hai Lúa" />
      <TextField label="Số điện thoại" value={phone} onChange={setPhone} maxLength={20} keyboardType="phone-pad" />
      <TextField label="Địa chỉ" value={address} onChange={setAddress} maxLength={255} />
      <ErrorNote message={error} />
      <Button label={business ? 'Lưu thông tin' : 'Tạo doanh nghiệp'} onPress={save} disabled={!name.trim()} />
    </Card>
  );
}

function CashCard({ cash, title = 'Tiền đang giữ' }: { cash: MemberCash; title?: string }) {
  const row = (label: string, value: string, color?: string) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 2 }}>
      <Text style={[styles.body, { flex: 1 }]}>{label}</Text>
      <Text style={[styles.body, { fontWeight: '700', color: color ?? colors.text }]}>{value}</Text>
    </View>
  );
  return (
    <Card style={{ borderLeftWidth: 6, borderLeftColor: cash.holding < 0 ? colors.loss : colors.gain }}>
      <Text style={styles.muted}>{title}</Text>
      <Text style={{ fontSize: font.title + 4, fontWeight: '800', color: cash.holding < 0 ? colors.loss : colors.gain, marginBottom: 6 }}>{formatVnd(cash.holding)}</Text>
      {row('Chủ đã ứng', formatVnd(cash.advanced))}
      {row('Đã nộp lại chủ', `−${formatVnd(cash.returned)}`)}
      {row('Đã trả cho người bán', `−${formatVnd(cash.paid_out)}`, colors.loss)}
      {row('Đã thu khi bán', `+${formatVnd(cash.received)}`, colors.gain)}
      {cash.holding < 0 && <Text style={[styles.muted, { color: colors.loss, marginTop: 4 }]}>Âm: lái đã trả nhiều hơn tiền được ứng (đang bù tiền riêng).</Text>}
    </Card>
  );
}

/** Lái con: doanh nghiệp mình mua giùm, tiền đang giữ, các lần ứng / nộp lại */
function MemberView({ token, business, onLeft }: { token: string; business: Business; onLeft: () => void }) {
  const advances = useAsync(() => api.businessAdvances(token), [token]);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Stack.Screen options={{ title: `🏢 ${business.name}` }} />
      <Text style={[styles.body, { marginBottom: 8 }]}>
        Bạn là lái mua giùm cho {business.owner.name}
        {business.my_group ? ` · ${business.my_group}` : ''}. Phiếu và đơn chung bạn lập đều thuộc doanh nghiệp, chủ xem được.
      </Text>
      {business.my_status === 'locked' && (
        <Card style={{ borderColor: colors.error }}>
          <Text style={[styles.body, { color: colors.error }]}>Tài khoản đang bị chủ khóa: chưa lập phiếu / đơn mới được. Hãy liên hệ chủ.</Text>
        </Card>
      )}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <View style={{ flex: 1 }}>
          <Button label="＋ Phiếu mua" onPress={() => router.push({ pathname: '/trade/form', params: { kind: 'buy' } })} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="📒 Phiếu của tôi" variant="outline" onPress={() => router.push('/trade')} />
        </View>
      </View>
      {business.my_cash && <CashCard cash={business.my_cash} />}
      <SmallTitle>Các lần ứng / nộp lại</SmallTitle>
      <Status state={advances.state} retry={advances.reload} />
      {advances.state.status === 'ok' && advances.state.data.data.length === 0 && <Text style={styles.muted}>Chưa có.</Text>}
      {advances.state.status === 'ok' &&
        advances.state.data.data.map((a) => (
          <RowCard key={a.id} title={ADVANCE_KIND_LABELS[a.kind]} sub={`${formatDate(a.date)}${a.note ? ` · ${a.note}` : ''}`} right={`${a.kind === 'advance' ? '+' : '−'}${formatVnd(a.amount)}`} onPress={() => {}} />
        ))}
      <View style={{ marginTop: 12 }}>
        <Button
          label="Rời doanh nghiệp"
          variant="danger"
          onPress={async () => {
            if (!(await confirmAsync(`Rời ${business.name}?`, 'Phiếu cũ vẫn thuộc doanh nghiệp.', 'Rời'))) return;
            await api.leaveBusiness(token);
            onLeft();
          }}
        />
      </View>
    </ScrollView>
  );
}

function useRange() {
  const [from, setFrom] = useState(monthStart(today()));
  const [to, setTo] = useState(today());
  return { from, to, setFrom, setTo };
}

function RangeFields({ range }: { range: ReturnType<typeof useRange> }) {
  return (
    <View>
      <DateField label="Từ ngày" value={range.from} onChange={range.setFrom} notFuture />
      <DateField label="Đến ngày" value={range.to} onChange={range.setTo} notFuture min={range.from} />
    </View>
  );
}

function Overview({ token, onMember }: { token: string; onMember: (id: number) => void }) {
  const range = useRange();
  const summary = useAsync(() => api.businessSummary(token, { from: range.from, to: range.to }), [token, range.from, range.to]);
  return (
    <View>
      <RangeFields range={range} />
      <Status state={summary.state} retry={summary.reload} />
      {summary.state.status === 'ok' && (
        <>
          <TradeTotalsCard totals={summary.state.data.data.totals} />
          <Text style={[styles.body, { marginBottom: 8 }]}>
            Tiền các lái đang giữ: <Text style={{ fontWeight: '700' }}>{formatVnd(summary.state.data.data.totals.holding)}</Text>
          </Text>
          <SmallTitle>Từng lái</SmallTitle>
          {summary.state.data.data.members.map((m) => (
            <RowCard
              key={m.id}
              title={`${m.role === 'owner' ? '👑' : '🧑‍🌾'} ${m.name}`}
              sub={`${m.group_name ? `${m.group_name} · ` : ''}${m.totals.count} giao dịch · mua ${formatKg(m.totals.buy.kg)} kg${m.role !== 'owner' ? `\nĐang giữ ${formatVnd(m.cash.holding)}` : ''}`}
              right={formatVnd(m.totals.buy.amount)}
              tag={m.status === 'locked' ? 'Đã khóa' : m.totals.buy.owing > 0 ? `Còn nợ người bán ${formatVnd(m.totals.buy.owing)}` : null}
              onPress={() => onMember(m.id)}
            />
          ))}
          {(['buy', 'sell'] as TradeKind[]).map((kind) => {
            const products = summary.state.status === 'ok' ? summary.state.data.data.products.filter((p) => p.kind === kind) : [];
            return products.length === 0 ? null : (
              <Card key={kind}>
                <SmallTitle>{`${TRADE_KIND_LABELS[kind]} theo mặt hàng`}</SmallTitle>
                {products.map((p) => (
                  <View key={p.name} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.border }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.body}>{p.name}</Text>
                      <Text style={styles.muted}>
                        {formatKg(p.kg)} kg{p.kg > 0 ? ` · bình quân ${formatVnd(Math.round(p.amount / p.kg))}/kg` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.body, { fontWeight: '700' }]}>{formatVnd(p.amount)}</Text>
                  </View>
                ))}
              </Card>
            );
          })}
          <Card>
            <PrintButtons token={token} target={{ type: 'business-report', from: range.from, to: range.to }} label="Báo cáo doanh nghiệp: từng lái, mặt hàng, chi tiết" />
          </Card>
        </>
      )}
    </View>
  );
}

function Members({ token, business, onChange, onOpen }: { token: string; business: Business; onChange: () => void; onOpen: (tab: Tab, member?: number) => void }) {
  const [adding, setAdding] = useState(false);
  const act = async (action: () => Promise<unknown>, message: string) => {
    try {
      await action();
      showToast({ message });
      onChange();
    } catch (err) {
      Alert.alert('Chưa làm được', errorText(err));
    }
  };
  return (
    <View>
      <Card style={{ gap: 8 }}>
        <SmallTitle>Thêm lái</SmallTitle>
        <Text style={styles.muted}>Cách 1: tạo tài khoản cho lái (SĐT + mật khẩu), đưa lái đăng nhập. Cách 2: lái đã có tài khoản thì gửi mã mời.</Text>
        <Button label={adding ? 'Thôi' : '＋ Tạo tài khoản lái'} onPress={() => setAdding(!adding)} />
        {business.invite_code ? (
          <>
            <Text selectable style={{ fontSize: 28, fontWeight: '800', letterSpacing: 4, textAlign: 'center', color: colors.text }}>
              {business.invite_code}
            </Text>
            <Button label="📤 Gửi mã mời (Zalo…)" variant="outline" onPress={() => Share.share({ message: businessInviteText(business, business.invite_code!) }).catch(() => {})} />
            <Button label="Thu hồi mã" variant="danger" onPress={() => act(() => api.revokeBusinessInvite(token), 'Đã thu hồi mã mời')} />
          </>
        ) : (
          <Button label="🔑 Tạo mã mời" variant="outline" onPress={() => act(() => api.businessInvite(token), 'Đã tạo mã mời')} />
        )}
      </Card>
      {adding && (
        <MemberForm
          token={token}
          onSaved={() => {
            setAdding(false);
            onChange();
          }}
        />
      )}
      {(business.members ?? []).map((m) => (
        <MemberCard key={m.id} member={m} token={token} act={act} onOpen={onOpen} />
      ))}
    </View>
  );
}

function MemberForm({ token, onSaved }: { token: string; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [group, setGroup] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    try {
      await api.createMember(token, { name: name.trim(), phone: phone.trim(), password, group_name: group.trim() || null });
      showToast({ message: `Đã tạo tài khoản cho ${name.trim()}. Đưa lái SĐT + mật khẩu để đăng nhập.` });
      onSaved();
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <Card>
      <TextField label="Tên lái *" value={name} onChange={setName} maxLength={100} placeholder="Ví dụ: Lái Tèo" />
      <TextField label="Số điện thoại (để đăng nhập) *" value={phone} onChange={setPhone} maxLength={20} keyboardType="phone-pad" />
      <TextField label="Mật khẩu ban đầu *" value={password} onChange={setPassword} maxLength={100} placeholder="Ít nhất 6 ký tự" autoCapitalize="none" />
      <TextField label="Nhóm (không bắt buộc)" value={group} onChange={setGroup} maxLength={80} placeholder="Ví dụ: Nhóm Krông Pắc" />
      <ErrorNote message={error} />
      <Button label="Tạo tài khoản" onPress={save} disabled={!name.trim() || !phone.trim() || password.length < 6} />
    </Card>
  );
}

function MemberCard({
  member: m,
  token,
  act,
  onOpen,
}: {
  member: BusinessMemberInfo;
  token: string;
  act: (action: () => Promise<unknown>, message: string) => Promise<void>;
  onOpen: (tab: Tab, member?: number) => void;
}) {
  const owner = m.role === 'owner';
  const [editing, setEditing] = useState<'group' | 'password' | null>(null);
  const [value, setValue] = useState('');
  return (
    <Card style={{ gap: 6 }}>
      <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text }}>
        {owner ? '👑' : '🧑‍🌾'} {m.name}
        {m.status === 'locked' ? <Text style={{ color: colors.error }}> · Đã khóa</Text> : null}
      </Text>
      <Text style={styles.muted}>
        {m.phone}
        {m.group_name ? ` · ${m.group_name}` : ''}
        {owner ? ' · chủ' : m.created_by_owner ? ' · chủ tạo tài khoản' : ' · vào bằng mã mời'}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Chip label="Giao dịch" active={false} onPress={() => onOpen('trades', m.id)} />
        {!owner && (
          <>
            <Chip label="Tiền ứng" active={false} onPress={() => onOpen('advances', m.id)} />
            <Chip label="Đổi nhóm" active={editing === 'group'} onPress={() => (setValue(m.group_name ?? ''), setEditing(editing === 'group' ? null : 'group'))} />
            {m.created_by_owner && <Chip label="Đặt lại mật khẩu" active={editing === 'password'} onPress={() => (setValue(''), setEditing(editing === 'password' ? null : 'password'))} />}
            <Chip
              label={m.status === 'active' ? 'Khóa' : 'Mở khóa'}
              active={false}
              onPress={async () => {
                if (m.status === 'active' && !(await confirmAsync(`Khóa ${m.name}?`, 'Lái bị đăng xuất, không lập phiếu / đơn mới được.', 'Khóa'))) return;
                void act(() => api.updateMember(token, m.id, { status: m.status === 'active' ? 'locked' : 'active' }), m.status === 'active' ? `Đã khóa ${m.name}` : `Đã mở khóa ${m.name}`);
              }}
            />
            <Chip
              label="Gỡ"
              active={false}
              onPress={async () => {
                if (!(await confirmAsync(`Gỡ ${m.name}?`, 'Phiếu, đơn, tiền ứng cũ vẫn giữ trong doanh nghiệp.', 'Gỡ'))) return;
                void act(() => api.removeMember(token, m.id), `Đã gỡ ${m.name}`);
              }}
            />
          </>
        )}
      </View>
      {editing && (
        <View style={{ gap: 6 }}>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={editing === 'group' ? 'Tên nhóm (để trống: không nhóm)' : 'Mật khẩu mới (ít nhất 6 ký tự)'}
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            style={inputStyle}
          />
          <Button
            label="Lưu"
            disabled={editing === 'password' && value.length < 6}
            onPress={() => {
              const input = editing === 'group' ? { group_name: value.trim() || null } : { password: value };
              setEditing(null);
              void act(() => api.updateMember(token, m.id, input), editing === 'group' ? 'Đã đổi nhóm' : `Đã đặt lại mật khẩu cho ${m.name}`);
            }}
          />
        </View>
      )}
    </Card>
  );
}

function Advances({ token, business, initialMember }: { token: string; business: Business; initialMember?: number }) {
  const buyers = (business.members ?? []).filter((m) => m.role !== 'owner');
  const [member, setMember] = useState<number | undefined>(initialMember);
  const [kind, setKind] = useState<AdvanceKind>('advance');
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [cash, setCash] = useState<MemberCash | null>(null);
  const list = useAsync(() => api.businessAdvances(token, member), [token, member]);
  const name = buyers.find((m) => m.id === member)?.name;

  const save = async () => {
    if (!member) return;
    try {
      const result = await api.createAdvance(token, { member, kind, amount, date, note: note.trim() || null });
      setCash(result.cash);
      setAmount(0);
      setNote('');
      showToast({ message: `Đã ghi: ${ADVANCE_KIND_LABELS[kind].toLowerCase()} ${formatVnd(result.data.amount)}` });
      list.refetch();
    } catch (err) {
      Alert.alert('Chưa ghi được', errorText(err));
    }
  };

  return (
    <View>
      <Card>
        <Field label="Lái">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Chip label="Tất cả (xem)" active={!member} onPress={() => (setMember(undefined), setCash(null))} />
            {buyers.map((m) => (
              <Chip key={m.id} label={m.name} active={m.id === member} onPress={() => (setMember(m.id), setCash(null))} />
            ))}
          </View>
        </Field>
        {member && (
          <>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
              {(['advance', 'return'] as const).map((k) => (
                <Chip key={k} label={ADVANCE_KIND_LABELS[k]} active={k === kind} onPress={() => setKind(k)} />
              ))}
            </View>
            <MoneyField label="Số tiền *" value={amount} onChange={setAmount} />
            <DateField label="Ngày" value={date} onChange={setDate} notFuture />
            <TextField label="Ghi chú" value={note} onChange={setNote} maxLength={255} placeholder="Ví dụ: ứng mua cà phê Krông Pắc" />
            <Button label={`Ghi ${ADVANCE_KIND_LABELS[kind].toLowerCase()}`} onPress={save} disabled={amount <= 0} />
          </>
        )}
      </Card>
      {cash && name && <CashCard cash={cash} title={`${name} đang giữ`} />}
      <Status state={list.state} retry={list.reload} />
      {list.state.status === 'ok' && list.state.data.data.length === 0 && <Text style={styles.muted}>Chưa có lần ứng nào.</Text>}
      {list.state.status === 'ok' &&
        list.state.data.data.map((a) => (
          <Pressable
            key={a.id}
            onLongPress={async () => {
              if (!(await confirmAsync('Xóa lần ghi này?', `${ADVANCE_KIND_LABELS[a.kind]} ${formatVnd(a.amount)} · ${a.member.name}`))) return;
              await api.deleteAdvance(token, a.id);
              list.refetch();
            }}
          >
            <Card style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.body}>
                  {ADVANCE_KIND_LABELS[a.kind]} · {a.member.name}
                </Text>
                <Text style={styles.muted}>
                  {formatDate(a.date)}
                  {a.note ? ` · ${a.note}` : ''}
                </Text>
              </View>
              <Text style={[styles.body, { fontWeight: '700', color: a.kind === 'advance' ? colors.loss : colors.gain }]}>{formatVnd(a.amount)}</Text>
            </Card>
          </Pressable>
        ))}
      {list.state.status === 'ok' && list.state.data.data.length > 0 && <Text style={styles.muted}>Bấm giữ 1 dòng để xóa.</Text>}
    </View>
  );
}

function Trades({ token, business, initialMember, onDeal }: { token: string; business: Business; initialMember?: number; onDeal: () => void }) {
  const range = useRange();
  const [member, setMember] = useState<number | undefined>(initialMember);
  const [kind, setKind] = useState<TradeKind | ''>('');
  const rows = useAsync(() => api.businessTransactions(token, { from: range.from, to: range.to, member, kind: kind || undefined }), [token, range.from, range.to, member, kind]);
  return (
    <View>
      <RangeFields range={range} />
      <Field label="Lái">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Chip label="Tất cả" active={!member} onPress={() => setMember(undefined)} />
          {(business.members ?? []).map((m) => (
            <Chip key={m.id} label={m.name} active={m.id === member} onPress={() => setMember(m.id)} />
          ))}
        </View>
      </Field>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
        {(['', 'buy', 'sell'] as const).map((k) => (
          <Chip key={k} label={k ? TRADE_KIND_LABELS[k] : 'Tất cả'} active={k === kind} onPress={() => setKind(k)} />
        ))}
      </View>
      <Status state={rows.state} retry={rows.reload} />
      {rows.state.status === 'ok' && (
        <>
          <TradeTotalsCard totals={rows.state.data.meta.totals} />
          {rows.state.data.data.length === 0 && <Text style={styles.muted}>Chưa có giao dịch.</Text>}
          {rows.state.data.data.map((r) => (
            <TradeRowCard key={r.id} row={r} onDeal={onDeal} />
          ))}
        </>
      )}
    </View>
  );
}

function Deals({ token }: { token: string }) {
  const deals = useAsync(() => api.businessDeals(token), [token]);
  return (
    <View>
      <Text style={[styles.muted, { marginBottom: 8 }]}>Đơn chung các lái làm với nông dân (cọc, nhiều đợt cân). Chủ xem số liệu và gửi bảng quyết toán; lái là người ghi / xác nhận trong đơn.</Text>
      <Status state={deals.state} retry={deals.reload} />
      {deals.state.status === 'ok' && deals.state.data.length === 0 && <Text style={styles.muted}>Chưa có đơn chung.</Text>}
      {deals.state.status === 'ok' &&
        deals.state.data.map((d) => (
          <Card key={d.uuid} style={{ gap: 4 }}>
            <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text }}>
              {d.kind === 'buy' ? '🛒' : '🌳'} {d.title}
            </Text>
            <Text style={styles.muted}>
              lái {d.member.name} · {d.kind === 'buy' ? 'mua của' : 'bán cho'} {d.counterpart} · mã {d.code}
              {d.status !== 'open' ? ` · ${d.status === 'done' ? 'đã xong' : 'đã hủy'}` : ''}
            </Text>
            <Text style={styles.body}>
              Tiền hàng {formatVnd(d.totals.delivered)} ({formatKg(d.totals.kg)} kg) · cọc {formatVnd(d.totals.deposit)} · đã trả {formatVnd(d.totals.paid)}
            </Text>
            <Text style={[styles.body, { fontWeight: '700' }]}>
              {d.totals.balance >= 0 ? 'Bên mua còn phải trả' : 'Bên bán nhận dư'} {formatVnd(Math.abs(d.totals.balance))}
            </Text>
            <PrintButtons token={token} target={{ type: 'deal', id: d.uuid }} />
          </Card>
        ))}
    </View>
  );
}
