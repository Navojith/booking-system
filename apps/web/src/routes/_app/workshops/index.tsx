import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import type { Workshop, WorkshopFilters, WorkshopSort, WorkshopStatus } from '@/api/types';
import { store } from '@/app/store';
import { Button, Input, Select, SeatMeter, STATUS_OPTIONS, StatusBadge } from '@/components/ui';
import { useLocations, useWorkshops } from '@/features/workshops/queries';
import { endOfDayIso, formatDateTime, startOfDayIso, toDateInput } from '@/lib/format';
import { can, homePath } from '@/lib/permissions';

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const searchSchema = z.object({
  from: ymd.optional().catch(undefined),
  to: ymd.optional().catch(undefined),
  status: z.enum(['DRAFT', 'SCHEDULED', 'CANCELLED', 'COMPLETED']).optional().catch(undefined),
  locationId: z.uuid().optional().catch(undefined),
  hasSeats: z.boolean().optional().catch(undefined),
  q: z.string().max(100).optional().catch(undefined),
  sort: z
    .enum(['startsAt:asc', 'startsAt:desc', 'title:asc', 'title:desc'])
    .optional()
    .catch(undefined),
  page: z.number().int().min(1).optional().catch(undefined),
});
type Search = z.infer<typeof searchSchema>;

const PAGE_SIZE = 15;

export const Route = createFileRoute('/_app/workshops/')({
  validateSearch: searchSchema,
  beforeLoad: () => {
    const user = store.getState().auth.user;
    if (user && !can.viewWorkshops(user.role)) throw redirect({ to: homePath(user.role) });
  },
  component: WorkshopsPage,
});

function endOfWeek(now: Date) {
  const d = new Date(now);
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); // upcoming Sunday (today if Sunday)
  return d;
}

function addDays(d: Date, days: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

const col = createColumnHelper<Workshop>();

function WorkshopsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const locations = useLocations();

  const apiFilters: WorkshopFilters = {
    from: search.from && startOfDayIso(search.from),
    to: search.to && endOfDayIso(search.to),
    status: search.status,
    locationId: search.locationId,
    hasSeats: search.hasSeats,
    q: search.q,
    sort: search.sort ?? 'startsAt:asc',
    page: search.page ?? 1,
    pageSize: PAGE_SIZE,
  };
  const { data, isPending, isError, isFetching, refetch } = useWorkshops(apiFilters);

  /** Replaces the filter set; any filter change resets to page 1. */
  const setFilters = (next: Partial<Search>, replace = false) =>
    void navigate({
      search: (prev) => ({ ...(replace ? {} : prev), ...next, page: next.page }),
    });

  const today = new Date();
  const presets: { label: string; apply: () => void; active: boolean }[] = [
    {
      label: 'This week with seats',
      apply: () =>
        setFilters(
          {
            from: toDateInput(today),
            to: toDateInput(endOfWeek(today)),
            hasSeats: true,
            status: 'SCHEDULED',
          },
          true,
        ),
      active:
        search.from === toDateInput(today) &&
        search.to === toDateInput(endOfWeek(today)) &&
        search.hasSeats === true,
    },
    {
      label: 'Today',
      apply: () => setFilters({ from: toDateInput(today), to: toDateInput(today) }, true),
      active: search.from === toDateInput(today) && search.to === toDateInput(today),
    },
    {
      label: 'Next 7 days',
      apply: () =>
        setFilters({ from: toDateInput(today), to: toDateInput(addDays(today, 7)) }, true),
      active: search.from === toDateInput(today) && search.to === toDateInput(addDays(today, 7)),
    },
  ];

  const sort = apiFilters.sort as WorkshopSort;
  const sortHeader = (label: string, field: 'startsAt' | 'title') => {
    const dir = sort.startsWith(`${field}:`) ? (sort.endsWith('asc') ? 'asc' : 'desc') : null;
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 font-semibold"
        onClick={() =>
          setFilters({
            sort: `${field}:${dir === 'asc' ? 'desc' : 'asc'}` as Search['sort'],
          })
        }
      >
        {label}
        {dir === 'asc' && <ArrowUp size={14} aria-label="ascending" />}
        {dir === 'desc' && <ArrowDown size={14} aria-label="descending" />}
      </button>
    );
  };

  const columns = [
    col.accessor('startsAt', {
      header: () => sortHeader('When', 'startsAt'),
      cell: (c) => <span className="whitespace-nowrap">{formatDateTime(c.getValue())}</span>,
    }),
    col.accessor('title', {
      header: () => sortHeader('Workshop', 'title'),
      cell: (c) => (
        <div>
          <div className="font-medium text-slate-900">{c.getValue()}</div>
          <div className="text-xs text-slate-500">
            {c.row.original.code} · {c.row.original.instructor}
          </div>
        </div>
      ),
    }),
    col.accessor((w) => w.location.name, { id: 'location', header: 'Location' }),
    col.accessor('status', { header: 'Status', cell: (c) => <StatusBadge status={c.getValue()} /> }),
    col.display({
      id: 'seats',
      header: 'Seats',
      cell: (c) => (
        <SeatMeter taken={c.row.original.seatsTaken} capacity={c.row.original.capacity} />
      ),
    }),
  ];

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const page = search.page ?? 1;
  const hasFilters = Object.keys(search).some((k) => k !== 'sort' && k !== 'page');

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Workshops</h1>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick filters">
        {presets.map((p) => (
          <Button
            key={p.label}
            variant={p.active ? 'primary' : 'secondary'}
            aria-pressed={p.active}
            onClick={p.apply}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <FilterBar
        search={search}
        locations={locations.data ?? []}
        onChange={setFilters}
        onClear={() => setFilters({}, true)}
        canClear={hasFilters}
      />

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} className="px-4 py-3 font-semibold">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-100">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {isPending && <p className="p-8 text-center text-slate-500">Loading workshops…</p>}
        {isError && (
          <div className="p-8 text-center">
            <p className="text-red-600">We couldn&apos;t load the workshops.</p>
            <Button variant="secondary" className="mt-3" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        )}
        {data?.items.length === 0 && (
          <p className="p-8 text-center text-slate-500">
            No workshops match these filters.
            {hasFilters && ' Try clearing a filter or widening the dates.'}
          </p>
        )}
      </div>

      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            {data.total} workshop{data.total === 1 ? '' : 's'}
            {isFetching && ' · updating…'}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setFilters({ page: page - 1 || undefined })}
            >
              Previous
            </Button>
            <span>
              Page {page} of {totalPages}
            </span>
            <Button
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setFilters({ page: page + 1 })}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterBar({
  search,
  locations,
  onChange,
  onClear,
  canClear,
}: {
  search: Search;
  locations: { id: string; name: string }[];
  onChange: (next: Partial<Search>) => void;
  onClear: () => void;
  canClear: boolean;
}) {
  // Local text state so typing isn't fighting URL round-trips; committed on submit/blur.
  const [q, setQ] = useState(search.q ?? '');
  const [prevQ, setPrevQ] = useState(search.q);
  if (search.q !== prevQ) {
    setPrevQ(search.q);
    setQ(search.q ?? '');
  }
  const commitQ = () => {
    const next = q.trim() || undefined;
    if (next !== search.q) onChange({ q: next });
  };

  return (
    <div className="grid gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:grid-cols-2 lg:grid-cols-6">
      <label className="text-sm lg:col-span-2">
        <span className="mb-1 block font-medium text-slate-700">Search</span>
        <Input
          type="search"
          placeholder="Title, code or instructor"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onBlur={commitQ}
          onKeyDown={(e) => e.key === 'Enter' && commitQ()}
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium text-slate-700">From</span>
        <Input
          type="date"
          value={search.from ?? ''}
          max={search.to}
          onChange={(e) => onChange({ from: e.target.value || undefined })}
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium text-slate-700">To</span>
        <Input
          type="date"
          value={search.to ?? ''}
          min={search.from}
          onChange={(e) => onChange({ to: e.target.value || undefined })}
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium text-slate-700">Status</span>
        <Select
          value={search.status ?? ''}
          onChange={(e) => onChange({ status: (e.target.value || undefined) as WorkshopStatus })}
        >
          <option value="">Any status</option>
          {STATUS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium text-slate-700">Location</span>
        <Select
          value={search.locationId ?? ''}
          onChange={(e) => onChange({ locationId: e.target.value || undefined })}
        >
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      </label>
      <div className="flex items-center gap-4 sm:col-span-2 lg:col-span-6">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            className="size-4 rounded border-slate-300 text-indigo-600"
            checked={search.hasSeats === true}
            onChange={(e) => onChange({ hasSeats: e.target.checked || undefined })}
          />
          Only workshops with seats available
        </label>
        {canClear && (
          <Button variant="ghost" onClick={onClear}>
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
