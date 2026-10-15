import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { env } from '../src/config/env.js';
import { CategoryModel } from '../src/modules/categories/category.model.js';
import { TicketModel } from '../src/modules/tickets/ticket.model.js';
import {
  app,
  body,
  createUser,
  loginAs,
  type Envelope,
  type ErrorEnvelope,
  type TestUser,
} from './setup.js';

// A real 1×1 transparent PNG — file-type walks the chunk structure, so a bare signature is not enough.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n%fake minimal pdf\n'), Buffer.alloc(64)]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(128)]);
const GARBAGE = Buffer.from('just some text, no magic bytes at all, definitely not an image');

interface AttachmentBody extends Record<string, unknown> {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedBy: { id: string; name: string; role: string };
  scanStatus: string;
}

let user: TestUser;
let userToken: string;
let adminToken: string;
let ticketId: string;

beforeEach(async () => {
  user = await createUser();
  const admin = await createUser({ role: 'admin' });
  [userToken, adminToken] = await Promise.all([
    loginAs(user, 'mobile').then((s) => s.accessToken),
    loginAs(admin, 'mobile').then((s) => s.accessToken),
  ]);
  const category = await CategoryModel.create({ name: 'Billing' });
  const created = await request(app)
    .post('/api/v1/tickets')
    .set('Authorization', `Bearer ${userToken}`)
    .send({
      title: 'Cannot export invoice',
      description: 'The export button does nothing.',
      categoryId: category._id.toString(),
    });
  ticketId = body<Envelope<{ id: string }>>(created).data.id;
});

function upload(buffer: Buffer, filename: string, token = userToken, ticket = ticketId) {
  return request(app)
    .post(`/api/v1/tickets/${ticket}/attachments`)
    .set('Authorization', `Bearer ${token}`)
    .attach('file', buffer, filename);
}

describe('POST /api/v1/tickets/:id/attachments', () => {
  it('stores a valid PNG and returns metadata without the storage key', async () => {
    const res = await upload(PNG, 'screenshot.png');
    expect(res.status).toBe(201);
    const { data } = body<Envelope<AttachmentBody>>(res);
    expect(Object.keys(data).sort()).toEqual([
      'createdAt',
      'id',
      'mimeType',
      'originalName',
      'scanStatus',
      'size',
      'uploadedBy',
    ]);
    expect(data.mimeType).toBe('image/png');
    expect(data.originalName).toBe('screenshot.png');
    expect(data.size).toBe(PNG.length);
    expect(data.scanStatus).toBe('skipped'); // honest NoopScanner — never pretends "clean"
    expect(data.uploadedBy).toEqual({ id: user.id, name: user.name, role: 'user' });
    expect(data['storedKey']).toBeUndefined();
  });

  it('rejects a file over the size limit with 413', async () => {
    const huge = Buffer.concat([PNG, Buffer.alloc(env.MAX_UPLOAD_BYTES)]);
    const res = await upload(huge, 'huge.png');
    expect(res.status).toBe(413);
    expect(body<ErrorEnvelope>(res).error.code).toBe('UPLOAD_REJECTED');
  });

  it('rejects an exe renamed to .jpg with 415 (magic bytes, not extension)', async () => {
    const res = await upload(EXE, 'totally-a-photo.jpg');
    expect(res.status).toBe(415);
    expect(body<ErrorEnvelope>(res).error.code).toBe('UPLOAD_REJECTED');

    const unknown = await upload(GARBAGE, 'notes.jpg');
    expect(unknown.status).toBe(415);
  });

  it('stores a PDF renamed to .jpg as application/pdf', async () => {
    const res = await upload(PDF, 'photo.jpg');
    expect(res.status).toBe(201);
    const { data } = body<Envelope<AttachmentBody>>(res);
    expect(data.mimeType).toBe('application/pdf');

    const download = await request(app)
      .get(`/api/v1/tickets/${ticketId}/attachments/${data.id}/download`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(download.get('Content-Type')).toBe('application/pdf');
  });

  it('rejects the 6th attachment with 400', async () => {
    for (let i = 0; i < 5; i += 1) {
      await upload(PNG, `file-${i}.png`).expect(201);
    }
    const res = await upload(PNG, 'one-too-many.png');
    expect(res.status).toBe(400);
    expect(body<ErrorEnvelope>(res).error.code).toBe('UPLOAD_REJECTED');
  });

  it('rejects a request without a file field with 400', async () => {
    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/attachments`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(400);
    expect(body<ErrorEnvelope>(res).error.code).toBe('UPLOAD_REJECTED');
  });

  it('rejects uploads to a closed ticket with 409 TICKET_CLOSED', async () => {
    await TicketModel.updateOne(
      { _id: ticketId },
      { $set: { status: 'closed', closedAt: new Date() } },
    ).exec();
    const res = await upload(PNG, 'late.png');
    expect(res.status).toBe(409);
    expect(body<ErrorEnvelope>(res).error.code).toBe('TICKET_CLOSED');
  });
});

describe('GET …/attachments/:attachmentId/download', () => {
  it('streams with download-only headers and the exact bytes', async () => {
    const uploaded = body<Envelope<AttachmentBody>>(await upload(PNG, 'résumé scan.png')).data;

    const res = await request(app)
      .get(`/api/v1/tickets/${ticketId}/attachments/${uploaded.id}/download`)
      .set('Authorization', `Bearer ${userToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          callback(null, Buffer.concat(chunks));
        });
      });

    expect(res.status).toBe(200);
    expect(res.get('Content-Type')).toBe('image/png');
    expect(res.get('Content-Length')).toBe(String(PNG.length));
    expect(res.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.get('Cache-Control')).toBe('private, no-store');
    const disposition = res.get('Content-Disposition') ?? '';
    expect(disposition).toMatch(/^attachment; filename="/);
    expect(disposition).toContain("filename*=UTF-8''r%C3%A9sum%C3%A9%20scan.png");
    expect(Buffer.compare(res.body as Buffer, PNG)).toBe(0);
  });

  it('is 404 for another user and 200 for an admin', async () => {
    const uploaded = body<Envelope<AttachmentBody>>(await upload(PNG, 'mine.png')).data;
    const stranger = await createUser();
    const strangerToken = (await loginAs(stranger, 'mobile')).accessToken;

    const foreign = await request(app)
      .get(`/api/v1/tickets/${ticketId}/attachments/${uploaded.id}/download`)
      .set('Authorization', `Bearer ${strangerToken}`);
    expect(foreign.status).toBe(404);
    expect(body<ErrorEnvelope>(foreign).error.code).toBe('NOT_FOUND');

    const adminDownload = await request(app)
      .get(`/api/v1/admin/tickets/${ticketId}/attachments/${uploaded.id}/download`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminDownload.status).toBe(200);
    expect(adminDownload.get('Content-Type')).toBe('image/png');
  });
});
