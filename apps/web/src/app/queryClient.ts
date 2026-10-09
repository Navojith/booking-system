import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/http';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      // Never retry client errors (403/404/409...); only transient failures.
      retry: (count, err) =>
        !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});
