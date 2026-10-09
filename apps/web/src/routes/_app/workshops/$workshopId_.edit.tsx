import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError } from '@/api/http';
import { store } from '@/app/store';
import { WorkshopForm } from '@/features/workshops/WorkshopForm';
import { useUpdateWorkshop, useWorkshop } from '@/features/workshops/queries';
import { can, homePath } from '@/lib/permissions';

export const Route = createFileRoute('/_app/workshops/$workshopId_/edit')({
  beforeLoad: () => {
    const user = store.getState().auth.user;
    if (!user || !can.editWorkshops(user.role)) {
      throw redirect({ to: user ? homePath(user.role) : '/login' });
    }
  },
  component: EditWorkshopPage,
});

function EditWorkshopPage() {
  const { workshopId } = Route.useParams();
  const navigate = useNavigate();
  const { data: workshop, isPending, error, refetch } = useWorkshop(workshopId);
  const update = useUpdateWorkshop(workshopId);
  const back = () => navigate({ to: '/workshops/$workshopId', params: { workshopId } });

  if (isPending) return <p className="text-slate-500">Loading workshop…</p>;
  if (error || !workshop) return <p className="text-red-600">We couldn’t load this workshop.</p>;

  const frozen = workshop.status === 'CANCELLED' || workshop.status === 'COMPLETED';

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        to="/workshops/$workshopId"
        params={{ workshopId }}
        className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline"
      >
        <ArrowLeft size={14} /> Back to workshop
      </Link>
      <h1 className="text-xl font-semibold text-slate-900">Edit {workshop.title}</h1>
      {frozen ? (
        <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
          This workshop is {workshop.status.toLowerCase()} and can no longer be edited.
        </p>
      ) : (
        <>
          {workshop.seatsTaken > 0 && (
            <p className="text-sm text-slate-500">
              {workshop.seatsTaken} seat{workshop.seatsTaken === 1 ? ' is' : 's are'} already taken, so
              the capacity can’t go below that.
            </p>
          )}
          {/* Keyed by version so a refetch after a stale edit reloads the form with fresh values. */}
          <WorkshopForm
            key={workshop.version}
            workshop={workshop}
            onCancel={() => void back()}
            onSubmit={async (input) => {
              try {
                await update.mutateAsync({ ...input, version: workshop.version });
              } catch (err) {
                if (err instanceof ApiError && err.code === 'STALE_VERSION') {
                  await refetch();
                  toast.error(
                    'Someone else changed this workshop. The latest details are loaded; please review and save again.',
                  );
                  return;
                }
                throw err;
              }
              toast.success('Workshop updated.');
              await back();
            }}
          />
        </>
      )}
    </div>
  );
}
