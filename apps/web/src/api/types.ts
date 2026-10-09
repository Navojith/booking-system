// Hand-written mirror of the API DTOs (apps/api/src/modules/*/dto).
export type Role = 'ADMIN' | 'MANAGER' | 'STAFF';
export type WorkshopStatus = 'DRAFT' | 'SCHEDULED' | 'CANCELLED' | 'COMPLETED';
export type RegistrationStatus = 'ACTIVE' | 'CANCELLED' | 'WAITLISTED';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  /** True while the user still holds an admin-issued temporary password. */
  mustChangePassword: boolean;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface Location {
  id: string;
  name: string;
  address: string;
}

export interface Workshop {
  id: string;
  code: string;
  title: string;
  description: string | null;
  instructor: string;
  location: Location;
  startsAt: string;
  endsAt: string;
  capacity: number;
  seatsTaken: number;
  seatsAvailable: number;
  status: WorkshopStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export type WorkshopSort =
  | 'startsAt:asc'
  | 'startsAt:desc'
  | 'title:asc'
  | 'title:desc'
  | 'code:asc'
  | 'code:desc';

export interface WorkshopFilters {
  from?: string;
  to?: string;
  status?: WorkshopStatus;
  locationId?: string;
  hasSeats?: boolean;
  q?: string;
  sort?: WorkshopSort;
  page?: number;
  pageSize?: number;
}

export interface PersonRef {
  id: string;
  fullName: string;
}

export interface Registration {
  id: string;
  workshop: { id: string; code: string; title: string; startsAt: string };
  attendeeName: string;
  attendeeEmail: string;
  status: RegistrationStatus;
  registeredBy: PersonRef;
  registeredAt: string;
  cancelledBy: PersonRef | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  /** Set when the attendee was moved off the waitlist into a freed seat. */
  promotedAt: string | null;
}

export type AuditEntityType = 'USER' | 'WORKSHOP' | 'REGISTRATION';

export interface AuditLog {
  id: string;
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  actor: PersonRef;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  requestId: string | null;
  createdAt: string;
}

export interface AuditFilters {
  entityType?: AuditEntityType;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}
