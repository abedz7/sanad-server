import type { RequestHandler, Response } from 'express';
import type { Readable } from 'node:stream';
import { ok } from '../../lib/response.js';
import { callerOf } from '../../middleware/auth.js';
import { validated } from '../../middleware/validate.js';
import type { TicketAttachment } from '../tickets/ticket.model.js';
import { downloadAttachmentSchema, uploadAttachmentSchema } from './attachments.schemas.js';
import { attachmentsService } from './attachments.service.js';

// RFC 6266/5987: an ASCII-only quoted fallback plus a UTF-8 filename* for everything else, so no
// user-controlled byte can break out of the header.
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\u0020-\u007e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

// docs/API.md §7.3: bytes only via this route, as a download, never sniffable, never cached.
function streamAttachment(res: Response, attachment: TicketAttachment, stream: Readable): void {
  res.status(200);
  res.setHeader('Content-Type', attachment.mimeType);
  res.setHeader('Content-Length', String(attachment.size));
  res.setHeader('Content-Disposition', contentDisposition(attachment.originalName));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  stream.pipe(res);
}

export const attachmentsController = {
  upload: (async (req, res) => {
    const { params } = validated(req, uploadAttachmentSchema);
    const attachment = await attachmentsService.upload(params.id, callerOf(req), req.file);
    ok(res, attachment, undefined, 201);
  }) satisfies RequestHandler,

  downloadForOwner: (async (req, res) => {
    const { params } = validated(req, downloadAttachmentSchema);
    const { attachment, stream } = await attachmentsService.downloadForOwner(
      params.id,
      params.attachmentId,
      callerOf(req),
    );
    streamAttachment(res, attachment, stream);
  }) satisfies RequestHandler,

  downloadForAdmin: (async (req, res) => {
    const { params } = validated(req, downloadAttachmentSchema);
    const { attachment, stream } = await attachmentsService.downloadForAdmin(
      params.id,
      params.attachmentId,
    );
    streamAttachment(res, attachment, stream);
  }) satisfies RequestHandler,
};
