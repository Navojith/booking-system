import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { store } from '@/app/store';
import { WorkshopForm } from '@/features/workshops/WorkshopForm';
import { useCreateWorkshop } from '@/features/workshops/queries';
import { can, homePath } from '@/lib/permissions';

export const Route = createFileRoute('/_app/workshops/new')({
  beforeLoad: () => {
    const user = store.getState().auth.user;
    if (!user || !can.editWorkshops(user.role)) {
      throw redirect({ to: user ? homePath(user.role) : '/login' });
    }
  },
  component: NewWorkshopPage,
});

function NewWorkshopPage() {
  const navigate = useNavigate();
  const create = useCreateWorkshop();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        to="/workshops"
        className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline"
      >
        <ArrowLeft size={14} /> All workshops
      </Link>
      <h1 className="text-xl font-semibold text-slate-900">New workshop</h1>
      <WorkshopForm
        onCancel={() => void navigate({ to: '/workshops' })}
        onSubmit={async (input) => {
          const w = await create.mutateAsync(input);
          toast.success(`${w.title} created.`);
          await navigate({ to: '/workshops/$workshopId', params: { workshopId: w.id } });
        }}
      />
    </div>
  );
}
