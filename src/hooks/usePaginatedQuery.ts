import { useState, useCallback } from 'react';

interface PaginatedState<T> {
  items: T[];
  nextPageToken?: string;
  hasMore: boolean;
  isLoadingMore: boolean;
  totalLoaded: number;
}

interface PaginatedResult<T> extends PaginatedState<T> {
  loadMore: () => Promise<void>;
  reset: () => void;
  setItems: React.Dispatch<React.SetStateAction<T[]>>;
}

const initialState = <T,>(): PaginatedState<T> => ({
  items: [],
  nextPageToken: undefined,
  hasMore: false,
  isLoadingMore: false,
  totalLoaded: 0,
});

export function usePaginatedQuery<T>(
  fetchFn: (pageToken?: string) => Promise<{ items: T[]; nextPageToken?: string }>,
): PaginatedResult<T> {
  const [state, setState] = useState<PaginatedState<T>>(initialState);

  const loadMore = useCallback(async () => {
    setState(s => ({ ...s, isLoadingMore: true }));
    try {
      const result = await fetchFn(state.nextPageToken);
      setState(s => ({
        items: [...s.items, ...result.items],
        nextPageToken: result.nextPageToken,
        hasMore: !!result.nextPageToken,
        isLoadingMore: false,
        totalLoaded: s.totalLoaded + result.items.length,
      }));
    } catch {
      setState(s => ({ ...s, isLoadingMore: false }));
    }
  }, [fetchFn, state.nextPageToken]);

  const reset = useCallback(() => {
    setState(initialState());
  }, []);

  const setItems: React.Dispatch<React.SetStateAction<T[]>> = useCallback((updater) => {
    setState(s => ({
      ...s,
      items: typeof updater === 'function' ? (updater as (prev: T[]) => T[])(s.items) : updater,
    }));
  }, []);

  return { ...state, loadMore, reset, setItems };
}
