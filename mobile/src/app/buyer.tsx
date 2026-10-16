import {
  addDays,
  ApiError,
  BUYER_KIND_LABELS,
  BUYER_STATUS_LABELS,
  formatDate,
  formatVnd,
  nearestProvince,
  SHOP_TYPE_LABELS,
  today,
  type BuyerKind,
  type BuyerProfile,
  type BuyerReport,
  type Category,
  type ShopType,
} from '@nhanong/shared';
import * as Location from 'expo-location';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { DateField, ErrorNote, Field, MoneyField, TextField } from '../components/fields';
import { ItemRow } from '../components/ledger';
import { Button, Card, Chip, Status, styles } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { confirmAsync } from '../lib/confirm';
import { useMyLocation } from '../lib/myLocation';
import { colors, font } from '../lib/theme';
import { useAsync } from '../lib/useAsync';

const KINDS = Object.keys(BUYER_KIND_LABELS) as BuyerKind[];
const DEALS = Object.keys(SHOP_TYPE_LABELS) as ShopType[];
/** Nhóm mặt hàng được đăng giá theo "mua / bán gì" trong hồ sơ */
const CATEGORY_OF: Record<ShopType, Category['type']> = { thu_mua: 'nong_san', phan_bon: 'phan_bon', thuoc_bvtv: 'thuoc_bvtv' };

/** Điểm mua (doanh nghiệp / đại lý / thương lái / điểm bán lẻ): đăng ký hồ sơ (admin duyệt) rồi đăng giá */
export default function BuyerScreen() {
  const auth = useAuth();
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState(false);
  const buyer = useAsync(() => (auth ? api.myBuyer(auth.token) : Promise.resolve(null)), [auth?.token, version]);
  const reload = () => setVersion((v) => v + 1);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: '🏪 Điểm mua đăng giá' }} />
      {!auth ? (
        <Card>
          <Text style={[styles.body, { marginBottom: 10 }]}>
            Doanh nghiệp, đại lý, thương lái, điểm bán lẻ đăng giá mua / bán của mình để bà con quanh vùng biết. Cần đăng nhập bằng số điện thoại.
          </Text>
          <Button label="Đăng nhập / đăng ký" onPress={() => router.push('/account')} />
        </Card>
      ) : buyer.state.status !== 'ok' ? (
        <Status state={buyer.state} retry={buyer.reload} />
      ) : !buyer.state.data || editing ? (
        <BuyerForm token={auth.token} buyer={buyer.state.data} onSaved={() => (setEditing(false), reload())} onCancel={buyer.state.data ? () => setEditing(false) : undefined} />
      ) : (
        <>
          <View style={{ marginBottom: 12 }}>
            <Button label="📒 Sổ giao dịch, gửi phiếu PDF / Word" variant="outline" onPress={() => router.push('/trade')} />
          </View>
          <StatusCard buyer={buyer.state.data} onEdit={() => setEditing(true)} />
          {buyer.state.data.status === 'approved' && <PostPrices token={auth.token} buyer={buyer.state.data} />}
        </>
      )}
    </ScrollView>
  );
}

function StatusCard({ buyer, onEdit }: { buyer: BuyerProfile; onEdit: () => void }) {
  const color = buyer.status === 'approved' ? colors.gain : buyer.status === 'pending' ? '#ca8a04' : colors.loss;
  return (
    <Card style={{ borderLeftWidth: 6, borderLeftColor: color, gap: 4 }}>
      <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text }}>
        {buyer.name}
        {buyer.is_verified ? <Text style={{ color: colors.primary }}> ✓ Đã xác minh</Text> : null}
      </Text>
      <Text style={styles.muted}>
        {buyer.kind_label} · {buyer.deals_in.map((d) => SHOP_TYPE_LABELS[d]).join(', ')} · {buyer.province_name}
      </Text>
      <Text style={styles.body}>{BUYER_STATUS_LABELS[buyer.status]}</Text>
      {buyer.status === 'pending' && <Text style={styles.muted}>Hồ sơ đang chờ kiểm tra. Khi được duyệt bạn sẽ đăng giá được và điểm của bạn hiện trong danh sách Điểm bán.</Text>}
      {(buyer.status === 'rejected' || buyer.status === 'suspended') && buyer.admin_note ? <Text style={{ color: colors.loss }}>Lý do: {buyer.admin_note}</Text> : null}
      <View style={{ marginTop: 6 }}>
        <Button label={buyer.status === 'rejected' ? 'Sửa và gửi lại' : 'Sửa hồ sơ'} variant="outline" onPress={onEdit} />
      </View>
    </Card>
  );
}

function BuyerForm({ token, buyer, onSaved, onCancel }: { token: string; buyer: BuyerProfile | null; onSaved: () => void; onCancel?: () => void }) {
  const myLocation = useMyLocation();
  const provinces = useAsync(() => api.provinces(), []);
  const [name, setName] = useState(buyer?.name ?? '');
  const [kind, setKind] = useState<BuyerKind>(buyer?.kind ?? 'dai_ly');
  const [dealsIn, setDealsIn] = useState<ShopType[]>(buyer?.deals_in ?? ['thu_mua']);
  const [phone, setPhone] = useState(buyer?.phone ?? '');
  const [address, setAddress] = useState(buyer?.address ?? '');
  const [province, setProvince] = useState(buyer?.province ?? myLocation?.province ?? '');
  const [goods, setGoods] = useState(buyer?.goods ?? '');
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(buyer ? { lat: buyer.lat, lng: buyer.lng } : null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const locate = async () => {
    setMessage('Đang lấy vị trí…');
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return setMessage('Chưa cho phép dùng vị trí.');
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const next = { lat: Math.round(p.coords.latitude * 1e5) / 1e5, lng: Math.round(p.coords.longitude * 1e5) / 1e5 };
      setPoint(next);
      if (!province) setProvince(nearestProvince(next.lat, next.lng));
      setMessage(null);
    } catch {
      setMessage('Không lấy được vị trí. Hãy bật GPS rồi thử lại.');
    }
  };

  const submit = async () => {
    if (!point) return setMessage('Hãy chọn vị trí điểm mua (đứng tại điểm mua rồi bấm "Dùng vị trí hiện tại").');
    setSaving(true);
    try {
      const result = await api.saveBuyer(token, { name, kind, deals_in: dealsIn, phone, address, province_code: province, goods, ...point });
      setMessage(result.message ?? 'Đã lưu hồ sơ.');
      onSaved();
    } catch (error) {
      const first = error instanceof ApiError ? Object.values(error.errors)[0]?.[0] : null;
      setMessage(first ?? (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <Text style={[styles.muted, { marginBottom: 8 }]}>Hồ sơ được kiểm tra trước khi đăng giá, để bà con tin giá trên app là giá thật.</Text>
      <TextField label="Tên điểm mua / doanh nghiệp *" value={name} onChange={setName} maxLength={120} placeholder="Ví dụ: Đại lý cà phê Hai Lúa" />
      <Field label="Bạn là">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {KINDS.map((k) => (
            <Chip key={k} label={BUYER_KIND_LABELS[k]} active={k === kind} onPress={() => setKind(k)} />
          ))}
        </View>
      </Field>
      <Field label="Mua / bán gì (chọn được nhiều)">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {DEALS.map((d) => (
            <Chip key={d} label={SHOP_TYPE_LABELS[d]} active={dealsIn.includes(d)} onPress={() => setDealsIn(dealsIn.includes(d) ? dealsIn.filter((x) => x !== d) : [...dealsIn, d])} />
          ))}
        </View>
      </Field>
      <TextField label="Số điện thoại liên hệ *" value={phone} onChange={setPhone} keyboardType="phone-pad" maxLength={20} />
      <TextField label="Địa chỉ" value={address} onChange={setAddress} maxLength={255} placeholder="Số nhà, đường, xã" />
      <Field label={`Tỉnh / thành *${province ? `: ${provinces.state.status === 'ok' ? (provinces.state.data.find((p) => p.code === province)?.name ?? '') : ''}` : ''}`}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {provinces.state.status === 'ok' && provinces.state.data.map((p) => <Chip key={p.code} label={p.name} active={p.code === province} onPress={() => setProvince(p.code)} />)}
        </ScrollView>
      </Field>
      <Field label="Vị trí điểm mua *" hint={point ? `Đã chọn: ${point.lat}, ${point.lng}` : 'Bà con tìm giá theo khoảng cách tới điểm của bạn.'}>
        <View style={{ gap: 8 }}>
          <Button label="📍 Dùng vị trí hiện tại" variant="outline" onPress={locate} />
          {myLocation?.gps && <Button label="Dùng “Khu vực của tôi”" variant="outline" onPress={() => (setPoint({ lat: myLocation.lat, lng: myLocation.lng }), setProvince(myLocation.province))} />}
        </View>
      </Field>
      <TextField label="Mặt hàng (ghi thêm)" value={goods} onChange={setGoods} maxLength={255} placeholder="Ví dụ: thu mua cà phê, tiêu; bán phân NPK" />
      <ErrorNote message={message} />
      <View style={{ gap: 8 }}>
        <Button label={saving ? 'Đang gửi…' : buyer ? 'Lưu hồ sơ' : 'Gửi hồ sơ'} onPress={submit} disabled={saving || !name.trim() || dealsIn.length === 0 || !province} />
        {onCancel && <Button label="Thôi" variant="outline" onPress={onCancel} />}
      </View>
    </Card>
  );
}

/** Đăng giá: chọn mặt hàng + giá + ngày; mặt hàng đã đăng trước đây có nút "Giữ giá" cho hôm nay */
function PostPrices({ token, buyer }: { token: string; buyer: BuyerProfile }) {
  const [version, setVersion] = useState(0);
  const categories = useAsync(() => api.categories(), []);
  const reports = useAsync(() => api.myBuyerPrices(token), [token, version]);
  const [product, setProduct] = useState('');
  const [price, setPrice] = useState(0);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const allowedTypes = buyer.deals_in.map((d) => CATEGORY_OF[d]);
  const groups = categories.state.status === 'ok' ? categories.state.data.filter((c) => allowedTypes.includes(c.type) && c.products.length > 0) : [];
  const unit = groups.flatMap((g) => g.products).find((p) => p.code === product)?.unit;

  const post = async (input: { product: string; price: number; date?: string; note?: string | null }) => {
    setSending(true);
    try {
      const result = await api.postBuyerPrice(token, input);
      setMessage(result.message);
      setVersion((v) => v + 1);
      return true;
    } catch (error) {
      setMessage((error as Error).message);
      return false;
    } finally {
      setSending(false);
    }
  };
  const submit = async () => {
    if (await post({ product, price, date, note: note.trim() || null })) {
      setPrice(0);
      setNote('');
    }
  };
  const remove = async (r: BuyerReport) => {
    if (!(await confirmAsync(`Xóa giá ${r.product.name}?`, `Ngày ${formatDate(r.date)}: ${formatVnd(r.price)}`))) return;
    await api.deleteBuyerPrice(token, r.id);
    setVersion((v) => v + 1);
  };

  // Giá mới nhất từng mặt hàng (danh sách đã xếp mới trước); đã đăng hôm nay thì không cần đăng lại
  const latestByProduct = new Map<string, BuyerReport>();
  if (reports.state.status === 'ok') for (const r of reports.state.data) if (!latestByProduct.has(r.product.code)) latestByProduct.set(r.product.code, r);
  const latest = [...latestByProduct.values()].filter((r) => r.date !== today());

  return (
    <>
      <Card>
        <Text style={{ fontSize: font.title - 2, fontWeight: '700', color: colors.text, marginBottom: 6 }}>Đăng giá</Text>
        {groups.map((g) => (
          <Field key={g.slug} label={g.name}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {g.products.map((p) => (
                <Chip key={p.code} label={p.name} active={p.code === product} onPress={() => setProduct(p.code)} />
              ))}
            </View>
          </Field>
        ))}
        <MoneyField label={`Giá${unit ? ` (đ/${unit})` : ''} *`} value={price} onChange={setPrice} />
        <DateField label="Ngày" value={date} onChange={setDate} notFuture min={addDays(today(), -7)} />
        <TextField label="Ghi chú" value={note} onChange={setNote} maxLength={200} placeholder="Ví dụ: hàng loại 1, độ ẩm dưới 15%" />
        <ErrorNote message={message && !message.startsWith('Đã') ? message : null} />
        {message?.startsWith('Đã') && <Text style={[styles.body, { color: colors.gain, marginBottom: 8 }]}>{message}</Text>}
        <Button label={sending ? 'Đang đăng…' : 'Đăng giá'} onPress={submit} disabled={!product || !(price > 0) || sending} />
      </Card>

      {latest.length > 0 && (
        <Card>
          <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text }}>Đăng lại cho hôm nay</Text>
          <Text style={[styles.muted, { marginBottom: 6 }]}>Giá không đổi so với lần trước thì bấm “Giữ giá” là xong.</Text>
          {latest.map((r) => (
            <View key={r.product.code} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 8, gap: 6 }}>
              <Text style={styles.body}>
                <Text style={{ fontWeight: '700' }}>{r.product.name}</Text>
                <Text style={styles.muted}> · lần trước {formatDate(r.date, true)}</Text>
              </Text>
              <Button label={`Giữ giá ${formatVnd(r.price)}`} variant="outline" disabled={sending} onPress={() => post({ product: r.product.code, price: r.price })} />
            </View>
          ))}
        </Card>
      )}

      <Text style={{ fontSize: font.title - 2, fontWeight: '700', color: colors.text, marginTop: 8, marginBottom: 6 }}>Giá đã đăng (30 ngày)</Text>
      {reports.state.status !== 'ok' ? (
        <Status state={reports.state} retry={reports.reload} />
      ) : reports.state.data.length === 0 ? (
        <Text style={styles.muted}>Chưa đăng giá nào.</Text>
      ) : (
        reports.state.data.map((r) => (
          <ItemRow
            key={r.id}
            icon={r.status === 'published' ? '✅' : r.status === 'needs_review' ? '⏳' : '⛔'}
            title={`${r.product.name} · ${formatDate(r.date, true)}`}
            sub={[r.status_label, r.review_reason, r.note].filter(Boolean).join(' · ')}
            amount={`${formatVnd(r.price)}/${r.unit}`}
            onDelete={() => remove(r)}
            deleteLabel="Xóa giá này"
          />
        ))
      )}
    </>
  );
}
