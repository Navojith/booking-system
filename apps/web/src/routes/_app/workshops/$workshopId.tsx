import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { ArrowLeft, Ban, Pencil, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ApiError } from '@/api/http';
import type { Registration, RegistrationStatus, Workshop } from '@/api/types';
import { store } from '@/app/store';
import { useAppSelector } from '@/app/hooks';
import { Button, cn, Dialog, Field, Input, SeatMeter, StatusBadge } from '@/components/ui';
import {
  useCancelRegistration,
  useCancelWorkshop,
  useRegisterAttendee,
  useRoster,
  useWorkshop,
} from '@/features/workshops/queries';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { can, homePath } from '@/lib/permissions';

export const Route = createFileRoute('/_app/workshops/$workshopId')({
  beforeLoad: () => {
    const user = store.getState().auth.user;
    if (user && !can.viewWorkshops(user.role)) throw redirect({ to: homePath(user.role) });
  },
  component: WorkshopDetailPage,
});

type Tab = 'ACTIVE' | 'CANCELLED' | 'ALL';
const TABS: { id: Tab; label: string }[] = [
  { id: 'ACTIVE', label: 'Registered' },
  { id: 'CANCELLED', label: 'Cancelled' },
  { id: 'ALL', label: 'All history' },
];

/** Why registering is unavailable right now, or null when it is open. */
function closedReason(w: Workshop): string | null {
  if (w.status !== 'SCHEDULED') {
    return w.status === 'DRAFT'
      ? 'This workshop is still a draft, so it is not open for registration.'
      : `This workshop is ${w.status.toLowerCase()}, so registration is closed.`;
  }
  if (new Date(w.startsAt) <= new Date()) return 'This workshop has already started.';
  if (w.seatsAvailable <= 0) return 'This workshop is full.';
  return null;
}

function WorkshopDetailPage() {
  const { workshopId } = Route.useParams();
  const user = useAppSelector((s) => s.auth.user);
  const { data: workshop, isPending, error, refetch } = useWorkshop(workshopId);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (isPending) return <p className="text-slate-500">Loading workshop…</p>;
  if (error || !workshop) {
    const notFound = error instanceof ApiError && (error.status === 404 || error.status === 400);
    return (
      <div className="space-y-3">
        <BackLink />
        <p className="text-red-600">
          {notFound ? 'We couldn’t find that workshop.' : 'We couldn’t load this workshop.'}
        </p>
        {!notFound && (
          <Button variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        )}
      </div>
    );
  }

  const reason = closedReason(workshop);
  const canRegister = !!user && can.register(user.role);
  const canEdit = !!user && can.editWorkshops(user.role);
  const editable = workshop.status === 'DRAFT' || workshop.status === 'SCHEDULED';

  return (
    <div className="space-y-6">
      <BackLink />

      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-slate-900">{workshop.title}</h1>
              <StatusBadge status={workshop.status} />
            </div>
            <p className="mt-1 text-sm text-slate-500">{workshop.code}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold text-slate-900">
              {workshop.seatsAvailable}
              <span className="text-base font-normal text-slate-500"> of {workshop.capacity} seats left</span>
            </p>
            <div className="mt-2 ml-auto w-48">
              <SeatMeter taken={workshop.seatsTaken} capacity={workshop.capacity} />
            </div>
          </div>
        </div>

        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
          <Info label="Starts">{formatDateTime(workshop.startsAt)}</Info>
          <Info label="Ends">{formatDateTime(workshop.endsAt)}</Info>
          <Info label="Instructor">{workshop.instructor}</Info>
          <Info label="Location">
            {workshop.location.name}
            <span className="block text-slate-500">{workshop.location.address}</span>
          </Info>
          {workshop.description && (
            <div className="sm:col-span-2">
              <Info label="About">{workshop.description}</Info>
            </div>
          )}
        </dl>

        {canRegister && (
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-6">
            <Button disabled={reason !== null} onClick={() => setRegisterOpen(true)}>
              <UserPlus size={16} /> Register attendee
            </Button>
            {canEdit && editable && (
              <>
                <Link
                  to="/workshops/$workshopId/edit"
                  params={{ workshopId: workshop.id }}
                  className="inline-flex items-center gap-2 rounded-md bg-white px-3.5 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
                >
                  <Pencil size={16} /> Edit
                </Link>
                <Button variant="secondary" onClick={() => setCancelOpen(true)}>
                  <Ban size={16} /> Cancel workshop
                </Button>
              </>
            )}
            {reason && <p className="text-sm text-slate-500">{reason}</p>}
          </div>
        )}
      </section>

      <Roster workshopId={workshop.id} canCancel={canRegister} />

      <CancelWorkshopDialog
        workshop={workshop}
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
      />

      <RegisterDialog
        workshop={workshop}
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
      />
    </div>
  );
}

function CancelWorkshopDialog({
  workshop,
  open,
  onClose,
}: {
  workshop: Workshop;
  open: boolean;
  onClose: () => void;
}) {
  const cancel = useCancelWorkshop(workshop.id);
  const [formError, setFormError] = useState<string | null>(null);

  const close = () => {
    setFormError(null);
    onClose();
  };

  const confirm = async () => {
    setFormError(null);
    try {
      await cancel.mutateAsync(workshop.version);
      toast.success(`${workshop.title} has been cancelled.`);
      close();
    } catch (err) {
      setFormError(
        err instanceof ApiError && err.code === 'STALE_VERSION'
          ? 'Someone else just changed this workshop. The latest details are loaded; try again.'
          : errorMessage(err),
      );
    }
  };

  return (
    <Dialog open={open} onClose={close} title="Cancel this workshop?">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          {workshop.title} will be marked as cancelled and nobody can register for it any more.
          Existing registrations stay on record so you can contact those attendees
          {workshop.seatsTaken > 0 ? ` (${workshop.seatsTaken} registered)` : ''}.
        </p>
        {formError && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={close}>
            Keep workshop
          </Button>
          <Button
            className="bg-red-600 hover:bg-red-700 disabled:bg-red-300"
            disabled={cancel.isPending}
            onClick={() => void confirm()}
          >
            {cancel.isPending ? 'Cancelling…' : 'Cancel workshop'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function BackLink() {
  return (
    <Link
      to="/workshops"
      className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline"
    >
      <ArrowLeft size={14} /> All workshops
    </Link>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-900">{children}</dd>
    </div>
  );
}

const registerSchema = z.object({
  attendeeName: z.string().trim().min(1, 'Enter the attendee’s name').max(100),
  attendeeEmail: z.email('Enter a valid email address').max(254),
});
type RegisterValues = z.infer<typeof registerSchema>;

function RegisterDialog({
  workshop,
  open,
  onClose,
}: {
  workshop: Workshop;
  open: boolean;
  onClose: () => void;
}) {
  const register = useRegisterAttendee(workshop.id);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register: field,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  const close = () => {
    reset();
    setFormError(null);
    onClose();
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await register.mutateAsync(values);
      toast.success(`${values.attendeeName} is registered for ${workshop.title}.`);
      close();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'WORKSHOP_FULL') {
        toast.error(errorMessage(err));
        close();
      } else {
        setFormError(errorMessage(err));
      }
    }
  });

  return (
    <Dialog open={open} onClose={close} title="Register an attendee">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <p className="text-sm text-slate-500">
          {workshop.title} · {workshop.seatsAvailable} seat{workshop.seatsAvailable === 1 ? '' : 's'} left
        </p>
        {formError && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        )}
        <Field label="Attendee name" error={errors.attendeeName?.message}>
          <Input autoFocus autoComplete="off" {...field('attendeeName')} />
        </Field>
        <Field label="Attendee email" error={errors.attendeeEmail?.message}>
          <Input type="email" autoComplete="off" {...field('attendeeEmail')} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={register.isPending}>
            {register.isPending ? 'Registering…' : 'Register'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Roster({ workshopId, canCancel }: { workshopId: string; canCancel: boolean }) {
  const [tab, setTab] = useState<Tab>('ACTIVE');
  const [page, setPage] = useState(1);
  const [toCancel, setToCancel] = useState<Registration | null>(null);
  const status: RegistrationStatus | undefined = tab === 'ALL' ? undefined : tab;
  const { data, isPending, isError, refetch } = useRoster(workshopId, status, page);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <div role="tablist" aria-label="Registrations" className="flex gap-1 border-b border-slate-200 px-4 pt-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => {
              setTab(t.id);
              setPage(1);
            }}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
              tab === t.id
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-600 hover:text-slate-900',
            )}
          >
            {t.label}
            {tab === t.id && data ? ` (${data.total})` : ''}
          </button>
        ))}
      </div>

      {isPending && <p className="p-8 text-center text-slate-500">Loading registrations…</p>}
      {isError && (
        <div className="p-8 text-center">
          <p className="text-red-600">We couldn’t load the registrations.</p>
          <Button variant="secondary" className="mt-3" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}
      {data?.items.length === 0 && (
        <p className="p-8 text-center text-slate-500">
          {tab === 'ACTIVE'
            ? 'Nobody is registered yet.'
            : tab === 'CANCELLED'
              ? 'No registrations have been cancelled.'
              : 'No registrations yet.'}
        </p>
      )}
      {data && data.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Attendee</th>
                <th className="px-4 py-3 font-semibold">Registered</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                {canCancel && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{r.attendeeName}</div>
                    <div className="text-slate-500">{r.attendeeEmail}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatDateTime(r.registeredAt)}
                    <span className="block text-slate-500">by {r.registeredBy.fullName}</span>
                  </td>
                  <td className="px-4 py-3">
                    {r.status === 'CANCELLED' ? (
                      <div className="text-slate-700">
                        <span className="font-medium text-red-700">Cancelled</span>
                        {r.cancelledAt && ` ${formatDateTime(r.cancelledAt)}`}
                        {r.cancelledBy && (
                          <span className="block text-slate-500">by {r.cancelledBy.fullName}</span>
                        )}
                        {r.cancelReason && (
                          <span className="block text-slate-500">“{r.cancelReason}”</span>
                        )}
                      </div>
                    ) : (
                      <span className="font-medium text-emerald-700">Registered</span>
                    )}
                  </td>
                  {canCancel && (
                    <td className="px-4 py-3 text-right">
                      {r.status === 'ACTIVE' && (
                        <Button variant="secondary" onClick={() => setToCancel(r)}>
                          Cancel registration
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
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
      )}

      <CancelDialog registration={toCancel} onClose={() => setToCancel(null)} />
    </section>
  );
}

function CancelDialog({
  registration,
  onClose,
}: {
  registration: Registration | null;
  onClose: () => void;
}) {
  const cancel = useCancelRegistration();
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const close = () => {
    setReason('');
    setFormError(null);
    onClose();
  };

  const confirm = async () => {
    if (!registration) return;
    setFormError(null);
    try {
      await cancel.mutateAsync({ id: registration.id, reason: reason.trim() || undefined });
      toast.success(`Registration for ${registration.attendeeName} cancelled. The seat is free again.`);
      close();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ALREADY_CANCELLED') {
        toast.info(errorMessage(err));
        close();
      } else {
        setFormError(errorMessage(err));
      }
    }
  };

  return (
    <Dialog open={registration !== null} onClose={close} title="Cancel this registration?">
      {registration && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {registration.attendeeName} ({registration.attendeeEmail}) will lose their seat. The
            registration stays in the history.
          </p>
          {formError && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}
          <Field label="Reason (optional)">
            <Input
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Called to cancel"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={close}>
              Keep registration
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 disabled:bg-red-300"
              disabled={cancel.isPending}
              onClick={() => void confirm()}
            >
              {cancel.isPending ? 'Cancelling…' : 'Cancel registration'}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
