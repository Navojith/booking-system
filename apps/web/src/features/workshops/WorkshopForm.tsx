import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Workshop } from '@/api/types';
import { Button, Field, Input, Select } from '@/components/ui';
import { useLocations, type WorkshopInput } from '@/features/workshops/queries';
import { errorMessage } from '@/lib/errors';

const schema = z
  .object({
    code: z.string().trim().max(30),
    title: z.string().trim().min(1, 'Enter a title').max(150),
    description: z.string().trim().max(2000),
    instructor: z.string().trim().min(1, 'Enter the instructor’s name').max(100),
    locationId: z.string().min(1, 'Choose a location'),
    startsAt: z.string().min(1, 'Choose a start time'),
    endsAt: z.string().min(1, 'Choose an end time'),
    capacity: z
      .number({ error: 'Enter the number of seats' })
      .int()
      .min(1, 'At least 1 seat')
      .max(1000, 'At most 1000 seats'),
    publish: z.boolean(),
  })
  .refine((v) => !v.startsAt || !v.endsAt || new Date(v.endsAt) > new Date(v.startsAt), {
    path: ['endsAt'],
    message: 'The end time must be after the start time',
  });
type Values = z.infer<typeof schema>;

/** ISO instant -> value for <input type="datetime-local"> in the browser's zone. */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function WorkshopForm({
  workshop,
  onSubmit,
  onCancel,
}: {
  /** Present when editing. */
  workshop?: Workshop;
  onSubmit: (input: WorkshopInput) => Promise<void>;
  onCancel: () => void;
}) {
  const locations = useLocations();
  const [formError, setFormError] = useState<string | null>(null);
  const editing = !!workshop;
  const isDraft = !workshop || workshop.status === 'DRAFT';
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: workshop?.code ?? '',
      title: workshop?.title ?? '',
      description: workshop?.description ?? '',
      instructor: workshop?.instructor ?? '',
      locationId: workshop?.location.id ?? '',
      startsAt: workshop ? toLocalInput(workshop.startsAt) : '',
      endsAt: workshop ? toLocalInput(workshop.endsAt) : '',
      capacity: workshop?.capacity ?? 12,
      publish: workshop ? workshop.status !== 'DRAFT' : true,
    },
  });

  const submit = handleSubmit(async (v) => {
    setFormError(null);
    if (!editing && !v.code) {
      setFormError('Enter a workshop code, e.g. POT-2026-014.');
      return;
    }
    const input: WorkshopInput = {
      title: v.title,
      description: v.description,
      instructor: v.instructor,
      locationId: v.locationId,
      startsAt: new Date(v.startsAt).toISOString(),
      endsAt: new Date(v.endsAt).toISOString(),
      capacity: v.capacity,
    };
    if (!editing) {
      input.code = v.code;
      input.status = v.publish ? 'SCHEDULED' : 'DRAFT';
    } else if (isDraft && v.publish) {
      input.status = 'SCHEDULED';
    }
    try {
      await onSubmit(input);
    } catch (err) {
      setFormError(errorMessage(err));
    }
  });

  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-5 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
    >
      {formError && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Workshop code" error={errors.code?.message}>
          <Input
            placeholder="POT-2026-014"
            disabled={editing}
            title={editing ? 'The code can’t be changed' : undefined}
            {...register('code')}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Title" error={errors.title?.message}>
            <Input {...register('title')} />
          </Field>
        </div>
      </div>
      <Field label="Description (optional)" error={errors.description?.message}>
        <textarea
          rows={3}
          className="block w-full rounded-md border-0 px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-indigo-600 focus:outline-none"
          {...register('description')}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Instructor" error={errors.instructor?.message}>
          <Input {...register('instructor')} />
        </Field>
        <Field label="Location" error={errors.locationId?.message}>
          <Select {...register('locationId')}>
            <option value="">Choose a location…</option>
            {locations.data?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Starts" error={errors.startsAt?.message}>
          <Input type="datetime-local" {...register('startsAt')} />
        </Field>
        <Field label="Ends" error={errors.endsAt?.message}>
          <Input type="datetime-local" {...register('endsAt')} />
        </Field>
        <Field label="Seats (capacity)" error={errors.capacity?.message}>
          <Input type="number" min={1} {...register('capacity', { valueAsNumber: true })} />
        </Field>
      </div>
      {isDraft && (
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5" {...register('publish')} />
          <span>
            Open for registration
            <span className="block text-slate-500">
              Untick to save as a draft that nobody can register for yet.
            </span>
          </span>
        </label>
      )}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : editing ? 'Save changes' : 'Create workshop'}
        </Button>
      </div>
    </form>
  );
}
