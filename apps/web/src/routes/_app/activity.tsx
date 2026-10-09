import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import type { AuditEntityType, AuditLog } from '@/api/types';
import { useAppSelector } from '@/app/hooks';
import { Button, Select } from '@/components/ui';
import { useAuditLogs } from '@/features/audit';
import { formatDateTime } from '@/lib/format';

export const Route = createFileRoute('/_app/activity')({ component: ActivityPage });

const PAGE_SIZE = 20;

const ACTION_LABEL: Record<string, string> = {
  USER_CREATED: 'Created a user',
  USER_UPDATED: 'Updated a user',
  USER_PASSWORD_RESET: 'Reset a password',
  USER_PASSWORD_CHANGED: 'Changed their password',
  WORKSHOP_CREATED: 'Created a workshop',
  WORKSHOP_UPDATED: 'Edited a workshop',
  WORKSHOP_CANCELLED: 'Cancelled a workshop',
  REGISTRATION_CREATED: 'Registered an attendee',
  REGISTRATION_WAITLISTED: 'Added an attendee to the waitlist',
  REGISTRATION_CANCELLED: 'Cancelled a registration',
  REGISTRATION_PROMOTED: 'Moved an attendee off the waitlist',
};

const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

/** Lists what actually differs, e.g. `capacity: 10 → 12`. */
function changes(log: AuditLog): string[] {
  const before = log.before ?? {};
  const after = log.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => (log.before ? `${k}: ${show(before[k])} → ${show(after[k])}` : `${k}: ${show(after[k])}`));
}

function ActivityPage() {
  const user = useAppSelector((s) => s.auth.user);
  const [entityType, setEntityType] = useState<AuditEntityType | ''>('');
  const [page, setPage] = useState(1);
  const { data, isPending, isError, refetch } = useAuditLogs({
    entityType: entityType || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Activity</h1>
        <p className="text-sm text-slate-500">
          {isAdmin ? 'Changes to user accounts.' : 'Changes to workshops and registrations, newest first.'}
        </p>
      </div>

      {!isAdmin && (
        <div className="max-w-xs rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Show</span>
            <Select
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value as AuditEntityType | '');
                setPage(1);
              }}
            >
              <option value="">Everything</option>
              <option value="WORKSHOP">Workshops</option>
              <option value="REGISTRATION">Registrations</option>
            </Select>
          </label>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold">When</th>
              <th className="px-4 py-3 font-semibold">Who</th>
              <th className="px-4 py-3 font-semibold">What</th>
              <th className="px-4 py-3 font-semibold">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.map((log) => (
              <tr key={log.id}>
                <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDateTime(log.createdAt)}</td>
                <td className="px-4 py-3 text-slate-900">{log.actor.fullName}</td>
                <td className="px-4 py-3 text-slate-700">{ACTION_LABEL[log.action] ?? log.action}</td>
                <td className="px-4 py-3 text-slate-500">
                  {changes(log).map((c) => (
                    <div key={c}>{c}</div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {isPending && <p className="p-8 text-center text-slate-500">Loading activity…</p>}
        {isError && (
          <div className="p-8 text-center">
            <p className="text-red-600">We couldn’t load the activity log.</p>
            <Button variant="secondary" className="mt-3" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        )}
        {data?.items.length === 0 && <p className="p-8 text-center text-slate-500">Nothing recorded yet.</p>}
      </div>

      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>{data.total} entries</span>
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
    </div>
  );
}
