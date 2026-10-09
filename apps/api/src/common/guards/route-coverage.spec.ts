import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { HealthController } from '../../health/health.controller.js';
import { AuthController } from '../../modules/auth/auth.controller.js';
import { LocationsController } from '../../modules/locations/locations.controller.js';
import { UsersController } from '../../modules/users/users.controller.js';
import { WorkshopsController } from '../../modules/workshops/workshops.controller.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

/** Add every new controller here; the test then proves no route lacks an access rule. */
const CONTROLLERS = [
  HealthController,
  AuthController,
  UsersController,
  LocationsController,
  WorkshopsController,
];

describe('route access coverage', () => {
  for (const controller of CONTROLLERS) {
    const proto = controller.prototype as unknown as Record<string, unknown>;
    const handlers = Object.getOwnPropertyNames(proto).filter(
      (name) => name !== 'constructor' && typeof proto[name] === 'function',
    );

    for (const name of handlers) {
      // Only HTTP handlers carry route metadata (private helpers are skipped).
      if (Reflect.getMetadata('path', proto[name] as object) === undefined) continue;

      it(`${controller.name}.${name} is @Public or declares @Roles`, () => {
        const target = proto[name] as object;
        const isPublic =
          Reflect.getMetadata(IS_PUBLIC_KEY, target) ?? Reflect.getMetadata(IS_PUBLIC_KEY, controller);
        const roles =
          Reflect.getMetadata(ROLES_KEY, target) ?? Reflect.getMetadata(ROLES_KEY, controller);
        expect(Boolean(isPublic) || (Array.isArray(roles) && roles.length > 0)).toBe(true);
      });
    }
  }
});
