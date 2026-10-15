// Cross-cutting security invariants from docs/SECURITY.md that no single feature file owns.
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { RefreshTokenModel } from '../src/modules/auth/refresh-token.model.js';
import { CategoryModel } from '../src/modules/categories/category.model.js';
import { app, body, createUser, loginAs, type Envelope, type TestUser } from './setup.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const FAKE_ID = 'ffffffffffffffffffffffff';
const SECRET_FIELDS = [
  'passwordHash',
  'tokenHash',
  'failedLoginAttempts',
  'lockedUntil',
  '__v',
  'storedKey',
  'stack',
];

function stripRequestId(payload: unknown): string {
  return JSON.stringify(payload).replace(/"requestId":"[^"]*"/g, '"requestId":"X"');
}

let admin: TestUser;
let userA: TestUser;
let userB: TestUser;
let adminToken: string;
let tokenA: string;
let tokenB: string;

beforeEach(async () => {
  [admin, userA, userB] = await Promise.all([
    createUser({ role: 'admin' }),
    createUser(),
    createUser(),
  ]);
  [adminToken, tokenA, tokenB] = await Promise.all([
    loginAs(admin, 'mobile').then((s) => s.accessToken),
    loginAs(userA, 'mobile').then((s) => s.accessToken),
    loginAs(userB, 'mobile').then((s) => s.accessToken),
  ]);
});

describe('cross-cutting security invariants', () => {
  it('foreign and non-existent tickets produce byte-identical 404 bodies on every owner route', async () => {
    const category = await CategoryModel.create({ name: 'Billing' });
    const created = await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        title: 'B secret ticket',
        description: 'b only',
        categoryId: category._id.toString(),
      });
    const bTicketId = body<Envelope<{ id: string }>>(created).data.id;

    const probes: ((id: string) => request.Test)[] = [
      (id) => request(app).get(`/api/v1/tickets/${id}`),
      (id) => request(app).patch(`/api/v1/tickets/${id}`).send({ title: 'Hijacked title' }),
      (id) => request(app).post(`/api/v1/tickets/${id}/status`).send({ status: 'closed' }),
      (id) => request(app).get(`/api/v1/tickets/${id}/comments`),
      (id) => request(app).post(`/api/v1/tickets/${id}/comments`).send({ body: 'x' }),
      (id) => request(app).get(`/api/v1/tickets/${id}/history`),
      (id) => request(app).get(`/api/v1/tickets/${id}/attachments/${FAKE_ID}/download`),
    ];
    for (const probe of probes) {
      const foreign = await probe(bTicketId).set('Authorization', `Bearer ${tokenA}`);
      const missing = await probe(FAKE_ID).set('Authorization', `Bearer ${tokenA}`);
      expect(foreign.status).toBe(404);
      expect(missing.status).toBe(404);
      // Identical modulo requestId: existence must not be inferable from the body either.
      expect(stripRequestId(foreign.body)).toBe(stripRequestId(missing.body));
    }
  });

  it('refresh tokens are stored only as hashes — the raw token never touches the database', async () => {
    const { refreshToken } = await loginAs(userA, 'mobile');
    expect(refreshToken).toBeTruthy();
    const docs = await RefreshTokenModel.find({}).lean().exec();
    expect(docs.length).toBeGreaterThan(0);
    for (const doc of docs) {
      expect(doc.tokenHash).not.toBe(refreshToken);
      expect(JSON.stringify(doc)).not.toContain(refreshToken ?? 'impossible');
      expect(doc.tokenHash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
    }
  });

  it('helmet sends HSTS and nosniff on every response', async () => {
    const res = await request(app).get('/health');
    expect(res.get('Strict-Transport-Security')).toMatch(/max-age=\d+/);
    expect(res.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.get('x-powered-by')).toBeUndefined();
  });

  it('no endpoint response contains hashes, lockout fields, __v, storage keys or stacks', async () => {
    const category = await CategoryModel.create({ name: 'Billing' });
    const created = await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Sweep fixture', description: 'x', categoryId: category._id.toString() });
    const ticketId = body<Envelope<{ id: string }>>(created).data.id;
    await request(app)
      .post(`/api/v1/tickets/${ticketId}/comments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ body: 'sweep comment' })
      .expect(201);
    await request(app)
      .post(`/api/v1/tickets/${ticketId}/attachments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', PNG, 'sweep.png')
      .expect(201);

    const sweeps: [string, string][] = [
      ['/api/v1/auth/me', tokenA],
      ['/api/v1/categories', tokenA],
      [`/api/v1/tickets`, tokenA],
      [`/api/v1/tickets/${ticketId}`, tokenA],
      [`/api/v1/tickets/${ticketId}/comments`, tokenA],
      [`/api/v1/tickets/${ticketId}/history`, tokenA],
      ['/api/v1/admin/users', adminToken],
      ['/api/v1/admin/categories?includeDeleted=true', adminToken],
      ['/api/v1/admin/tickets', adminToken],
      [`/api/v1/admin/tickets/${ticketId}`, adminToken],
      [`/api/v1/admin/tickets/${ticketId}/comments`, adminToken],
      [`/api/v1/admin/tickets/${ticketId}/history`, adminToken],
      ['/api/v1/admin/stats', adminToken],
      ['/api/v1/definitely-not-a-route', tokenA], // error body
    ];
    for (const [url, token] of sweeps) {
      const res = await request(app).get(url).set('Authorization', `Bearer ${token}`);
      const text = JSON.stringify(res.body);
      for (const field of SECRET_FIELDS) {
        expect(text, `${field} leaked in GET ${url}`).not.toContain(`"${field}"`);
      }
    }
  });

  it('the local storage adapter rejects any key that is not a plain filename', async () => {
    const { LocalDiskStorage } =
      await import('../src/modules/attachments/storage/LocalDiskStorage.js');
    const storage = new LocalDiskStorage(tmpdir());
    for (const hostile of [
      '../etc/passwd',
      'a/../../b',
      '/etc/passwd',
      '.hidden',
      'a/b.png',
      'a\\b.png',
      'x..y.png',
    ]) {
      await expect(storage.getStream(hostile)).rejects.toThrow('invalid storage key');
      await expect(storage.put(hostile, Buffer.from('x'), 'image/png')).rejects.toThrow(
        'invalid storage key',
      );
    }
  });

  it('a login failure response carries no stack in any environment', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: userA.email, password: 'definitely-wrong-pass', client: 'mobile' });
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain('stack');
  });

  it('boot fails with a readable list when required env vars are missing or invalid', () => {
    // Spawned in a clean temp cwd (no .env) with NODE_ENV=test so dotenv never fills the gaps.
    let output = '';
    let exitCode = 0;
    try {
      execFileSync('npx', ['tsx', '-e', `import('${process.cwd()}/src/config/env.ts')`], {
        cwd: tmpdir(),
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_ENV: 'test',
          JWT_ACCESS_SECRET: 'way-too-short',
          MONGODB_URI: 'not-a-mongo-uri',
          CORS_ORIGINS: '',
          LOCAL_STORAGE_DIR: undefined,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      const failure = err as { status?: number; stderr?: string; stdout?: string };
      exitCode = failure.status ?? 0;
      output = `${failure.stderr ?? ''}${failure.stdout ?? ''}`;
    }
    expect(exitCode).toBe(1);
    expect(output).toContain('Invalid environment configuration');
    expect(output).toContain('JWT_ACCESS_SECRET');
    expect(output).toContain('MONGODB_URI');
    // The failure output explains itself without echoing any provided value.
    expect(output).not.toContain('way-too-short');
  });
});
