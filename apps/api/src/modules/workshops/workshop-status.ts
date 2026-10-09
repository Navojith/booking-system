import type { WorkshopStatus } from '../../generated/prisma/enums.js';

const TRANSITIONS: Record<WorkshopStatus, readonly WorkshopStatus[]> = {
  DRAFT: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['COMPLETED', 'CANCELLED'],
  CANCELLED: [],
  COMPLETED: [],
};

export const canTransition = (from: WorkshopStatus, to: WorkshopStatus) =>
  TRANSITIONS[from].includes(to);

/** Cancelled and completed workshops are frozen: no edits, no registrations. */
export const isClosed = (status: WorkshopStatus) => TRANSITIONS[status].length === 0;
