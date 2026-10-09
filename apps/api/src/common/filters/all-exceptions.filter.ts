import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaClientKnownRequestError } from '../../generated/prisma/internal/prismaNamespace.js';
import { AppException } from '../errors/app.exception.js';

interface Problem {
  status: number;
  title: string;
  detail: string;
  code: string;
  errors?: string[];
}

const TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  412: 'Precondition Failed',
  428: 'Precondition Required',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
};

/** Renders every error as RFC 9457 `application/problem+json`. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const problem = this.toProblem(exception);

    if (problem.status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    res
      .status(problem.status)
      .type('application/problem+json')
      .json({
        type: 'about:blank',
        title: problem.title,
        status: problem.status,
        detail: problem.detail,
        code: problem.code,
        ...(problem.errors && { errors: problem.errors }),
        instance: req.originalUrl,
        requestId: res.getHeader('x-request-id'),
      });
  }

  private toProblem(exception: unknown): Problem {
    if (exception instanceof AppException) {
      const status = exception.getStatus();
      return {
        status,
        title: TITLES[status] ?? 'Error',
        detail: exception.message,
        code: exception.code,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const title = TITLES[status] ?? 'Error';
      const body = exception.getResponse();
      const raw =
        typeof body === 'object' ? (body as { message?: string | string[] }).message : body;
      const messages = Array.isArray(raw) ? raw : undefined;
      const single = typeof raw === 'string' ? raw : exception.message;
      return {
        status,
        title,
        detail: messages ? 'Validation failed' : single,
        code: messages ? 'VALIDATION_FAILED' : title.toUpperCase().replace(/ /g, '_'),
        errors: messages,
      };
    }

    if (exception instanceof PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return {
            status: 409,
            title: 'Conflict',
            detail: 'A record with these values already exists',
            code: 'DUPLICATE',
          };
        case 'P2025':
          return { status: 404, title: 'Not Found', detail: 'Record not found', code: 'NOT_FOUND' };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      title: 'Internal Server Error',
      detail: 'Something went wrong',
      code: 'INTERNAL_ERROR',
    };
  }
}
