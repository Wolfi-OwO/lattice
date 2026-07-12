import useSWR from 'swr';
import { api } from '../lib/api.js';

/**
 * SWR handles caching, revalidation and the loading/error states, so pages
 * stay declarative. `mutate` re-fetches after a write.
 */
export function useUsers({ page = 1, limit = 20 } = {}) {
  const { data, error, isLoading, mutate } = useSWR(
    `/users?page=${page}&limit=${limit}`,
    api.get,
  );

  return {
    users: data?.items ?? [],
    total: data?.total ?? 0,
    pages: data?.pages ?? 0,
    isLoading,
    error,
    refresh: mutate,
  };
}
