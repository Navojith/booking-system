import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { Public } from '../decorators/public.decorator.js';
import { Roles } from '../decorators/roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

class Probe {
  @Roles('ADMIN')
  adminOnly() {}

  undecorated() {}

  @Public()
  open() {}
}

const run = (handler: () => void, role?: 'ADMIN' | 'STAFF') => {
  const ctx = {
    getHandler: () => handler,
    getClass: () => Probe,
    switchToHttp: () => ({ getRequest: () => ({ user: role && { role } }) }),
  } as unknown as ExecutionContext;
  return new RolesGuard(new Reflector()).canActivate(ctx);
};

describe('RolesGuard', () => {
  const p = new Probe();

  it('allows a listed role', () => expect(run(p.adminOnly, 'ADMIN')).toBe(true));
  it('refuses an unlisted role', () =>
    expect(() => run(p.adminOnly, 'STAFF')).toThrow(ForbiddenException));
  it('denies by default when a route declares no roles', () =>
    expect(() => run(p.undecorated, 'ADMIN')).toThrow(ForbiddenException));
  it('lets @Public routes through without a user', () => expect(run(p.open)).toBe(true));
});
