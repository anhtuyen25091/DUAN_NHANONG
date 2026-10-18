import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { brandGradient } from '../lib/theme';

/** Nền dải màu xanh của thương hiệu (đầu trang, nút chính); dùng react-native-svg sẵn có, không cần thêm thư viện */
export function BrandGradient({ style, radius = 0 }: { style?: StyleProp<ViewStyle>; radius?: number }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
            {brandGradient.map((c, i) => (
              <Stop key={c} offset={i / (brandGradient.length - 1)} stopColor={c} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#brand)" />
      </Svg>
    </View>
  );
}

/** headerBackground cho Stack / Tabs */
export const gradientHeader = () => <BrandGradient />;
