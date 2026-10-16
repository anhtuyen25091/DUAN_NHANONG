import { CONTRACT_STATUS_LABELS, contractSettlement, contractSummaries, cutOwing, cutValue, formatDate, formatQty, formatVnd, telHref, type Ledger, type LedgerSnapshot } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { ErrorNote, MoneyField } from '../../../components/fields';
import { ItemRow, SectionTitle } from '../../../components/ledger';
import { Button, Card, Chip, styles } from '../../../components/ui';
import { confirmAsync } from '../../../lib/confirm';
import { useLedger } from '../../../lib/ledger';
import { colors, font } from '../../../lib/theme';
import { showToast } from '../../../lib/toast';

/** Một hợp đồng bán cho lái: tình hình, các đợt cắt, kết thúc */
export default function ContractDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useLedger();
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  return <ContractDetail ledger={state.ledger} data={state.data} id={id} />;
}

function ContractDetail({ ledger, data, id }: { ledger: Ledger; data: LedgerSnapshot; id: string }) {
  const summary = contractSummaries(data).find((s) => s.contract.id === id);
  const [settling, setSettling] = useState(false);
  const [how, setHow] = useState<'deduct' | 'refund' | 'forfeit'>('deduct');
  const [refunding, setRefunding] = useState(false);
  const [refund, setRefund] = useState(summary?.depositLeft ?? 0);
  const [payAmount, setPayAmount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!summary) {
    return (
      <Card style={{ margin: 16 }}>
        <Stack.Screen options={{ title: 'Bán cho lái' }} />
        <Text style={styles.body}>Không tìm thấy hợp đồng này (có thể đã xóa).</Text>
      </Card>
    );
  }
  const { contract, cuts, delivered, kg, deducted, depositLeft, paidByCuts, owing } = summary;
  const garden = data.gardens.find((g) => g.id === contract.garden_id);
  const open = contract.status === 'open';
  const settlement = contractSettlement(summary, data.transactions);
  const canDeduct = settlement.deductRoom >= depositLeft;
  const choice = depositLeft > 0 && !canDeduct && how === 'deduct' ? 'refund' : how;

  const run = async (action: () => Promise<unknown>, message: string) => {
    setError(null);
    try {
      await action();
      setRefunding(false);
      setSettling(false);
      showToast({ message });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async () => {
    const ok = await confirmAsync(`Xóa hợp đồng với lái ${contract.buyer}?`, `${cuts.length} đợt cắt và tiền vào của các đợt cũng bị xóa.`);
    if (!ok) return;
    const undo = await ledger.removeContract(id);
    showToast({ message: 'Đã xóa hợp đồng', undo });
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{
          title: `🤝 ${contract.buyer}`,
          headerRight: () => (
            <Text accessibilityRole="button" onPress={() => router.push({ pathname: '/ledger/contracts/form', params: { id } })} style={{ color: colors.primary, fontSize: font.body, padding: 8 }}>
              Sửa
            </Text>
          ),
        }}
      />
      {garden ? (
        <Pressable onPress={() => router.push({ pathname: '/ledger/garden/[id]', params: { id: garden.id } })} accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: colors.primary, fontSize: font.body, fontWeight: '600' }}>🌳 {garden.name}</Text>
        </Pressable>
      ) : (
        <Text style={styles.body}>Vườn đã xóa</Text>
      )}
      <Text style={[styles.body, { marginBottom: 8 }]}>
        {contract.crop ? `${contract.crop} · ` : ''}cọc ngày {formatDate(contract.date)} · <Text style={{ fontWeight: '700' }}>{CONTRACT_STATUS_LABELS[contract.status]}</Text>
        {contract.closed_on ? ` (${formatDate(contract.closed_on)})` : ''}
      </Text>
      {contract.phone && (
        <View style={{ marginBottom: 8 }}>
          <Button label={`📞 Gọi ${contract.phone}`} variant="outline" onPress={() => void Linking.openURL(telHref(contract.phone!))} />
        </View>
      )}

      <Card style={{ borderLeftWidth: 6, borderLeftColor: colors.gain }}>
        <Text style={styles.muted}>
          Tiền hàng đã giao ({cuts.length} đợt · {formatQty(kg)} kg)
        </Text>
        <Text style={{ fontSize: 30, fontWeight: '800', color: colors.gain, marginVertical: 2 }}>{formatVnd(delivered)}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 18 }}>
          <Text style={styles.body}>
            Cọc <Text style={{ fontWeight: '700' }}>{formatVnd(contract.deposit)}</Text>
          </Text>
          <Text style={styles.body}>
            Đã trừ cọc <Text style={{ fontWeight: '700' }}>{formatVnd(deducted)}</Text>
          </Text>
          <Text style={styles.body}>
            Lái đã trả thêm <Text style={{ fontWeight: '700' }}>{formatVnd(paidByCuts)}</Text>
          </Text>
        </View>
        {open && <Text style={[styles.muted, depositLeft > 0 && { color: colors.loss, fontWeight: '700' }, { marginTop: 4 }]}>Cọc còn chưa trừ: {formatVnd(depositLeft)}</Text>}
        {owing > 0 && <Text style={[styles.body, { color: colors.loss, fontWeight: '700', marginTop: 4 }]}>Lái còn nợ tiền hàng: {formatVnd(owing)}</Text>}
      </Card>

      {owing > 0 && (
        <Card>
          <MoneyField label="Lái trả thêm" value={payAmount ?? owing} onChange={setPayAmount} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip label={`Trả hết ${formatVnd(owing)}`} active={(payAmount ?? owing) === owing} onPress={() => setPayAmount(owing)} />
          </View>
          <View style={{ marginTop: 8 }}>
            <Button
              label="💵 Ghi lái trả"
              disabled={(payAmount ?? owing) <= 0}
              onPress={() => {
                const amount = payAmount ?? owing;
                setPayAmount(null);
                void run(() => ledger.payContractOwing(id, amount), `Đã ghi lái trả thêm ${formatVnd(Math.min(amount, owing))}`);
              }}
            />
          </View>
        </Card>
      )}

      {open && <Button label="✂️ Ghi đợt cắt" onPress={() => router.push({ pathname: '/ledger/contracts/cut-form', params: { contractId: id } })} />}

      <SectionTitle>Các đợt cắt</SectionTitle>
      {cuts.length === 0 && <Text style={styles.muted}>Chưa có đợt nào.</Text>}
      {cuts.map((cut, i) => (
        <ItemRow
          key={cut.id}
          icon="✂️"
          subLines={6}
          title={`Đợt ${i + 1} · ${formatDate(cut.date)}`}
          sub={`${cut.lines.map((l) => `${l.grade} ${formatQty(l.kg)} kg × ${formatVnd(l.price)}`).join(' · ')}${cut.deposit_deduct > 0 ? ` · trừ cọc ${formatVnd(cut.deposit_deduct)}` : ''}${cutOwing(cut) > 0 ? ` · lái còn nợ ${formatVnd(cutOwing(cut))}` : ''}`}
          amount={`+${formatVnd(cutValue(cut.lines))}`}
          amountColor={colors.gain}
          onPress={() => router.push({ pathname: '/ledger/contracts/cut-form', params: { contractId: id, id: cut.id } })}
        />
      ))}

      <View style={{ marginTop: 12 }}>
        {open && !settling && <Button label="✅ Hoàn tất hợp đồng" onPress={() => setSettling(true)} />}
        {open && settling && (
          <Card>
            <Text style={heading}>Quyết toán với lái {contract.buyer}</Text>
            <Row label={`Tiền hàng ${cuts.length} đợt (${formatQty(kg)} kg)`} value={formatVnd(delivered)} />
            <Row label="Tiền cọc" value={formatVnd(contract.deposit)} />
            <Row label="Đã trừ cọc vào các đợt" value={formatVnd(deducted)} />
            <Row label="Cọc còn dư" value={formatVnd(depositLeft)} bold color={depositLeft > 0 ? colors.loss : undefined} />
            {depositLeft > 0 && (
              <View style={{ marginTop: 12, gap: 8 }}>
                <Text style={[styles.body, { fontWeight: '700' }]}>Phần cọc dư {formatVnd(depositLeft)} xử lý thế nào?</Text>
                <Choice
                  selected={choice === 'deduct'}
                  disabled={!canDeduct}
                  title="Trừ nốt vào tiền hàng"
                  hint={
                    canDeduct
                      ? `Lái đã trả tiền hàng sau khi trừ đủ cọc. App trừ thêm vào đợt cuối trước; lái thực trả tổng ${formatVnd(delivered)}.`
                      : `Không đủ: tiền hàng chỉ còn ${formatVnd(settlement.deductRoom)} để trừ.`
                  }
                  onPress={() => setHow('deduct')}
                />
                <Choice selected={choice === 'refund'} title={`Trả lại lái ${formatVnd(depositLeft)}`} hint="Không đổi lời/lỗ." onPress={() => setHow('refund')} />
                <Choice selected={choice === 'forfeit'} title={`Lái bỏ cọc ${formatVnd(depositLeft)}`} hint="Phần cọc dư thành tiền vào của vườn." onPress={() => setHow('forfeit')} />
              </View>
            )}
            <View style={{ gap: 8, marginTop: 12 }}>
              <Button label="Xác nhận hoàn tất" onPress={() => run(() => ledger.settleContract(id, choice), `Đã hoàn tất hợp đồng với lái ${contract.buyer}`)} />
              <Button label="Hủy" variant="outline" onPress={() => setSettling(false)} />
            </View>
            {depositLeft > 0 && (
              <View style={{ marginTop: 12 }}>
                {!refunding ? (
                  <Text accessibilityRole="button" onPress={() => { setRefund(depositLeft); setRefunding(true); }} style={{ color: colors.primary, fontSize: font.body, paddingVertical: 8 }}>
                    Trả lại cọc kèm tiền đền…
                  </Text>
                ) : (
                  <>
                    <MoneyField label="Số tiền trả lại lái" value={refund} onChange={setRefund} />
                    {refund > depositLeft && <Text style={[styles.muted, { color: colors.loss, marginTop: -4, marginBottom: 10 }]}>Đền thêm {formatVnd(refund - depositLeft)}: ghi thành tiền ra của vườn.</Text>}
                    <Button label="Ghi trả lại cọc" onPress={() => run(() => ledger.refundDeposit(id, refund), `Đã ghi trả lại cọc ${formatVnd(refund)}`)} />
                  </>
                )}
              </View>
            )}
          </Card>
        )}
        {!open && (
          <Card>
            <Text style={heading}>📋 Quyết toán</Text>
            <Row label={`Tiền hàng ${cuts.length} đợt (${formatQty(kg)} kg)`} value={formatVnd(delivered)} color={colors.gain} />
            {settlement.forfeited > 0 && <Row label="Lái bỏ cọc" value={`+${formatVnd(settlement.forfeited)}`} color={colors.gain} />}
            {settlement.refunded > 0 && <Row label="Trả lại cọc cho lái" value={formatVnd(settlement.refunded)} />}
            {settlement.penalty > 0 && <Row label="Đền thêm cho lái" value={`-${formatVnd(settlement.penalty)}`} color={colors.loss} />}
            <Row label="Tiền lái thực trả (cọc + các đợt − trả lại)" value={formatVnd(settlement.received)} />
            <Row label="Tính vào lời/lỗ của vườn" value={formatVnd(settlement.profit)} bold color={colors.gain} />
            {kg > 0 && <Text style={[styles.muted, { marginTop: 6 }]}>Giá bình quân: {formatVnd(Math.round(delivered / kg))}/kg</Text>}
            <View style={{ marginTop: 12 }}>
              <Button label="Mở lại hợp đồng" variant="outline" onPress={() => run(() => ledger.reopenContract(id), 'Đã mở lại hợp đồng')} />
            </View>
          </Card>
        )}
      </View>
      <View style={{ marginTop: 12 }}>
        <ErrorNote message={error} />
      </View>

      <Button label="Xóa hợp đồng" variant="danger" onPress={remove} />
    </ScrollView>
  );
}

const heading = { fontSize: font.body + 1, fontWeight: '700' as const, color: colors.text, marginBottom: 8 };

/** 1 dòng của bảng quyết toán: nhãn bên trái, số tiền bên phải */
function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border, borderStyle: 'dashed' }}>
      <Text style={[styles.body, { flex: 1 }, bold && { fontWeight: '700' }]}>{label}</Text>
      <Text style={[styles.body, { fontWeight: '700' }, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

/** Ô chọn 1 cách xử lý cọc dư (radio) */
function Choice({ selected, disabled, title, hint, onPress }: { selected: boolean; disabled?: boolean; title: string; hint: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      style={{ flexDirection: 'row', gap: 10, padding: 12, borderWidth: selected ? 2 : 1, borderColor: selected ? colors.primary : colors.border, borderRadius: 12, opacity: disabled ? 0.5 : 1 }}
    >
      <Text style={{ fontSize: 20 }}>{selected ? '🔘' : '⚪️'}</Text>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.body, { fontWeight: '700' }]}>{title}</Text>
        <Text style={styles.muted}>{hint}</Text>
      </View>
    </Pressable>
  );
}
