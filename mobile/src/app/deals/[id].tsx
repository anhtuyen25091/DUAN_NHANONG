import { formatDate, formatQty, formatVnd, telHref, type Deal, type DealEntry } from '@nhanong/shared';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, RefreshControl, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { DealsSignIn, Notice, Tag } from '../../components/deals';
import { CheckRow, inputStyle } from '../../components/fields';
import { SectionTitle } from '../../components/ledger';
import { PrintButtons } from '../../components/PrintButtons';
import { Button, Card, Chip, styles } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { confirmAsync } from '../../lib/confirm';
import { balanceText, counterpartName, KIND_LABEL, STATUS_LABEL } from '../../lib/deals';
import { dealWatcher } from '../../lib/dealWatch';
import { useLedger } from '../../lib/ledger';
import { colors, font } from '../../lib/theme';
import { showToast } from '../../lib/toast';

type Run = (action: () => Promise<Deal>, message?: string) => Promise<boolean>;

/** 1 đơn mua bán chung: 2 bên cùng xem; mục bên kia ghi thì Đồng ý / Báo sai */
export default function DealDetailScreen() {
  const auth = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!auth) return <DealsSignIn />;
  return <DealDetail token={auth.token} id={id} />;
}

function DealDetail({ token, id }: { token: string; id: string }) {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    () =>
      api.deal(token, id).then(
        (d) => {
          setDeal(d);
          setError(null);
        },
        (e: Error) => setError(e),
      ),
    [token, id],
  );

  // Mở / quay lại màn này thì tải lại; bên kia vừa ghi / xác nhận thì tải lại ngay (bộ theo dõi báo), dự phòng 15 giây 1 lần
  useFocusEffect(
    useCallback(() => {
      void load();
      const off = dealWatcher.onDealChanged((changed) => changed === id && void load());
      const timer = setInterval(() => void load(), 15_000);
      return () => {
        off();
        clearInterval(timer);
      };
    }, [load, id]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!deal) {
    if (!error) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
    return (
      <Card style={{ margin: 16, borderColor: colors.error }}>
        <Stack.Screen options={{ title: 'Đơn mua bán' }} />
        <Text style={[styles.body, { color: colors.error, marginBottom: 8 }]}>{error.message}</Text>
        <Button label="Thử lại" variant="outline" onPress={() => void load()} />
      </Card>
    );
  }

  const run: Run = async (action, message) => {
    try {
      setDeal(await action());
      if (message) showToast({ message });
      return true;
    } catch (err) {
      showToast({ message: (err as Error).message });
      return false;
    }
  };

  const open = deal.status === 'open';
  const c = deal.summary.confirmed;
  const p = deal.summary.with_pending;
  const entries = [...(deal.entries ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.updated_at.localeCompare(a.updated_at));
  const owing = c.balance > 0 && deal.my_role === 'buyer';

  const remove = async () => {
    if (!(await confirmAsync('Xóa hẳn đơn này?', `Đơn "${deal.title}" và các mục đã ghi sẽ bị xóa.`))) return;
    try {
      await api.deleteDeal(token, deal.uuid);
      showToast({ message: 'Đã xóa đơn' });
      router.back();
    } catch (err) {
      showToast({ message: (err as Error).message });
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.primary]} tintColor={colors.primary} />}
    >
      <Stack.Screen options={{ title: `${deal.my_role === 'buyer' ? '🛒' : '🌳'} ${deal.title}` }} />
      <Text style={{ fontSize: font.title, fontWeight: '700', color: colors.text }}>
        {deal.my_role === 'buyer' ? '🛒' : '🌳'} {deal.title}
      </Text>
      <Text style={[styles.body, { marginBottom: 8 }]}>
        {deal.my_role === 'buyer' ? 'Mình là bên mua · mua của ' : 'Mình là bên bán · bán cho '}
        <Text style={{ fontWeight: '700' }}>{counterpartName(deal)}</Text>
        {deal.status !== 'open' && ` · ${deal.status === 'done' ? 'Đã xong' : 'Đã hủy'}`}
      </Text>
      {deal.counterpart?.phone && (
        <View style={{ marginBottom: 12 }}>
          <Button label={`📞 Gọi ${deal.counterpart.phone}`} variant="outline" onPress={() => void Linking.openURL(telHref(deal.counterpart!.phone!))} />
        </View>
      )}

      {!deal.joined && <ShareCode deal={deal} />}

      <Card style={{ borderLeftWidth: 6, borderLeftColor: owing ? colors.loss : colors.gain }}>
        <Text style={styles.muted}>Đã 2 bên xác nhận</Text>
        <Text style={{ fontSize: 24, fontWeight: '800', color: owing ? colors.loss : colors.gain, marginVertical: 4 }}>{balanceText(deal, c)}</Text>
        <Row label={`Tiền hàng (${formatQty(c.kg)} ${deal.unit})`} value={formatVnd(c.delivered)} />
        <Row label="Tiền cọc" value={formatVnd(c.deposit)} />
        <Row label="Đã trừ cọc · cọc còn" value={`${formatVnd(c.deducted)} · ${formatVnd(c.deposit_left)}`} />
        <Row label="Đã trả tiền" value={formatVnd(c.paid)} />
        {(deal.summary.awaiting_me > 0 || deal.summary.awaiting_other > 0) && p.balance !== c.balance && (
          <Text style={[styles.muted, { marginTop: 8 }]}>Nếu đồng ý các mục đang chờ: {balanceText(deal, p).toLowerCase()}</Text>
        )}
      </Card>

      {deal.summary.awaiting_me > 0 && <Notice text={`🔔 Có ${deal.summary.awaiting_me} mục bên kia vừa ghi, chờ bạn xác nhận (ở dưới).`} />}

      {open && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
          {(['cut', 'deposit', 'payment', 'cost'] as const).map((kind) => (
            <View key={kind} style={{ flexBasis: '47%', flexGrow: 1 }}>
              <Button label={`＋ ${KIND_LABEL[kind]}`} variant={kind === 'cut' ? 'primary' : 'outline'} onPress={() => router.push({ pathname: '/deals/entry', params: { dealId: deal.uuid, kind } })} />
            </View>
          ))}
        </View>
      )}

      <SectionTitle>Các mục</SectionTitle>
      {entries.length === 0 && <Text style={styles.muted}>Chưa có mục nào.</Text>}
      {entries.map((e) => (
        <EntryCard key={e.uuid} deal={deal} entry={e} token={token} run={run} />
      ))}

      {deal.my_role === 'seller' && <LotCard deal={deal} token={token} run={run} />}

      <LedgerLinkCard deal={deal} />

      <Card>
        <PrintButtons token={token} target={{ type: 'deal', id: deal.uuid }} label="Gửi bảng quyết toán đơn (mọi đợt cân, cọc, tiền đã trả, còn lại) cho bên kia" />
      </Card>

      <Card style={{ gap: 8 }}>
        <Text style={heading}>Đơn</Text>
        {open ? (
          <>
            <Button label="✅ Kết thúc đơn" variant="outline" onPress={() => void run(() => api.updateDeal(token, deal.uuid, { status: 'done' }), 'Đã kết thúc đơn')} />
            <Button
              label="Hủy đơn"
              variant="danger"
              onPress={async () => {
                if (await confirmAsync('Hủy đơn này?', `Đơn "${deal.title}" sẽ chuyển sang Đã hủy.`, 'Hủy đơn')) await run(() => api.updateDeal(token, deal.uuid, { status: 'cancelled' }), 'Đã hủy đơn');
              }}
            />
          </>
        ) : (
          <Button label="Mở lại đơn" variant="outline" onPress={() => void run(() => api.updateDeal(token, deal.uuid, { status: 'open' }), 'Đã mở lại đơn')} />
        )}
        {deal.is_creator && !deal.joined && <Button label="Xóa đơn" variant="danger" onPress={remove} />}
        <Text style={styles.muted}>Mã đơn: {deal.code}</Text>
      </Card>
    </ScrollView>
  );
}

const heading = { fontSize: font.body + 1, fontWeight: '700' as const, color: colors.text, marginBottom: 4 };

/** 1 dòng: nhãn bên trái, số tiền bên phải */
/** "🖨 Gửi phiếu cân đợt này": bấm mới hiện 2 nút PDF / Word để thẻ đợt cân gọn */
function CutPrint({ token, entryId }: { token: string; entryId: string }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <View style={{ marginTop: 8 }}>
      <PrintButtons token={token} target={{ type: 'deal-entry', id: entryId }} />
    </View>
  ) : (
    <Text style={{ color: colors.primary, marginTop: 8, minHeight: 32 }} onPress={() => setOpen(true)}>
      🖨 Gửi phiếu cân đợt này
    </Text>
  );
}

function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border, borderStyle: 'dashed' }}>
      <Text style={[styles.body, { flex: 1 }, bold && { fontWeight: '700' }]}>{label}</Text>
      <Text style={[styles.body, { fontWeight: '700', flexShrink: 1, textAlign: 'right' }, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

/** Mã để bên kia tham gia + nút gửi (Zalo, tin nhắn…) */
function ShareCode({ deal }: { deal: Deal }) {
  const message = `Mời tham gia đơn "${deal.title}" trên app Nhà Nông. Mã: ${deal.code}`;
  const share = async () => {
    try {
      if (Platform.OS !== 'web') {
        await Share.share({ message });
        return;
      }
      // Bản xem trước trên trình duyệt: navigator.share nếu có, không thì chép vào bộ nhớ tạm
      const nav = typeof navigator !== 'undefined' ? navigator : undefined;
      if (nav?.share) await nav.share({ title: 'Đơn mua bán Nhà Nông', text: message });
      else if (nav?.clipboard) {
        await nav.clipboard.writeText(message);
        showToast({ message: 'Đã chép lời mời, dán vào Zalo để gửi.' });
      } else showToast({ message: `Gửi mã ${deal.code} cho bên kia` });
    } catch {
      // Người dùng hủy chia sẻ
    }
  };
  return (
    <Card style={{ alignItems: 'center', backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }}>
      <Text style={[styles.muted, { textAlign: 'center' }]}>Gửi mã này cho {deal.my_role === 'buyer' ? 'bên bán' : 'bên mua'} để cùng xem và xác nhận đơn</Text>
      <Text selectable accessibilityLabel={`Mã đơn ${deal.code}`} testID="deal-code" style={{ fontSize: 40, fontWeight: '800', letterSpacing: 6, color: colors.primary, marginVertical: 8 }}>
        {deal.code}
      </Text>
      <View style={{ alignSelf: 'stretch' }}>
        <Button label="📤 Gửi mã (Zalo, tin nhắn…)" onPress={() => void share()} />
      </View>
    </Card>
  );
}

const STATUS_COLOR: Record<DealEntry['status'], string> = { pending: colors.loss, confirmed: colors.gain, disputed: colors.error, private: colors.muted };

function EntryCard({ deal, entry: e, token, run }: { deal: Deal; entry: DealEntry; token: string; run: Run }) {
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState('');
  const open = deal.status === 'open';
  const canRespond = open && !e.mine && (e.status === 'pending' || e.status === 'disputed');

  const sendDispute = async () => {
    if (!reason.trim()) return;
    if (await run(() => api.disputeDealEntry(token, e.uuid, reason.trim()), 'Đã báo sai, chờ bên kia sửa')) {
      setDisputing(false);
      setReason('');
    }
  };

  const remove = async () => {
    if (await confirmAsync('Xóa mục này?', `${KIND_LABEL[e.kind]} ${formatVnd(e.amount)} ngày ${formatDate(e.date)}`)) await run(() => api.deleteDealEntry(token, e.uuid), 'Đã xóa');
  };

  return (
    <Card style={{ borderLeftWidth: 6, borderLeftColor: STATUS_COLOR[e.status] }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4 }}>
        <Text style={{ fontSize: font.body, fontWeight: '700', color: colors.text }}>{KIND_LABEL[e.kind]}</Text>
        <Text style={styles.muted}>
          {formatDate(e.date)} · {e.mine ? 'mình ghi' : `${e.created_by_name ?? 'bên kia'} ghi`}
        </Text>
      </View>
      <View style={{ marginTop: 4 }}>
        <Tag label={STATUS_LABEL[e.status]} warn={e.status === 'pending' || e.status === 'disputed'} />
      </View>
      {e.kind === 'cut' && e.lines ? (
        <View style={{ marginTop: 6 }}>
          {e.lines.map((l, i) => (
            <Text key={i} style={styles.body}>
              • {l.grade}: {formatQty(l.kg)} {deal.unit} × {formatVnd(l.price)} = <Text style={{ fontWeight: '700' }}>{formatVnd(Math.round(l.kg * l.price))}</Text>
            </Text>
          ))}
          <Text style={[styles.body, { marginTop: 4 }]}>
            Tiền hàng <Text style={{ fontWeight: '700' }}>{formatVnd(e.amount)}</Text>
            {e.deposit_deduct > 0 && ` · trừ cọc ${formatVnd(e.deposit_deduct)}`}
            {e.paid > 0 && ` · trả ngay ${formatVnd(e.paid)}`}
          </Text>
        </View>
      ) : (
        <Text style={{ fontSize: font.title, fontWeight: '800', color: colors.text, marginTop: 6 }}>{formatVnd(e.amount)}</Text>
      )}
      {e.note ? <Text style={[styles.muted, { marginTop: 4 }]}>{e.note}</Text> : null}
      {e.status === 'disputed' && e.dispute_reason ? <Text style={[styles.body, { color: colors.error, marginTop: 4 }]}>⚠️ Lý do báo sai: {e.dispute_reason}</Text> : null}
      {e.kind === 'cut' && e.status !== 'disputed' && <CutPrint token={token} entryId={e.uuid} />}

      {(canRespond || (open && e.mine)) && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {canRespond && <Chip label="✅ Đồng ý" active onPress={() => void run(() => api.confirmDealEntry(token, e.uuid), 'Đã xác nhận')} />}
          {canRespond && e.status === 'pending' && !disputing && <Chip label="⚠️ Báo sai" active={false} onPress={() => setDisputing(true)} />}
          {open && e.mine && <Chip label="Sửa" active={false} onPress={() => router.push({ pathname: '/deals/entry', params: { dealId: deal.uuid, entryId: e.uuid } })} />}
          {open && e.mine && e.status !== 'confirmed' && <Chip label="Xóa" active={false} onPress={() => void remove()} />}
        </View>
      )}
      {disputing && (
        <View style={{ marginTop: 10, gap: 8 }}>
          <Text style={styles.body}>Sai chỗ nào?</Text>
          <TextInput
            accessibilityLabel="Lý do báo sai"
            value={reason}
            onChangeText={setReason}
            maxLength={255}
            autoFocus
            placeholder="Ví dụ: Loại A là 1.250 kg"
            placeholderTextColor={colors.muted}
            onSubmitEditing={() => void sendDispute()}
            style={inputStyle}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button label="Gửi báo sai" variant="danger" disabled={!reason.trim()} onPress={() => void sendDispute()} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Thôi" variant="outline" onPress={() => setDisputing(false)} />
            </View>
          </View>
        </View>
      )}
    </Card>
  );
}

/** Thương lái: gộp các đơn mua (của nông dân) vào đơn bán này để tính lời cả lô */
function LotCard({ deal, token, run }: { deal: Deal; token: string; run: Run }) {
  const [picking, setPicking] = useState(false);
  const [buyDeals, setBuyDeals] = useState<Deal[] | null>(null);
  const linked = new Set((deal.sources ?? []).map((s) => s.uuid));
  const lot = deal.lot;

  useEffect(() => {
    if (!picking) return;
    let active = true;
    api.deals(token).then(
      (all) => active && setBuyDeals(all.filter((d) => d.my_role === 'buyer')),
      (err: Error) => active && showToast({ message: err.message }),
    );
    return () => {
      active = false;
    };
  }, [picking, token]);

  const toggle = (uuid: string) => {
    const next = linked.has(uuid) ? [...linked].filter((u) => u !== uuid) : [...linked, uuid];
    void run(() => api.setDealSources(token, deal.uuid, next));
  };

  return (
    <Card>
      <Text style={heading}>📦 Lời cả lô (chỉ mình thấy)</Text>
      <Text style={[styles.muted, { marginBottom: 6 }]}>Thương lái mua của nhiều nông dân rồi bán lại: gộp các đơn mua vào đơn bán này để biết lời bao nhiêu.</Text>
      {lot && lot.sources > 0 && (
        <View style={{ marginBottom: 8 }}>
          <Row label={`Tiền bán (${formatQty(lot.sell_kg)} kg)`} value={formatVnd(lot.revenue)} color={colors.gain} />
          <Row label={`Tiền mua ${lot.sources} đơn (${formatQty(lot.buy_kg)} kg)`} value={`−${formatVnd(lot.buy_cost)}`} color={colors.loss} />
          <Row label="Chi phí riêng (xe, công…)" value={`−${formatVnd(lot.costs)}`} color={colors.loss} />
          <Row label={lot.profit >= 0 ? 'Lời' : 'Lỗ'} value={formatVnd(Math.abs(lot.profit))} bold color={lot.profit >= 0 ? colors.gain : colors.loss} />
          {lot.kg_loss !== 0 && <Row label="Hao hụt" value={`${formatQty(lot.kg_loss)} kg`} />}
        </View>
      )}
      {(deal.sources ?? []).length > 0 && <Text style={[styles.body, { marginBottom: 8 }]}>Đã gộp: {(deal.sources ?? []).map((s) => s.title).join(', ')}</Text>}
      <Button label={picking ? 'Xong' : '＋ Gộp đơn mua'} variant="outline" onPress={() => setPicking(!picking)} />
      {picking && (
        <View style={{ marginTop: 10 }}>
          {!buyDeals && <ActivityIndicator color={colors.primary} />}
          {buyDeals?.length === 0 && <Text style={styles.muted}>Chưa có đơn nào mình là bên mua.</Text>}
          {buyDeals?.map((d) => (
            <CheckRow key={d.uuid} label={`${d.title} · ${counterpartName(d)} · ${formatVnd(d.summary.confirmed.delivered)}`} checked={linked.has(d.uuid)} onChange={() => toggle(d.uuid)} />
          ))}
        </View>
      )}
    </Card>
  );
}

/** Ghi các đợt cân đã xác nhận vào Sổ thu chi của mình (chọn vườn, hạng mục) */
/**
 * Ghi các đợt cân đã xác nhận vào Sổ thu chi của mình. Chọn vườn (hoặc chi chung) + hạng mục;
 * đã nối rồi thì đổi vườn / hạng mục là các khoản đã ghi chuyển theo ngay.
 */
function LedgerLinkCard({ deal }: { deal: Deal }) {
  const state = useLedger();
  const [draft, setDraft] = useState<{ garden_id: string | null; category_id: string | null } | null>(null);
  const ledger = state.ledger;
  const linked = !!(state.ledger && state.data.meta.deal_links?.[deal.uuid]);
  // Đơn thay đổi (bên kia vừa xác nhận…) thì cập nhật sổ ngay
  useEffect(() => {
    if (linked && ledger) void ledger.applyDeal(deal).catch(() => {});
  }, [deal, linked, ledger]);
  if (!state.ledger) return null;
  const { ledger: lg, data } = state;
  const link = data.meta.deal_links?.[deal.uuid];
  const seller = deal.my_role === 'seller';
  const categories = data.categories.filter((c) => c.type === (seller ? 'income' : 'expense'));
  const defaultCategory = categories.find((c) => c.name === (seller ? 'Bán nông sản' : 'Mua nông sản'))?.id ?? null;
  const gardenId = link ? link.garden_id : draft ? draft.garden_id : seller ? (data.gardens[0]?.id ?? null) : null;
  const categoryId = link?.category_id ?? draft?.category_id ?? defaultCategory;
  const gardenName = (id: string | null) => (id ? (data.gardens.find((g) => g.id === id)?.name ?? 'vườn đã xóa') : 'Chi chung');

  const save = async (next: { garden_id: string | null; category_id: string | null }, message: (changed: number) => string) => {
    try {
      const category =
        next.category_id ??
        (seller ? await lg.ensureCategory('income', 'Bán nông sản', '💰', '#15803d') : await lg.ensureCategory('expense', 'Mua nông sản', '🧺', '#b45309'));
      await lg.linkDeal(deal.uuid, { garden_id: next.garden_id, category_id: category });
      showToast({ message: message(await lg.applyDeal(deal)) });
    } catch (err) {
      showToast({ message: (err as Error).message });
    }
  };
  // Đã nối: đổi là lưu ngay; chưa nối: chỉ chọn, bấm "Nối với sổ" mới ghi
  const pick = (patch: Partial<{ garden_id: string | null; category_id: string | null }>) => {
    const next = { garden_id: gardenId, category_id: categoryId, ...patch };
    if (link) void save(next, (n) => `Đã chuyển sang ${gardenName(next.garden_id)}${n ? ` (${n} khoản)` : ''}`);
    else setDraft(next);
  };

  if (!data.meta.storage_mode) {
    return (
      <Card>
        <Text style={heading}>📒 Sổ thu chi</Text>
        <Text style={[styles.muted, { marginBottom: 8 }]}>Mở Sổ thu chi 1 lần để có thể tự ghi các đợt cân vào sổ.</Text>
        <Button label="Mở Sổ thu chi" variant="outline" onPress={() => router.navigate('/ledger')} />
      </Card>
    );
  }

  return (
    <Card>
      <Text style={heading}>📒 Sổ thu chi</Text>
      <Text style={[styles.muted, { marginBottom: 8 }]}>
        {link
          ? `✅ Đã nối: các đợt cân đã xác nhận tự ghi ${seller ? 'tiền vào' : 'tiền ra'} vào ${gardenName(link.garden_id)}; chi phí riêng ghi tiền ra. Đổi vườn / hạng mục bên dưới, các khoản đã ghi chuyển theo.`
          : `Tự ghi các đợt cân đã xác nhận vào sổ (${seller ? 'tiền vào' : 'tiền ra'}). Cọc và tiền trả không tính vào lời/lỗ.`}
      </Text>
      <Text style={[styles.body, { fontWeight: '700', marginBottom: 6 }]}>{seller ? 'Tiền bán hàng ghi cho vườn nào' : 'Tiền mua hàng ghi cho vườn nào'}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {data.gardens.map((g) => (
          <Chip key={g.id} label={`🌳 ${g.name}`} active={gardenId === g.id} onPress={() => pick({ garden_id: g.id })} />
        ))}
        <Chip label="📦 Chi chung" active={gardenId === null} onPress={() => pick({ garden_id: null })} />
        <Chip label="＋ Thêm vườn" active={false} onPress={() => router.push({ pathname: '/ledger/garden-form', params: { back: '1' } })} />
      </View>
      {seller && data.gardens.length === 0 && (
        <Text style={[styles.muted, { color: colors.loss, marginBottom: 8 }]}>Chưa có vườn nào: bấm "＋ Thêm vườn" để tạo vườn rồi chọn lại.</Text>
      )}
      {categories.length > 1 && (
        <>
          <Text style={[styles.body, { fontWeight: '700', marginBottom: 6 }]}>Hạng mục</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {categories.map((c) => (
              <Chip key={c.id} label={`${c.icon} ${c.name}`} active={categoryId === c.id} onPress={() => pick({ category_id: c.id })} />
            ))}
          </View>
        </>
      )}
      {link ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button label="🔄 Cập nhật sổ" variant="outline" onPress={async () => showToast({ message: `Đã cập nhật ${await lg.applyDeal(deal)} khoản` })} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="Bỏ nối"
              variant="danger"
              onPress={async () => {
                if (!(await confirmAsync('Bỏ nối đơn với sổ?', 'Các khoản đã tự ghi từ đơn này sẽ bị gỡ khỏi sổ.', 'Bỏ nối'))) return;
                await lg.linkDeal(deal.uuid, null);
                setDraft(null);
                showToast({ message: 'Đã bỏ nối, gỡ các khoản tự ghi' });
              }}
            />
          </View>
        </View>
      ) : (
        <Button label="Nối với sổ" onPress={() => void save({ garden_id: gardenId, category_id: categoryId }, (n) => `Đã nối với sổ: ghi ${n} khoản vào ${gardenName(gardenId)}`)} />
      )}
    </Card>
  );
}
