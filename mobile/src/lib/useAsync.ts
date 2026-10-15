import { useCallback, useEffect, useState } from 'react';

export type AsyncState<T> = { status: 'loading' } | { status: 'error'; error: Error } | { status: 'ok'; data: T };

/** Gọi hàm async mỗi khi deps đổi; trả thêm reload() cho kéo-để-tải-lại. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    load().then(
      (data) => active && setState({ status: 'ok', data }),
      (error: Error) => active && setState((prev) => (prev.status === 'ok' ? prev : { status: 'error', error })),
    ).finally(() => active && setRefreshing(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const reload = useCallback(() => {
    setRefreshing(true);
    setAttempt((n) => n + 1);
  }, []);

  /** Tải lại ngầm, không hiện vòng xoay */
  const refetch = useCallback(() => setAttempt((n) => n + 1), []);

  return { state, reload, refetch, refreshing };
}
