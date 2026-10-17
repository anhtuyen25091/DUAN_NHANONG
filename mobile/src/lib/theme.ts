export const colors = {
  bg: '#f3f6f1',
  surface: '#ffffff',
  text: '#17201a',
  muted: '#5f6b62',
  border: '#e2e8e0',
  primary: '#15803d',
  primarySoft: '#e3f6e8',
  /** Mặt hàng đang theo dõi */
  star: '#ca8a04',
  up: '#15803d',
  down: '#c2410c',
  error: '#b91c1c',
  band: 'rgba(21, 128, 61, 0.14)',
  /** Sổ thu chi: xanh = lời / tiền vào, đỏ cam = lỗ / tiền ra */
  gain: '#15803d',
  loss: '#c2410c',
  gainSoft: '#dcfce7',
  lossSoft: '#ffedd5',
};

/** Chữ to cho người lớn tuổi dễ đọc */
export const font = { small: 14, body: 17, title: 22 };

/** Đổ bóng nhẹ cho thẻ (Android dùng elevation) */
export const shadow = {
  shadowColor: '#14281a',
  shadowOpacity: 0.07,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
} as const;
