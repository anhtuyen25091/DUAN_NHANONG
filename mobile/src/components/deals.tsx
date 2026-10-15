import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { colors, font } from '../lib/theme';
import { Button, Card, styles } from './ui';

/** Chưa đăng nhập: mời đăng nhập ở màn Tài khoản (đăng nhập xong quay lại đây) */
export function DealsSignIn() {
  return (
    <View style={{ padding: 16 }}>
      <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primarySoft, gap: 10 }}>
        <Text style={{ fontSize: font.title, fontWeight: '700', color: colors.text }}>🤝 Đơn mua bán</Text>
        <Text style={styles.body}>Đơn mua bán dùng chung giữa nông dân, thương lái và chi nhánh thu mua. Cần đăng nhập để tạo đơn hoặc tham gia bằng mã.</Text>
        <Button label="Đăng nhập / Đăng ký" onPress={() => router.push({ pathname: '/account', params: { back: '1' } })} />
      </Card>
    </View>
  );
}

/** Nhãn nhỏ (mã đơn, số mục chờ…) */
export function Tag({ label, warn }: { label: string; warn?: boolean }) {
  return (
    <Text
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
        overflow: 'hidden',
        backgroundColor: warn ? colors.lossSoft : colors.primarySoft,
        color: warn ? colors.loss : colors.primary,
        fontSize: font.small,
        fontWeight: '700',
      }}
    >
      {label}
    </Text>
  );
}

/** Ô báo ở đầu trang (🔔 có mục chờ bạn xác nhận) */
export function Notice({ text }: { text: string }) {
  return (
    <View style={{ padding: 12, borderRadius: 10, backgroundColor: colors.lossSoft, marginBottom: 12 }}>
      <Text style={[styles.body, { color: colors.loss, fontWeight: '600' }]}>{text}</Text>
    </View>
  );
}
