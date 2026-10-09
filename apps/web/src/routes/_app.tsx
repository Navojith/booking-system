import { createFileRoute, Link, Outlet, redirect, useNavigate } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';
import { useAppSelector } from '@/app/hooks';
import { store } from '@/app/store';
import { Button } from '@/components/ui';
import { ensureSession, logout } from '@/features/auth/session';
import { can, ROLE_LABEL } from '@/lib/permissions';

export const Route = createFileRoute('/_app')({
  beforeLoad: async () => {
    await ensureSession();
    const { user } = store.getState().auth;
    if (!user) throw redirect({ to: '/login' });
    if (user.mustChangePassword) throw redirect({ to: '/change-password' });
  },
  component: AppLayout,
});

const NAV_LINK =
  'rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 ' +
  '[&.active]:bg-indigo-50 [&.active]:text-indigo-700';

function AppLayout() {
  const user = useAppSelector((s) => s.auth.user);
  const navigate = useNavigate();
  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <span className="font-semibold text-slate-900">Kenora Workshops</span>
          <nav className="flex flex-1 gap-1" aria-label="Main">
            {can.viewWorkshops(user.role) && (
              <Link to="/workshops" className={NAV_LINK}>
                Workshops
              </Link>
            )}
            {can.manageUsers(user.role) && (
              <Link to="/users" className={NAV_LINK}>
                Users
              </Link>
            )}
            <Link to="/activity" className={NAV_LINK}>
              Activity
            </Link>
          </nav>
          <div className="text-right text-sm leading-tight">
            <div className="font-medium text-slate-900">{user.fullName}</div>
            <div className="text-slate-500">{ROLE_LABEL[user.role]}</div>
          </div>
          <Button
            variant="ghost"
            aria-label="Sign out"
            onClick={async () => {
              await logout();
              await navigate({ to: '/login' });
            }}
          >
            <LogOut size={16} /> Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
