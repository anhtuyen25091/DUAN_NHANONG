import { createContext, useContext, useEffect, useState, type ComponentProps } from 'react';
import { StyleSheet, Text as RNText, TextInput as RNTextInput, type StyleProp, type TextStyle } from 'react-native';
import { colors, currentScheme, fontFamilyFor } from '../lib/theme';
import { forgetInput, markInput } from '../lib/unsavedInput';

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

/** Ghi lại ô đang có chữ gõ dở để đổi sáng / tối không làm mất chữ (lib/unsavedInput.ts) */
export function TextInput(props: ComponentProps<typeof RNTextInput>) {
  const [token] = useState(() => ({}));
  const { onChangeText, value } = props;
  useEffect(() => () => forgetInput(token), [token]);
  // Form tự xóa chữ (VD sau khi lưu): không còn nhập dở
  useEffect(() => {
    if (value === '') markInput(token, false);
  }, [token, value]);
  return (
    <RNTextInput
      placeholderTextColor={colors.muted}
      keyboardAppearance={currentScheme()}
      selectionColor={colors.primary}
      {...props}
      onChangeText={(text) => {
        markInput(token, text !== '');
        onChangeText?.(text);
      }}
      style={textStyle(props.style, false)}
    />
  );
}
