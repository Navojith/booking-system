import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { store } from '@/app/store';
import { Button, Field, Input } from '@/components/ui';
import { ensureSession, login } from '@/features/auth/session';
import { errorMessage } from '@/lib/errors';
import { entryPath } from '@/lib/permissions';

const schema = z.object({
  email: z.email('Enter your email address'),
  password: z.string().min(1, 'Enter your password'),
});
type Values = z.infer<typeof schema>;

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    await ensureSession();
    const { user } = store.getState().auth;
    if (user) throw redirect({ to: entryPath(user) });
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setFormError(null);
    try {
      const user = await login(email, password);
      await navigate({ to: entryPath(user) });
    } catch (err) {
      setFormError(errorMessage(err));
    }
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={onSubmit}
        noValidate
        className="w-full max-w-sm space-y-5 rounded-xl bg-white p-8 shadow-sm ring-1 ring-slate-200"
      >
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Kenora Workshops</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to manage workshops and registrations.</p>
        </div>
        {formError && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        )}
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" autoComplete="username" autoFocus {...register('email')} />
        </Field>
        <Field label="Password" error={errors.password?.message}>
          <Input type="password" autoComplete="current-password" {...register('password')} />
        </Field>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </main>
  );
}
