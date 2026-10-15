import { formatDate, formatQty, formatVnd, supplyCost, supplyStock, today, type Ledger, type LedgerSnapshot } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { checkDate, DateField, ErrorNote, GardenPicker, QtyField } from '../../../components/fields';
import { ItemRow, SectionTitle } from '../../../components/ledger';
import { Button, Card, styles } from '../../../components/ui';
import { confirmAsync } from '../../../lib/confirm';
import { useLedger } from '../../../lib/ledger';
import { parseQty, qtyText } from '../../../lib/qty';
import { colors, font } from '../../../lib/theme';
import { showToast } from '../../../lib/toast';

/** Một vật tư: còn bao nhiêu, dùng cho vườn nào */
export default function SupplyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useLedger();
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  return <SupplyDetail ledger={state.ledger} data={state.data} id={id} />;
}

function SupplyDetail({ ledger, data, id }: { ledger: Ledger; data: LedgerSnapshot; id: string }) {
  const stock = supplyStock(data).find((s) => s.supply.id === id);
  const [gardenId, setGardenId] = useState<string | null>(data.gardens.some((g) => g.id === data.meta.last_garden_id) ? data.meta.last_garden_id! : (data.gardens[0]?.id ?? null));
  const [qty, setQty] = useState(qtyText(stock?.left ?? 0));
  const [usedOn, setUsedOn] = useState(today());
  const [error, setError] = useState<string | null>(null);

  if (!stock) {
    return (
      <Card style={{ margin: 16 }}>
        <Stack.Screen options={{ title: 'Vật tư' }} />
        <Text style={styles.body}>Không tìm thấy vật tư này (có thể đã xóa).</Text>
      </Card>
    );
  }
  const { supply, used, left } = stock;
  const usages = data.supply_usages.filter((u) => u.supply_id === id);
  const gardens = new Map(data.gardens.map((g) => [g.id, g.name]));
  const debt = data.debts.find((d) => d.supply_id === id);
  const icon = data.categories.find((c) => c.id === supply.category_id)?.icon ?? '📦';
  const quantity = parseQty(qty);

  const use = async () => {
    if (!gardenId) return;
    const dateError = checkDate(usedOn, 'Ngày dùng', { notFuture: true });
    if (dateError) return setError(dateError);
    setError(null);
    try {
      await ledger.useSupply({ supply_id: id, garden_id: gardenId, quantity, used_on: usedOn });
      showToast({ message: `Đã ghi dùng ${formatQty(quantity)} ${supply.unit} cho ${gardens.get(gardenId)}` });
      setQty(qtyText(Math.max(0, left - quantity)));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async () => {
    const ok = await confirmAsync(`Xóa ${supply.name}?`, `Khoản tiền ra lúc mua${debt ? ', khoản nợ mua thiếu' : ''} và các lần dùng cũng bị xóa.`);
    if (!ok) return;
    const undo = await ledger.removeSupply(id);
    showToast({ message: `Đã xóa ${supply.name}`, undo });
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{
          title: `${icon} ${supply.name}`,
          headerRight: () => (
            <Text accessibilityRole="button" onPress={() => router.push({ pathname: '/ledger/supplies/form', params: { id } })} style={{ color: colors.primary, fontSize: font.body, padding: 8 }}>
              Sửa
            </Text>
          ),
        }}
      />
      <Text style={[styles.body, { marginBottom: 8 }]}>
        Mua {formatDate(supply.bought_on)}
        {supply.shop_name ? ` ở ${supply.shop_name}` : ''} · {formatQty(supply.quantity)} {supply.unit} × {formatVnd(supply.unit_price)} ={' '}
        <Text style={{ fontWeight: '700' }}>{formatVnd(supplyCost(supply))}</Text>
      </Text>
      {debt && (
        <Pressable onPress={() => router.push({ pathname: '/ledger/debts/[id]', params: { id: debt.id } })} accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center', marginBottom: 4 }}>
          <Text style={{ color: colors.primary, fontSize: font.body, fontWeight: '600' }}>🧾 Mua thiếu: xem công nợ</Text>
        </Pressable>
      )}

      <Card>
        <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text }}>
          Còn {formatQty(left)} {supply.unit}
        </Text>
        <View
          accessibilityLabel={`Đã dùng ${formatQty(used)} trên ${formatQty(supply.quantity)} ${supply.unit}`}
          style={{ height: 14, borderRadius: 7, backgroundColor: colors.gainSoft, overflow: 'hidden', marginVertical: 8 }}
        >
          <View style={{ height: '100%', width: `${Math.min(100, (used / supply.quantity) * 100)}%`, backgroundColor: colors.loss }} />
        </View>
        <Text style={styles.muted}>
          Đã dùng {formatQty(used)} {supply.unit}
        </Text>
      </Card>

      {left > 1e-9 && data.gardens.length > 0 && (
        <Card>
          <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text, marginBottom: 8 }}>Dùng cho vườn</Text>
          <GardenPicker data={data} value={gardenId} onChange={setGardenId} />
          <QtyField label="Số lượng" text={qty} onText={setQty} suffix={supply.unit} />
          <DateField label="Ngày dùng" value={usedOn} onChange={setUsedOn} notFuture />
          <ErrorNote message={error} />
          <Button label={`Ghi đã dùng · ${formatVnd(Math.round(quantity * supply.unit_price))}`} onPress={use} disabled={!gardenId || !(quantity > 0)} />
        </Card>
      )}
      {left > 1e-9 && data.gardens.length === 0 && (
        <Card style={{ backgroundColor: colors.primarySoft }}>
          <Text style={[styles.body, { marginBottom: 8 }]}>Thêm vườn trước để ghi vật tư dùng cho vườn nào.</Text>
          <Button label="＋ Thêm vườn" onPress={() => router.push('/ledger/garden-form')} />
        </Card>
      )}

      <SectionTitle>Các lần dùng</SectionTitle>
      {usages.length === 0 && <Text style={styles.muted}>Chưa dùng lần nào.</Text>}
      {usages.map((u) => (
        <ItemRow
          key={u.id}
          icon="🌳"
          title={gardens.get(u.garden_id) ?? 'Vườn đã xóa'}
          sub={`${formatDate(u.used_on)} · ${formatQty(u.quantity)} ${supply.unit}`}
          amount={`-${formatVnd(Math.round(u.quantity * supply.unit_price))}`}
          amountColor={colors.loss}
          deleteLabel="Xóa lần dùng này"
          onDelete={async () => {
            const undo = await ledger.removeUsage(u.id);
            showToast({ message: `Đã trả ${formatQty(u.quantity)} ${supply.unit} về kho`, undo });
          }}
        />
      ))}

      <View style={{ marginTop: 16 }}>
        <Button label="Xóa vật tư này" variant="danger" onPress={remove} />
      </View>
    </ScrollView>
  );
}
