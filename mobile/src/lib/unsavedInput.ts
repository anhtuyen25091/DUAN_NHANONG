/**
 * Ô nhập đang có chữ người dùng gõ dở (components/AppText.tsx ghi vào đây).
 * Đổi sáng / tối phải dựng lại các màn hình (xem app/_layout.tsx), làm mất chữ đang nhập:
 * còn ô nhập dở thì giữ bảng màu cũ, rời form (ô nhập bị gỡ) hoặc xóa hết chữ mới đổi.
 */
const edited = new Set<object>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/** Ô `input` vừa gõ: còn chữ thì tính là đang nhập dở */
export function markInput(input: object, hasText: boolean) {
  const before = edited.size;
  if (hasText) edited.add(input);
  else edited.delete(input);
  if (edited.size !== before) notify();
}

/** Ô nhập bị gỡ khỏi màn hình */
export function forgetInput(input: object) {
  if (edited.delete(input)) notify();
}

export function hasUnsavedInput(): boolean {
  return edited.size > 0;
}

export function subscribeUnsavedInput(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
