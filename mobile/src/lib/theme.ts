/** Giao diện 2026: xanh lục bảo + vàng lúa (giống bản web) */
export const colors = {
  bg: '#f3f6ef',
  surface: '#ffffff',
  /** Nền phụ trong thẻ: nút "xem thêm", ô số… */
  surface2: '#eef3ea',
  text: '#0f1f17',
  muted: '#56675c',
  border: '#e1e8de',
  primary: '#0b7a4b',
  primaryStrong: '#075c38',
  primarySoft: '#e0f3e7',
  /** Mặt hàng đang theo dõi */
  star: '#e8a10c',
  accentSoft: '#fff3d1',
  up: '#0b7a4b',
  down: '#d24a12',
  error: '#c0262d',
  band: 'rgba(11, 122, 75, 0.14)',
  /** Sổ thu chi: xanh = lời / tiền vào, đỏ cam = lỗ / tiền ra */
  gain: '#0b7a4b',
  loss: '#d24a12',
  gainSoft: '#e0f3e7',
  lossSoft: '#fdeadf',
};

/** Dải màu chuyển của đầu trang, nút chính (trái trên → phải dưới) */
export const brandGradient = ['#075c38', '#0b7a4b', '#19a06a'] as const;

/** Chữ to cho người lớn tuổi dễ đọc */
export const font = { small: 14, body: 17, title: 22 };

export const radius = { card: 20, control: 14 };

/** Đổ bóng mềm cho thẻ (Android dùng elevation) */
export const shadow = {
  shadowColor: '#0f1f17',
  shadowOpacity: 0.09,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
} as const;

/** Bóng ánh xanh dưới nút chính */
export const primaryShadow = {
  shadowColor: '#0b7a4b',
  shadowOpacity: 0.35,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 5 },
  elevation: 4,
} as const;
