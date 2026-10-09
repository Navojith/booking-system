import { SetMetadata } from '@nestjs/common';
import type { Role } from '../../generated/prisma/enums.js';

export const ROLES_KEY = 'roles';

/** Roles allowed to call a route. Every non-public route must declare this. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
