import { filterEntries, formatVnd, paginate, totals, type EntryType } from '@nhanong/shared';
import { Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, Text, View } from 'react-native';
import { EntryItemRow, entryItems, Fab, Pager, type EntryItem } from '../../components/ledger';
import { Chip, styles } from '../../components/ui';
import { useLedger } from '../../lib/ledger';
import { colors } from '../../lib/theme';

const PER_PAGE = 20;

/** Mọi khoản thu chi: lọc theo loại / vườn, phân trang */
export default function AllEntriesScreen() {
  const state = useLedger();
  const [type, setType] = useState<EntryType | undefined>();
  const [garden, setGarden] = useState<string | null | undefined>();
  const [page, setPage] = useState(1);
  const list = useRef<FlatList<EntryItem>>(null);
  if (!state.ledger) return <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />;
  const { ledger, data } = state;

  const filtered = filterEntries(data.transactions, { type, gardenId: garden });
  const current = paginate(filtered, page, PER_PAGE);
  const sum = totals(filtered);
  const filter = (next: () => void) => {
    next();
    setPage(1);
  };
  const goTo = (p: number) => {
    setPage(p);
    list.current?.scrollToOffset({ offset: 0, animated: false });
  };

  const header = (
    <View style={{ gap: 8, marginBottom: 4 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="Tất cả" active={!type} onPress={() => filter(() => setType(undefined))} />
        <Chip label="Tiền vào" active={type === 'income'} onPress={() => filter(() => setType('income'))} />
        <Chip label="Tiền ra" active={type === 'expense'} onPress={() => filter(() => setType('expense'))} />
      </View>
      {data.gardens.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="Mọi vườn" active={garden === undefined} onPress={() => filter(() => setGarden(undefined))} />
          {data.gardens.map((g) => (
            <Chip key={g.id} label={g.name} active={garden === g.id} onPress={() => filter(() => setGarden(g.id))} />
          ))}
          <Chip label="Chi chung" active={garden === null} onPress={() => filter(() => setGarden(null))} />
        </ScrollView>
      )}
      <Text style={styles.muted}>
        {current.total} khoản
        {type !== 'expense' ? <Text> · tiền vào <Text style={{ color: colors.gain, fontWeight: '700' }}>{formatVnd(sum.income)}</Text></Text> : null}
        {type !== 'income' ? <Text> · tiền ra <Text style={{ color: colors.loss, fontWeight: '700' }}>{formatVnd(sum.expense)}</Text></Text> : null}
      </Text>
      {current.total === 0 && <Text style={styles.body}>Không có khoản nào.</Text>}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Tất cả khoản thu chi' }} />
      <FlatList
        ref={list}
        data={entryItems(current.items)}
        keyExtractor={(item) => (item.kind === 'day' ? `d${item.date}` : item.entry.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ListHeaderComponent={header}
        renderItem={({ item }) => <EntryItemRow item={item} ledger={ledger} data={data} showGarden={garden === undefined} />}
        ListFooterComponent={<Pager page={current.page} pages={current.pages} onPage={goTo} />}
      />
      <Fab label="＋ Ghi tiền" href="/ledger/add" />
    </View>
  );
}
