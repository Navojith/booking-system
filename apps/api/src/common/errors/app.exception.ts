import { HttpException, HttpStatus } from '@nestjs/common';

/** Domain error carrying a stable machine-readable `code` for the frontend. */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
  ) {
    super(message, status);
  }
}
