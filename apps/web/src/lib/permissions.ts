import type { Role } from '@/api/types';

/** UX-only mirror of the backend role matrix; the API is the authority. */
export const can = {
  manageUsers: (role: Role) => role === 'ADMIN',
  viewWorkshops: (role: Role) => role === 'MANAGER' || role === 'STAFF',
  editWorkshops: (role: Role) => role === 'MANAGER',
  register: (role: Role) => role === 'MANAGER' || role === 'STAFF',
};

export function homePath(role: Role): '/users' | '/workshops' {
  return role === 'ADMIN' ? '/users' : '/workshops';
}

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Administrator',
  MANAGER: 'Manager',
  STAFF: 'Front desk',
};
