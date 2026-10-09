import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/api/http';
import type { AuditFilters, AuditLog, Paginated } from '@/api/types';

export function useAuditLogs(filters: AuditFilters) {
  return useQuery({
    queryKey: ['audit-logs', filters] as const,
    queryFn: () => api.get<Paginated<AuditLog>>('/audit-logs', { ...filters }),
    placeholderData: keepPreviousData,
  });
}
