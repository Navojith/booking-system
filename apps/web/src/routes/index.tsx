import { createFileRoute, redirect } from '@tanstack/react-router';
import { store } from '@/app/store';
import { ensureSession } from '@/features/auth/session';
import { homePath } from '@/lib/permissions';

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    await ensureSession();
    const { user } = store.getState().auth;
    throw redirect({ to: user ? homePath(user.role) : '/login' });
  },
});
