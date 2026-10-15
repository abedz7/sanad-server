import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { connectDb } from '../src/db.js';
import { app, body, mongoUri, type Envelope, type ErrorEnvelope } from './setup.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('HTTP hardening and envelope', () => {
  it('answers an unknown route with the 404 envelope', async () => {
    const res = await request(app).get('/api/v1/definitely-not-a-route');
    expect(res.status).toBe(404);
    const { error } = body<ErrorEnvelope>(res);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.requestId).toBeTruthy();
    expect(error).not.toHaveProperty('stack');
  });

  it('rejects a body key starting with "$" anywhere in the app', async () => {
    const res = await request(app).post('/api/v1/anything').send({ $gt: '' });
    expect(res.status).toBe(400);
    const { error } = body<ErrorEnvelope>(res);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details?.[0]?.path).toBe('body.$gt');
  });

  it('rejects a nested body key containing "."', async () => {
    const res = await request(app)
      .post('/api/v1/anything')
      .send({ filter: { 'a.b': 1 } });
    expect(res.status).toBe(400);
    const { error } = body<ErrorEnvelope>(res);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details?.[0]?.path).toContain('a.b');
  });

  it('echoes a valid X-Request-Id and puts it on error bodies', async () => {
    const id = 'my-correlation-id-1234';
    const res = await request(app).get('/api/v1/nope').set('X-Request-Id', id);
    expect(res.get('X-Request-Id')).toBe(id);
    expect(body<ErrorEnvelope>(res).error.requestId).toBe(id);
  });

  it('replaces an invalid X-Request-Id with a generated UUID', async () => {
    const res = await request(app).get('/health').set('X-Request-Id', 'bad id with spaces');
    const echoed = res.get('X-Request-Id');
    expect(echoed).toMatch(UUID);
    expect(echoed).not.toBe('bad id with spaces');
  });

  it('GET /health reports a connected database', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    const { data } = body<Envelope<{ status: string; uptime: number; db: string }>>(res);
    expect(data.db).toBe('connected');
    expect(data.status).toBe('ok');
    expect(typeof data.uptime).toBe('number');
  });

  it('GET /health reports degraded with 503 while the database is down', async () => {
    await mongoose.disconnect();
    try {
      const res = await request(app).get('/health');
      expect(res.status).toBe(503);
      const { data } = body<Envelope<{ status: string; db: string }>>(res);
      expect(data).toMatchObject({ status: 'degraded', db: 'disconnected' });
    } finally {
      await connectDb(mongoUri());
    }
  });

  it('CORS: an allowlisted origin is reflected with credentials', async () => {
    const res = await request(app).get('/health').set('Origin', 'http://localhost:5173');
    expect(res.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(res.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('CORS: an origin outside the allowlist gets no Access-Control-Allow-Origin', async () => {
    const res = await request(app).get('/health').set('Origin', 'http://evil.example');
    expect(res.get('Access-Control-Allow-Origin')).toBeUndefined();
  });

  it('hides x-powered-by and sends helmet headers', async () => {
    const res = await request(app).get('/health');
    expect(res.get('x-powered-by')).toBeUndefined();
    expect(res.get('X-Content-Type-Options')).toBe('nosniff');
  });
});
