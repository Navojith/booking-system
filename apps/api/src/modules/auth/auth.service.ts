import { HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AppException } from '../../common/errors/app.exception.js';
import type { Env } from '../../config/env.schema.js';
import type { User } from '../../generated/prisma/client.js';
import { UserResponseDto } from '../users/dto/user-response.dto.js';
import { UsersService } from '../users/users.service.js';
import type { JwtPayload } from './jwt.strategy.js';

export interface ClientMeta {
  userAgent?: string;
  ip?: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: UserResponseDto;
}

type RotateResult = { ok: true; session: Session } | { ok: false; reuse: boolean };

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const INVALID_CREDENTIALS = 'Invalid email or password';

@Injectable()
export class AuthService {
  /** Verified against when the email is unknown, so timing doesn't reveal accounts. */
  private readonly dummyHash = argon2.hash(randomBytes(16).toString('hex'));

  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly users: UsersService,
  ) {}

  async login(email: string, password: string, meta: ClientMeta): Promise<Session> {
    const user = await this.txHost.tx.user.findUnique({ where: { email } });
    const hash = user?.passwordHash ?? (await this.dummyHash);
    const valid = await argon2.verify(hash, password);
    if (!user || !valid || !user.isActive) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    return this.issueSession(user, randomUUID(), meta);
  }

  async refresh(rawToken: string | undefined, meta: ClientMeta): Promise<Session> {
    if (!rawToken) throw new UnauthorizedException('Session expired');

    const result = await this.rotate(rawToken, meta);
    if (!result.ok) {
      // Revoking happens outside the rotate transaction so the throw can't roll it back.
      if (result.reuse) await this.revokeFamilyOf(rawToken);
      throw new UnauthorizedException('Session expired');
    }
    return result.session;
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (rawToken) await this.revokeFamilyOf(rawToken);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.txHost.tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, currentPassword))) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'WRONG_PASSWORD', 'Current password is incorrect');
    }
    if (currentPassword === newPassword) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'PASSWORD_UNCHANGED',
        'Choose a password different from your current one',
      );
    }
    await this.users.setPassword(userId, newPassword, false);
  }

  @Transactional()
  private async rotate(rawToken: string, meta: ClientMeta): Promise<RotateResult> {
    const token = await this.txHost.tx.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { user: true },
    });
    if (!token || token.expiresAt <= new Date() || !token.user.isActive) {
      return { ok: false, reuse: false };
    }
    if (token.revokedAt) return { ok: false, reuse: true };

    // Conditional revoke: if two requests race, only one wins the rotation.
    const { count } = await this.txHost.tx.refreshToken.updateMany({
      where: { id: token.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) return { ok: false, reuse: false };

    return { ok: true, session: await this.issueSession(token.user, token.familyId, meta) };
  }

  private async revokeFamilyOf(rawToken: string) {
    const token = await this.txHost.tx.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
    });
    if (!token) return;
    await this.txHost.tx.refreshToken.updateMany({
      where: { familyId: token.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueSession(user: User, familyId: string, meta: ClientMeta): Promise<Session> {
    const payload: JwtPayload = { sub: user.id, role: user.role, tv: user.tokenVersion };
    const accessToken = await this.jwt.signAsync(payload);

    const refreshToken = randomBytes(48).toString('base64url');
    const refreshExpiresAt = new Date(
      Date.now() + this.config.get('REFRESH_TTL_DAYS') * 24 * 60 * 60 * 1000,
    );
    await this.txHost.tx.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: sha256(refreshToken),
        expiresAt: refreshExpiresAt,
        userAgent: meta.userAgent?.slice(0, 255),
        ip: meta.ip,
      },
    });

    return { accessToken, refreshToken, refreshExpiresAt, user: UserResponseDto.from(user) };
  }
}
