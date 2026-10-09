import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Opts a route out of authentication. Everything else is deny-by-default. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
