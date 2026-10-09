import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/http';
import type { Paginated, Role, User } from '@/api/types';

export interface UserFilters {
  search?: string;
  role?: Role;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export const userKeys = {
  all: ['users'] as const,
  list: (filters: UserFilters) => [...userKeys.all, 'list', filters] as const,
};

export function useUsers(filters: UserFilters) {
  return useQuery({
    queryKey: userKeys.list(filters),
    queryFn: () => api.get<Paginated<User>>('/users', { ...filters }),
    placeholderData: keepPreviousData,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; fullName: string; role: Role; password: string }) =>
      api.post<User>('/users', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useUpdateUser(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { fullName?: string; role?: Role; isActive?: boolean }) =>
      api.patch<User>(`/users/${id}`, body),
    onSettled: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useResetPassword(id: string) {
  return useMutation({
    mutationFn: (newPassword: string) => api.post<undefined>(`/users/${id}/reset-password`, { newPassword }),
  });
}
