import { filterEntries, monthlyTotals, today, totals } from '@nhanong/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { EntryItemRow, entryItems, Fab, MonthBars, ProfitCard } from '../../../components/ledger';
import { Button, Card, styles } from '../../../components/ui';
import { useLedger } from '../../../lib/ledger';
import { colors, font } from '../../../lib/theme';
import { showToast } from '../../../lib/toast';

/** Một vườn; id = "chung" là các khoản chi chung */
export default function GardenScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useLedger();
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;

  const { ledger, data } = state;
  const garden = data.gardens.find((g) => g.id === id);
  const gardenId = id === 'chung' ? null : id;

  if (gardenId && !garden) {
    return (
      <Card style={{ margin: 16 }}>
        <Stack.Screen options={{ title: 'Vườn' }} />
        <Text style={styles.body}>Không tìm thấy vườn này (có thể đã xóa).</Text>
      </Card>
    );
  }

  const entries = filterEntries(data.transactions, { gardenId });
  const year = today().slice(0, 4);

  const remove = async () => {
    if (!garden) return;
    const undo = await ledger.removeGarden(garden.id);
    showToast({ message: `Đã xóa ${garden.name}. Các khoản chuyển sang chi chung.`, undo });
    router.back();
  };

  const header = (
    <View>
      {garden && (garden.crop || garden.area_m2) ? (
        <Text style={[styles.muted, { marginBottom: 8 }]}>
          {[garden.crop, garden.area_m2 ? `${garden.area_m2.toLocaleString('vi-VN')} m²` : null].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
      <ProfitCard label={`Năm ${year}`} {...totals(filterEntries(entries, { from: `${year}-01-01` }))} />
      <ProfitCard label="Từ trước tới nay" {...totals(entries)} />
      <Card>
        <Text style={{ fontSize: font.body + 1, fontWeight: '700', color: colors.text, marginBottom: 6 }}>6 tháng gần đây</Text>
        <MonthBars months={monthlyTotals(entries, 6, today())} />
      </Card>
      <Text style={{ fontSize: font.title - 2, fontWeight: '700', color: colors.text, marginTop: 8 }}>Các khoản đã ghi</Text>
      {entries.length === 0 && <Text style={[styles.muted, { marginTop: 6 }]}>Chưa ghi khoản nào cho vườn này.</Text>}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: garden ? garden.name : 'Chi chung',
          headerRight: garden
            ? () => (
                <Text accessibilityRole="button" onPress={() => router.push({ pathname: '/ledger/garden-form', params: { id: garden.id } })} style={{ color: colors.primary, fontSize: font.body, padding: 8 }}>
                  Sửa
                </Text>
              )
            : undefined,
        }}
      />
      <FlatList
        data={entryItems(entries)}
        keyExtractor={(item) => (item.kind === 'day' ? `d${item.date}` : item.entry.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ListHeaderComponent={header}
        renderItem={({ item }) => <EntryItemRow item={item} ledger={ledger} data={data} />}
        ListFooterComponent={garden ? <View style={{ marginTop: 16 }}><Button label="Xóa vườn này" variant="outline" onPress={remove} /></View> : null}
      />
      <Fab label="＋ Ghi tiền" href={{ pathname: '/ledger/add', params: gardenId ? { vuon: gardenId } : {} }} />
    </View>
  );
}
