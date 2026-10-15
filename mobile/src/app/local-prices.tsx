import { CATEGORY_TYPE_LABELS, type CategoryType } from '@nhanong/shared';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { LocationBar } from '../components/LocationPicker';
import { LocalPriceList, NearbyServices } from '../components/localPrices';
import { Button, Chip, styles } from '../components/ui';
import { useMyLocation } from '../lib/myLocation';

const TYPES = Object.keys(CATEGORY_TYPE_LABELS) as CategoryType[];

/** Giá các điểm mua quanh khu vực của tôi + dịch vụ gần đó */
export default function LocalPricesScreen() {
  const location = useMyLocation();
  const [type, setType] = useState<CategoryType>('nong_san');
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: '📍 Giá quanh tôi' }} />
      <Text style={[styles.muted, { marginBottom: 10 }]}>Giá do các điểm mua đã được duyệt đăng trong 7 ngày gần đây, so với giá chung trên báo.</Text>
      <LocationBar />
      {location && (
        <>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            {TYPES.map((t) => (
              <Chip key={t} label={CATEGORY_TYPE_LABELS[t]} active={t === type} onPress={() => setType(t)} />
            ))}
          </View>
          <LocalPriceList type={type} />
          <NearbyServices />
          <View style={{ marginTop: 12 }}>
            <Button label="🏪 Bạn là đại lý / thương lái? Đăng giá" variant="outline" onPress={() => router.push('/buyer')} />
          </View>
        </>
      )}
    </ScrollView>
  );
}
