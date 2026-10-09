import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { api } from '@/api/http';
import { store } from '@/app/store';
import { Button, Field, Input } from '@/components/ui';
import { ensureSession, logout } from '@/features/auth/session';
import { errorMessage } from '@/lib/errors';
import { homePath } from '@/lib/permissions';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your temporary password'),
    newPassword: z.string().min(8, 'Use at least 8 characters').max(128),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'Choose a password different from the temporary one',
  });
type Values = z.infer<typeof schema>;

export const Route = createFileRoute('/change-password')({
  beforeLoad: async () => {
    await ensureSession();
    const { user } = store.getState().auth;
    if (!user) throw redirect({ to: '/login' });
    if (!user.mustChangePassword) throw redirect({ to: homePath(user.role) });
  },
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setFormError(null);
    try {
      await api.patch('/auth/me/password', { currentPassword, newPassword });
    } catch (err) {
      setFormError(errorMessage(err));
      return;
    }
    // The server ends every session on a password change, so sign in again.
    await logout();
    toast.success('Password changed. Please sign in with your new password.');
    await navigate({ to: '/login' });
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={onSubmit}
        noValidate
        className="w-full max-w-sm space-y-5 rounded-xl bg-white p-8 shadow-sm ring-1 ring-slate-200"
      >
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Choose a new password</h1>
          <p className="mt-1 text-sm text-slate-500">
            You signed in with a temporary password. Set your own to continue.
          </p>
        </div>
        {formError && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        )}
        <Field label="Temporary password" error={errors.currentPassword?.message}>
          <Input type="password" autoComplete="current-password" autoFocus {...register('currentPassword')} />
        </Field>
        <Field label="New password" error={errors.newPassword?.message}>
          <Input type="password" autoComplete="new-password" {...register('newPassword')} />
        </Field>
        <Field label="Confirm new password" error={errors.confirmPassword?.message}>
          <Input type="password" autoComplete="new-password" {...register('confirmPassword')} />
        </Field>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Change password'}
        </Button>
        <button
          type="button"
          className="w-full text-center text-sm text-slate-500 hover:underline"
          onClick={async () => {
            await logout();
            await navigate({ to: '/login' });
          }}
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
