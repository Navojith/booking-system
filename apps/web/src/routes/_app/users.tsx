import { createFileRoute, redirect } from '@tanstack/react-router';
import { store } from '@/app/store';
import { can, homePath } from '@/lib/permissions';

export const Route = createFileRoute('/_app/users')({
  beforeLoad: () => {
    const user = store.getState().auth.user;
    if (!user || !can.manageUsers(user.role)) {
      throw redirect({ to: user ? homePath(user.role) : '/login' });
    }
  },
  component: () => <h1 className="text-xl font-semibold text-slate-900">Users</h1>,
});
