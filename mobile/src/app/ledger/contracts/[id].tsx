import { CONTRACT_STATUS_LABELS, contractSummaries, cutValue, formatDate, formatQty, formatVnd, telHref, type Ledger, type LedgerSnapshot } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { ErrorNote, MoneyField } from '../../../components/fields';
import { ItemRow, SectionTitle } from '../../../components/ledger';
import { Button, Card, styles } from '../../../components/ui';
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
  const [refunding, setRefunding] = useState(false);
  const [refund, setRefund] = useState(summary?.depositLeft ?? 0);
  const [error, setError] = useState<string | null>(null);

  if (!summary) {
    return (
      <Card style={{ margin: 16 }}>
        <Stack.Screen options={{ title: 'Bán cho lái' }} />
        <Text style={styles.body}>Không tìm thấy hợp đồng này (có thể đã xóa).</Text>
      </Card>
    );
  }
  const { contract, cuts, delivered, kg, deducted, depositLeft, paidByCuts } = summary;
  const garden = data.gardens.find((g) => g.id === contract.garden_id);
  const open = contract.status === 'open';

  const run = async (action: () => Promise<unknown>, message: string) => {
    setError(null);
    try {
      await action();
      setRefunding(false);
      showToast({ message });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const forfeit = async () => {
    const ok = await confirmAsync(`Lái ${contract.buyer} bỏ cọc?`, `${formatVnd(depositLeft)} cọc còn lại sẽ ghi thành tiền vào của vườn.`, 'Lái bỏ cọc');
    if (ok) await run(() => ledger.forfeitDeposit(id), `Đã ghi lái bỏ cọc: +${formatVnd(depositLeft)}`);
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
            Lái trả thêm <Text style={{ fontWeight: '700' }}>{formatVnd(paidByCuts)}</Text>
          </Text>
        </View>
        {open && <Text style={[styles.muted, depositLeft > 0 && { color: colors.loss, fontWeight: '700' }, { marginTop: 4 }]}>Cọc còn chưa trừ: {formatVnd(depositLeft)}</Text>}
      </Card>

      {open && <Button label="✂️ Ghi đợt cắt" onPress={() => router.push({ pathname: '/ledger/contracts/cut-form', params: { contractId: id } })} />}

      <SectionTitle>Các đợt cắt</SectionTitle>
      {cuts.length === 0 && <Text style={styles.muted}>Chưa có đợt nào.</Text>}
      {cuts.map((cut, i) => (
        <ItemRow
          key={cut.id}
          icon="✂️"
          subLines={6}
          title={`Đợt ${i + 1} · ${formatDate(cut.date)}`}
          sub={`${cut.lines.map((l) => `${l.grade} ${formatQty(l.kg)} kg × ${formatVnd(l.price)}`).join(' · ')}${cut.deposit_deduct > 0 ? ` · trừ cọc ${formatVnd(cut.deposit_deduct)}` : ''}`}
          amount={`+${formatVnd(cutValue(cut.lines))}`}
          amountColor={colors.gain}
          onPress={() => router.push({ pathname: '/ledger/contracts/cut-form', params: { contractId: id, id: cut.id } })}
        />
      ))}

      <View style={{ marginTop: 12 }}>
        {open ? (
          <Card>
            <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text, marginBottom: 8 }}>Kết thúc hợp đồng</Text>
            {depositLeft === 0 ? (
              <Button label="✅ Cắt xong, đóng hợp đồng" onPress={() => run(() => ledger.closeContract(id), 'Đã đóng hợp đồng')} />
            ) : (
              <>
                <Text style={[styles.muted, { marginBottom: 10 }]}>Còn {formatVnd(depositLeft)} cọc chưa trừ: trừ vào đợt cuối, hoặc chọn một cách dưới đây.</Text>
                <View style={{ gap: 8 }}>
                  <Button label="Lái bỏ cọc" variant="outline" onPress={forfeit} />
                  <Button
                    label="Trả lại cọc"
                    variant="outline"
                    onPress={() => {
                      setRefund(depositLeft);
                      setRefunding(!refunding);
                    }}
                  />
                </View>
                {refunding && (
                  <View style={{ marginTop: 14 }}>
                    <MoneyField label="Số tiền trả lại lái" value={refund} onChange={setRefund} />
                    {refund > depositLeft && <Text style={[styles.muted, { color: colors.loss, marginTop: -4, marginBottom: 10 }]}>Đền thêm {formatVnd(refund - depositLeft)}: ghi thành tiền ra của vườn.</Text>}
                    <Button label="Ghi trả lại cọc" onPress={() => run(() => ledger.refundDeposit(id, refund), `Đã ghi trả lại cọc ${formatVnd(refund)}`)} />
                  </View>
                )}
              </>
            )}
          </Card>
        ) : (
          <Button label="Mở lại hợp đồng" variant="outline" onPress={() => run(() => ledger.reopenContract(id), 'Đã mở lại hợp đồng')} />
        )}
      </View>
      <View style={{ marginTop: 12 }}>
        <ErrorNote message={error} />
      </View>

      <Button label="Xóa hợp đồng" variant="danger" onPress={remove} />
    </ScrollView>
  );
}
