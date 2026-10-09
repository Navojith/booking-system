import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/http';
import type {
  Location,
  Paginated,
  Registration,
  RegistrationStatus,
  Workshop,
  WorkshopFilters,
} from '@/api/types';

export const workshopKeys = {
  all: ['workshops'] as const,
  list: (filters: WorkshopFilters) => [...workshopKeys.all, 'list', filters] as const,
  detail: (id: string) => [...workshopKeys.all, 'detail', id] as const,
};

export const locationKeys = { all: ['locations'] as const };

/** Seat counts change as others register, so lists also poll while visible. */
export function useWorkshops(filters: WorkshopFilters) {
  return useQuery({
    queryKey: workshopKeys.list(filters),
    queryFn: () => api.get<Paginated<Workshop>>('/workshops', { ...filters }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
}

export function useLocations() {
  return useQuery({
    queryKey: locationKeys.all,
    queryFn: () => api.get<Location[]>('/locations'),
    staleTime: 5 * 60_000,
  });
}

export const registrationKeys = {
  all: ['registrations'] as const,
  roster: (workshopId: string, status: RegistrationStatus | undefined, page: number) =>
    [...registrationKeys.all, workshopId, status ?? 'all', page] as const,
};

export function useWorkshop(id: string) {
  return useQuery({
    queryKey: workshopKeys.detail(id),
    queryFn: () => api.get<Workshop>(`/workshops/${id}`),
    refetchInterval: 30_000,
  });
}

export function useRoster(workshopId: string, status: RegistrationStatus | undefined, page: number) {
  return useQuery({
    queryKey: registrationKeys.roster(workshopId, status, page),
    queryFn: () =>
      api.get<Paginated<Registration>>(`/workshops/${workshopId}/registrations`, {
        status,
        page,
        pageSize: 20,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
}

/** Seat counts live on the workshop, so every registration change refreshes both caches. */
function useRefreshAfterChange() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: workshopKeys.all }),
      qc.invalidateQueries({ queryKey: registrationKeys.all }),
    ]);
}

export function useRegisterAttendee(workshopId: string) {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: (body: { attendeeName: string; attendeeEmail: string; joinWaitlist?: boolean }) =>
      api.post<Registration>(`/workshops/${workshopId}/registrations`, body),
    // Also on failure: a 409 means our seat count was stale.
    onSettled: refresh,
  });
}

export interface WorkshopInput {
  code?: string;
  title: string;
  description?: string;
  instructor: string;
  locationId: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  status?: 'DRAFT' | 'SCHEDULED' | 'COMPLETED';
}

export function useCreateWorkshop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: WorkshopInput) => api.post<Workshop>('/workshops', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: workshopKeys.all }),
  });
}

/** Sends the loaded version as If-Match so a concurrent edit yields 412 instead of a silent overwrite. */
export function useUpdateWorkshop(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ version, ...body }: Partial<Omit<WorkshopInput, 'code'>> & { version: number }) =>
      api.patch<Workshop>(`/workshops/${id}`, body, { headers: { 'If-Match': `W/"${version}"` } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: workshopKeys.all }),
  });
}

export function useCancelWorkshop(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (version: number) =>
      api.post<Workshop>(`/workshops/${id}/cancel`, undefined, {
        headers: { 'If-Match': `W/"${version}"` },
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: workshopKeys.all }),
  });
}

export function useCancelRegistration() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.post<Registration>(`/registrations/${id}/cancel`, { reason }),
    onSettled: refresh,
  });
}
