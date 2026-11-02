import { createContext, useContext, type ComponentProps } from 'react';
import { StyleSheet, Text as RNText, TextInput as RNTextInput, type StyleProp, type TextStyle } from 'react-native';
import { colors, currentScheme, fontFamilyFor } from '../lib/theme';

/**
 * Text / TextInput dùng chung cho cả app (thay cho bản của react-native):
 * - Phông Be Vietnam Pro: React Native không có phông mặc định toàn app, và phông tự thêm bỏ qua fontWeight
 *   trên Android → đổi fontWeight sang đúng họ phông của độ đậm đó.
 * - Màu chữ mặc định theo bảng màu (iOS mặc định chữ đen, sẽ không đọc được trên nền tối).
 * Text lồng trong Text mà không đặt fontWeight / màu thì kế thừa từ Text cha như bình thường.
 */
const InsideText = createContext(false);

function textStyle(style: StyleProp<TextStyle>, nested: boolean): StyleProp<TextStyle> {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const color = !nested && flat.color == null ? colors.text : null;
  const family = flat.fontFamily == null && (!nested || flat.fontWeight != null) ? fontFamilyFor(flat.fontWeight) : null;
  if (!color && !family) return style;
  // Màu mặc định đặt trước để style của chỗ gọi vẫn thắng; phông đặt sau để thay fontWeight
  // (mỗi độ đậm là một họ phông riêng; để nguyên fontWeight thì web / iOS tô đậm thêm lần nữa)
  return [color ? { color } : null, style, family ? { fontFamily: family, fontWeight: 'normal' } : null];
}

export function Text(props: ComponentProps<typeof RNText>) {
  const nested = useContext(InsideText);
  const text = <RNText {...props} style={textStyle(props.style, nested)} />;
  return nested ? text : <InsideText.Provider value>{text}</InsideText.Provider>;
}

export function TextInput(props: ComponentProps<typeof RNTextInput>) {
  return (
    <RNTextInput
      placeholderTextColor={colors.muted}
      keyboardAppearance={currentScheme()}
      selectionColor={colors.primary}
      {...props}
      style={textStyle(props.style, false)}
    />
  );
}
