import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import { map } from 'rxjs';

/**
 * Emits a weak `ETag: W/"<version>"` for any response body carrying a numeric `version`.
 * The ETag exists for `If-Match` edit checks only: seat counts change without bumping the
 * version, so these responses are `no-store` to stop clients revalidating into a stale 304.
 */
@Injectable()
export class ETagInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const res = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((body: unknown) => {
        const version = (body as { version?: unknown } | null)?.version;
        if (typeof version === 'number') {
          res.setHeader('ETag', `W/"${version}"`);
          res.setHeader('Cache-Control', 'no-store');
        }
        return body;
      }),
    );
  }
}

/** Parses `W/"3"`, `"3"` or `3` into 3; returns undefined when absent or malformed. */
export function parseIfMatch(header: string | undefined): number | undefined {
  const match = /^\s*(?:W\/)?"?(\d+)"?\s*$/.exec(header ?? '');
  return match ? Number(match[1]) : undefined;
}
