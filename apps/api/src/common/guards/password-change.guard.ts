import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ALLOW_PENDING_PASSWORD_CHANGE_KEY } from '../decorators/allow-password-change.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { AppException } from '../errors/app.exception.js';
import type { AuthUser } from '../types/auth-user.js';

/**
 * A user holding an admin-issued temporary password may do nothing except read their own
 * profile and change the password, however valid their token is.
 */
@Injectable()
export class PasswordChangeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_CHANGE_KEY, targets)) {
      return true;
    }

    const user = context.switchToHttp().getRequest<Request & { user?: AuthUser }>().user;
    if (user?.mustChangePassword) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'PASSWORD_CHANGE_REQUIRED',
        'You must change your temporary password before continuing',
      );
    }
    return true;
  }
}
