import { ApiError } from '@/api/http';

const MESSAGES: Record<string, string> = {
  WORKSHOP_FULL: 'Sorry, that workshop just filled up.',
  NETWORK: 'Could not reach the server. Check your connection and try again.',
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'Too many attempts. Please wait a minute and try again.';
    return MESSAGES[err.code] ?? err.errors?.join(' ') ?? err.message;
  }
  return 'Something went wrong. Please try again.';
}
