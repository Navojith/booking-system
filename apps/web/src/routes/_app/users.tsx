import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { KeyRound, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import type { Role, User } from '@/api/types';
import { useAppSelector } from '@/app/hooks';
import { store } from '@/app/store';
import { Button, cn, Dialog, Field, Input, Select } from '@/components/ui';
import {
  useCreateUser,
  useResetPassword,
  useUpdateUser,
  useUsers,
  type UserFilters,
} from '@/features/users/queries';
import { errorMessage } from '@/lib/errors';
import { can, homePath, ROLE_LABEL } from '@/lib/permissions';

export const Route = createFileRoute('/_app/users')({
  beforeLoad: () => {
    const user = store.getState().auth.user;
    if (!user || !can.manageUsers(user.role)) {
      throw redirect({ to: user ? homePath(user.role) : '/login' });
    }
  },
  component: UsersPage,
});

const ROLES = Object.keys(ROLE_LABEL) as Role[];
const PAGE_SIZE = 15;

function UsersPage() {
  const me = useAppSelector((s) => s.auth.user);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [active, setActive] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);

  const filters: UserFilters = {
    search: search || undefined,
    role: role || undefined,
    isActive: active === '' ? undefined : active === 'true',
    page,
    pageSize: PAGE_SIZE,
  };
  const { data, isPending, isError, refetch } = useUsers(filters);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const commitSearch = () => {
    const next = q.trim();
    if (next !== search) {
      setSearch(next);
      setPage(1);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Users</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} /> New user
        </Button>
      </div>

      <div className="grid gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Search</span>
          <Input
            type="search"
            placeholder="Name or email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={commitSearch}
            onKeyDown={(e) => e.key === 'Enter' && commitSearch()}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Role</span>
          <Select
            value={role}
            onChange={(e) => {
              setRole(e.target.value as Role | '');
              setPage(1);
            }}
          >
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Account</span>
          <Select
            value={active}
            onChange={(e) => {
              setActive(e.target.value as '' | 'true' | 'false');
              setPage(1);
            }}
          >
            <option value="">Active and deactivated</option>
            <option value="true">Active only</option>
            <option value="false">Deactivated only</option>
          </Select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Account</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">
                    {u.fullName}
                    {u.id === me?.id && <span className="ml-2 text-xs text-slate-500">(you)</span>}
                  </div>
                  <div className="text-slate-500">{u.email}</div>
                </td>
                <td className="px-4 py-3 text-slate-700">{ROLE_LABEL[u.role]}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-block rounded-full px-2.5 py-0.5 text-xs font-medium',
                      u.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600',
                    )}
                  >
                    {u.isActive ? 'Active' : 'Deactivated'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" aria-label={`Edit ${u.fullName}`} onClick={() => setEditing(u)}>
                      <Pencil size={14} /> Edit
                    </Button>
                    <Button
                      variant="secondary"
                      aria-label={`Reset password for ${u.fullName}`}
                      onClick={() => setResetting(u)}
                    >
                      <KeyRound size={14} /> Reset password
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {isPending && <p className="p-8 text-center text-slate-500">Loading users…</p>}
        {isError && (
          <div className="p-8 text-center">
            <p className="text-red-600">We couldn’t load the users.</p>
            <Button variant="secondary" className="mt-3" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        )}
        {data?.items.length === 0 && (
          <p className="p-8 text-center text-slate-500">No users match these filters.</p>
        )}
      </div>

      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            {data.total} user{data.total === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span>
              Page {page} of {totalPages}
            </span>
            <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      <CreateUserDialog open={creating} onClose={() => setCreating(false)} />
      <EditUserDialog user={editing} isSelf={editing?.id === me?.id} onClose={() => setEditing(null)} />
      <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />
    </div>
  );
}

const passwordRule = z.string().min(8, 'Use at least 8 characters').max(128);

const createSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter a name').max(100),
  email: z.email('Enter a valid email address'),
  role: z.enum(['ADMIN', 'MANAGER', 'STAFF']),
  password: passwordRule,
});
type CreateValues = z.infer<typeof createSchema>;

function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateUser();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { role: 'STAFF' },
  });

  const close = () => {
    reset();
    setFormError(null);
    onClose();
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await create.mutateAsync(values);
      toast.success(`${values.fullName} can now sign in.`);
      close();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  });

  return (
    <Dialog open={open} onClose={close} title="New user">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        )}
        <Field label="Full name" error={errors.fullName?.message}>
          <Input autoFocus autoComplete="off" {...register('fullName')} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" autoComplete="off" {...register('email')} />
        </Field>
        <Field label="Role" error={errors.role?.message}>
          <Select {...register('role')}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Temporary password" error={errors.password?.message}>
          <Input type="text" autoComplete="off" {...register('password')} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create user'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const editSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter a name').max(100),
  role: z.enum(['ADMIN', 'MANAGER', 'STAFF']),
  isActive: z.boolean(),
});
type EditValues = z.infer<typeof editSchema>;

function EditUserDialog({
  user,
  isSelf,
  onClose,
}: {
  user: User | null;
  isSelf: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={user !== null} onClose={onClose} title="Edit user">
      {user && <EditUserForm user={user} isSelf={isSelf} onClose={onClose} />}
    </Dialog>
  );
}

function EditUserForm({
  user,
  isSelf,
  onClose,
}: {
  user: User;
  isSelf: boolean;
  onClose: () => void;
}) {
  const update = useUpdateUser(user.id);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { fullName: user.fullName, role: user.role, isActive: user.isActive },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    // Only send what changed, and never role/active for yourself (the API refuses it anyway).
    const body: Partial<EditValues> = {};
    if (values.fullName !== user.fullName) body.fullName = values.fullName;
    if (!isSelf && values.role !== user.role) body.role = values.role;
    if (!isSelf && values.isActive !== user.isActive) body.isActive = values.isActive;
    if (Object.keys(body).length === 0) return onClose();
    try {
      await update.mutateAsync(body);
      toast.success(`${values.fullName} updated.`);
      onClose();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <p className="text-sm text-slate-500">{user.email}</p>
      {formError && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}
      <Field label="Full name" error={errors.fullName?.message}>
        <Input autoFocus autoComplete="off" {...register('fullName')} />
      </Field>
      <Field label="Role">
        <Select disabled={isSelf} {...register('role')}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>
      </Field>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" className="mt-0.5" disabled={isSelf} {...register('isActive')} />
        <span>
          Account is active
          <span className="block text-slate-500">
            {isSelf
              ? 'You can’t change your own role or deactivate yourself.'
              : 'Untick to stop this person signing in. Their history is kept.'}
          </span>
        </span>
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}

const resetSchema = z.object({ newPassword: passwordRule });
type ResetValues = z.infer<typeof resetSchema>;

function ResetPasswordDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  return (
    <Dialog open={user !== null} onClose={onClose} title="Reset password">
      {user && <ResetPasswordForm user={user} onClose={onClose} />}
    </Dialog>
  );
}

function ResetPasswordForm({ user, onClose }: { user: User; onClose: () => void }) {
  const reset = useResetPassword(user.id);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetValues>({ resolver: zodResolver(resetSchema) });

  const onSubmit = handleSubmit(async ({ newPassword }) => {
    setFormError(null);
    try {
      await reset.mutateAsync(newPassword);
      toast.success(`Password reset. ${user.fullName} is signed out everywhere.`);
      onClose();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <p className="text-sm text-slate-600">
        Choose a new password for {user.fullName} ({user.email}) and share it with them.
      </p>
      {formError && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}
      <Field label="New password" error={errors.newPassword?.message}>
        <Input type="text" autoFocus autoComplete="off" {...register('newPassword')} />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={reset.isPending}>
          {reset.isPending ? 'Resetting…' : 'Reset password'}
        </Button>
      </div>
    </form>
  );
}
