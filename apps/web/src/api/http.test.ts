import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '@/test/server';
import { api, ApiError, configureAuth, setAccessToken } from './http';

const user = {
  id: 'u1',
  email: 'staff@kenora.dev',
  fullName: 'Sam Staff',
  role: 'STAFF',
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  setAccessToken('old');
  configureAuth({ onRefreshed: () => {}, onLost: () => {} });
});

describe('api client', () => {
  it('shares one refresh between concurrent 401s and retries each request', async () => {
    let refreshes = 0;
    server.use(
      http.post('/api/v1/auth/refresh', () => {
        refreshes += 1;
        return HttpResponse.json({ accessToken: 'new', user });
      }),
      http.get('/api/v1/things', ({ request }) =>
        request.headers.get('authorization') === 'Bearer new'
          ? HttpResponse.json({ ok: true })
          : new HttpResponse(null, { status: 401 }),
      ),
    );

    const results = await Promise.all([
      api.get('/things'),
      api.get('/things'),
      api.get('/things'),
    ]);

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refreshes).toBe(1);
  });

  it('reports the session as lost when refresh fails', async () => {
    let lost = 0;
    configureAuth({ onRefreshed: () => {}, onLost: () => (lost += 1) });
    server.use(
      http.post('/api/v1/auth/refresh', () => new HttpResponse(null, { status: 401 })),
      http.get('/api/v1/things', () => new HttpResponse(null, { status: 401 })),
    );

    await expect(api.get('/things')).rejects.toBeInstanceOf(ApiError);
    expect(lost).toBe(1);
  });

  it('turns problem+json into an ApiError with its code', async () => {
    server.use(
      http.post('/api/v1/workshops/w1/registrations', () =>
        HttpResponse.json(
          { status: 409, code: 'WORKSHOP_FULL', detail: 'Workshop is full' },
          { status: 409 },
        ),
      ),
    );

    await expect(api.post('/workshops/w1/registrations', {})).rejects.toMatchObject({
      status: 409,
      code: 'WORKSHOP_FULL',
    });
  });

  it('sends custom headers such as If-Match', async () => {
    let seen: string | null = null;
    server.use(
      http.patch('/api/v1/workshops/w1', ({ request }) => {
        seen = request.headers.get('if-match');
        return HttpResponse.json({});
      }),
    );

    await api.patch('/workshops/w1', { title: 'x' }, { headers: { 'If-Match': 'W/"3"' } });
    expect(seen).toBe('W/"3"');
  });
});
