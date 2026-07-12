import useSWR from 'swr';
import { api } from '@/lib/api';
import type { Paginated, User } from '@/types/user';

interface UseUsersOptions {
  page?: number;
  limit?: number;
}

/**
 * SWR handles caching, revalidation and loading/error state, so pages stay
 * declarative. The generic on api.get is what types `data` end to end.
 */
export function useUsers({ page = 1, limit = 20 }: UseUsersOptions = {}) {
  const { data, error, isLoading, mutate } = useSWR<Paginated<User>>(
    `/users?page=${page}&limit=${limit}`,
    api.get,
  );

  return {
    users: data?.items ?? [],
    total: data?.total ?? 0,
    pages: data?.pages ?? 0,
    isLoading,
    error: error as Error | undefined,
    refresh: mutate,
  };
}
