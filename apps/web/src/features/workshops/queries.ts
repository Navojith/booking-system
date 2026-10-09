import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/api/http';
import type { Location, Paginated, Workshop, WorkshopFilters } from '@/api/types';

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
