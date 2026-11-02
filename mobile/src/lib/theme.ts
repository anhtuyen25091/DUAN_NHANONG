import { Appearance, type TextStyle } from 'react-native';

/**
 * Giao diện 2026: xanh lục bảo + vàng lúa (giống bản web), có chế độ tối theo cài đặt của máy.
 *
 * `colors`, `brandGradient`, `shadow`, `primaryShadow` là đối tượng dùng chung: khi máy đổi sáng / tối,
 * applyScheme() ghi đè giá trị tại chỗ, rồi app/_layout.tsx dựng lại các màn hình để đọc màu mới.
 * Style tính sẵn ở cấp module (ngoài component) phải bọc trong themed() để được tính lại.
 */
export type Scheme = 'light' | 'dark';

const light = {
  bg: '#f3f6ef',
  surface: '#ffffff',
  /** Nền phụ trong thẻ: nút "xem thêm", ô số… */
  surface2: '#eef3ea',
  text: '#0f1f17',
  muted: '#56675c',
  border: '#e1e8de',
  /** Viền thẻ (nhạt hơn border) */
  cardBorder: 'rgba(225, 232, 222, 0.7)',
  primary: '#0b7a4b',
  primaryStrong: '#075c38',
  primarySoft: '#e0f3e7',
  /** Chữ / dấu ✓ đặt trên nền đặc màu primary, gain, loss (chế độ tối các màu đó sáng nên chữ phải tối) */
  onPrimary: '#ffffff',
  /** Mặt hàng đang theo dõi */
  star: '#e8a10c',
  accentSoft: '#fff3d1',
  /** Chữ trên nền accentSoft (nhắc nhở, lưu ý) */
  accentText: '#7a4a00',
  /** Đang chờ (vàng đậm) */
  warn: '#ca8a04',
  /** Xanh nước: mưa, thời tiết */
  info: '#2b7bb9',
  infoSoft: '#eef6fb',
  infoBorder: '#d3e6f2',
  up: '#0b7a4b',
  down: '#d24a12',
  error: '#c0262d',
  band: 'rgba(11, 122, 75, 0.14)',
  /** Sổ thu chi: xanh = lời / tiền vào, đỏ cam = lỗ / tiền ra */
  gain: '#0b7a4b',
  loss: '#d24a12',
  gainSoft: '#e0f3e7',
  lossSoft: '#fdeadf',
  /** Lớp phủ tối sau hộp thoại */
  backdrop: 'rgba(0, 0, 0, 0.4)',
};

/** Bảng màu tối: lấy theo web/src/index.css (@media prefers-color-scheme: dark) để web và app giống nhau */
const dark: typeof light = {
  bg: '#0c1310',
  surface: '#141d18',
  surface2: '#1b2620',
  text: '#ebf2ed',
  muted: '#9fb2a6',
  border: '#2c3b32',
  cardBorder: '#25332b',
  primary: '#3ddc97',
  primaryStrong: '#7ceab8',
  primarySoft: '#113426',
  onPrimary: '#06281a',
  star: '#f5c04a',
  accentSoft: '#3a2c0b',
  accentText: '#f5c04a',
  warn: '#f5c04a',
  info: '#6cb6ec',
  infoSoft: '#10222f',
  infoBorder: '#1c3a50',
  up: '#3ddc97',
  down: '#ff8a50',
  error: '#ff7a7f',
  band: 'rgba(61, 220, 151, 0.16)',
  gain: '#3ddc97',
  loss: '#ff8a50',
  gainSoft: '#113426',
  lossSoft: '#3d1a0b',
  backdrop: 'rgba(0, 0, 0, 0.6)',
};

export const colors = { ...light };

/** Dải màu chuyển của đầu trang, nút chính (trái trên → phải dưới). Chữ trên dải này luôn trắng. */
const gradients = {
  light: ['#075c38', '#0b7a4b', '#19a06a'],
  dark: ['#06402a', '#0a6440', '#10885a'],
};
export const brandGradient: string[] = [...gradients.light];

/** Chữ to cho người lớn tuổi dễ đọc */
export const font = { small: 14, body: 17, title: 22 };

export const radius = { card: 20, control: 14 };

const shadows = {
  light: {
    shadow: { shadowColor: '#0f1f17', shadowOpacity: 0.09 },
    primary: { shadowColor: '#0b7a4b', shadowOpacity: 0.35 },
  },
  dark: {
    shadow: { shadowColor: '#000000', shadowOpacity: 0.45 },
    primary: { shadowColor: '#3ddc97', shadowOpacity: 0.22 },
  },
};

/** Đổ bóng mềm cho thẻ (Android dùng elevation) */
export const shadow = {
  shadowColor: '#0f1f17',
  shadowOpacity: 0.09,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
};

/** Bóng ánh xanh dưới nút chính */
export const primaryShadow = {
  shadowColor: '#0b7a4b',
  shadowOpacity: 0.35,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 5 },
  elevation: 4,
};

let current: Scheme = 'light';
/** Tăng mỗi lần đổi bảng màu: themed() dựa vào đây để tính lại */
let version = 0;

export function currentScheme(): Scheme {
  return current;
}

/** Đổi bảng màu tại chỗ. Gọi lại với cùng giá trị thì không làm gì. */
export function applyScheme(scheme: Scheme) {
  if (scheme === current) return;
  current = scheme;
  version++;
  Object.assign(colors, scheme === 'dark' ? dark : light);
  brandGradient.splice(0, brandGradient.length, ...gradients[scheme]);
  Object.assign(shadow, shadows[scheme].shadow);
  Object.assign(primaryShadow, shadows[scheme].primary);
}

applyScheme(Appearance.getColorScheme() === 'dark' ? 'dark' : 'light');

/**
 * Style / bảng giá trị tính ở cấp module mà dùng màu: bọc trong themed(() => ({ ... })).
 * Mỗi thuộc tính là getter đọc bản tính theo bảng màu hiện tại (tính lại sau khi đổi sáng / tối).
 */
export function themed<T extends object>(factory: () => T): T {
  let cached = factory();
  let at = version;
  const get = () => {
    if (at !== version) {
      cached = factory();
      at = version;
    }
    return cached;
  };
  const out = {} as T;
  for (const key of Object.keys(cached) as (keyof T)[]) {
    Object.defineProperty(out, key, { get: () => get()[key], enumerable: true });
  }
  return out;
}

/* ---------- Phông Be Vietnam Pro ---------- */

/**
 * Tên phông đã nạp bằng useFonts (app/_layout.tsx). Phông tự thêm bỏ qua fontWeight trên Android,
 * nên mỗi độ đậm là một họ phông riêng; components/AppText.tsx đổi fontWeight → fontFamily.
 */
export const FONT_FAMILY = {
  400: 'BeVietnamPro_400Regular',
  500: 'BeVietnamPro_500Medium',
  600: 'BeVietnamPro_600SemiBold',
  700: 'BeVietnamPro_700Bold',
  800: 'BeVietnamPro_800ExtraBold',
} as const;

let fontsReady = false;
/** Gọi khi useFonts nạp xong; nạp lỗi thì không gọi → dùng phông hệ thống */
export function setFontsReady(ready: boolean) {
  fontsReady = ready;
}

/** Họ phông cho một độ đậm; null khi chưa nạp phông (dùng phông hệ thống) */
export function fontFamilyFor(weight: TextStyle['fontWeight']): string | null {
  if (!fontsReady) return null;
  const w = weight === 'bold' ? 700 : weight === 'normal' || weight == null ? 400 : Number(weight);
  if (!(w > 0)) return FONT_FAMILY[400];
  if (w >= 800) return FONT_FAMILY[800];
  if (w >= 700) return FONT_FAMILY[700];
  if (w >= 600) return FONT_FAMILY[600];
  if (w >= 500) return FONT_FAMILY[500];
  return FONT_FAMILY[400];
}

/** Style phông cho chỗ không đi qua AppText (tiêu đề đầu trang, nhãn tab, chữ trong biểu đồ SVG) */
export function fontStyle(weight: TextStyle['fontWeight'] = '400'): Pick<TextStyle, 'fontFamily' | 'fontWeight'> {
  const family = fontFamilyFor(weight);
  return family ? { fontFamily: family, fontWeight: 'normal' } : { fontWeight: weight };
}
