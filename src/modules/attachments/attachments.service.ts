import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { fileTypeFromBuffer } from 'file-type';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import type { Caller } from '../../middleware/auth.js';
import { historyRepository } from '../history/history.repository.js';
import {
  MAX_ATTACHMENTS_PER_TICKET,
  type TicketAttachment,
  type TicketDocument,
} from '../tickets/ticket.model.js';
import { ticketsRepository } from '../tickets/tickets.repository.js';
import { virusScanner } from './security/virus-scanner.js';
import { getStorage } from './storage/index.js';

// Allowlist by DETECTED content type (magic bytes), mapped to the canonical extension used in the
// storage key. The client's declared Content-Type and filename extension are never trusted.
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

// Strip any path the client sent, drop control characters, cap at 200 (schema limit).
function sanitiseOriginalName(raw: string): string {
  // busboy decodes multipart header params as latin1; recover the UTF-8 the client actually sent
  // (RFC 7578 clients send UTF-8 filenames).
  const decoded = Buffer.from(raw, 'latin1').toString('utf8');
  const basename = decoded.split(/[/\\]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex -- removing control chars is the point here
  const cleaned = basename.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (cleaned || 'file').slice(0, 200);
}

function uploadRejected(status: number, message: string): AppError {
  return new AppError('UPLOAD_REJECTED', {
    status,
    message: 'Upload rejected',
    details: [{ path: 'file', message }],
  });
}

async function findAttachment(
  ticket: TicketDocument,
  attachmentId: string,
): Promise<{ attachment: TicketAttachment; stream: Readable }> {
  const attachment = ticket.attachments.find((item) => item._id.toString() === attachmentId);
  if (!attachment) throw new AppError('NOT_FOUND');
  const storage = await getStorage();
  return { attachment, stream: await storage.getStream(attachment.storedKey) };
}

export const attachmentsService = {
  async upload(
    ticketId: string,
    caller: Caller,
    file: UploadedFile | undefined,
  ): Promise<TicketAttachment> {
    const ticket = await ticketsRepository.findOwned(ticketId, caller.id);
    if (!ticket) throw new AppError('NOT_FOUND');
    if (ticket.status === 'closed') throw new AppError('TICKET_CLOSED');
    if (!file) throw uploadRejected(400, 'A single multipart field named "file" is required');
    if (ticket.attachments.length >= MAX_ATTACHMENTS_PER_TICKET) {
      throw uploadRejected(
        400,
        `A ticket can have at most ${MAX_ATTACHMENTS_PER_TICKET} attachments`,
      );
    }

    // Content check by magic bytes: a renamed .exe fails here no matter what its name or declared
    // type says; a PDF called photo.jpg is stored as application/pdf.
    const detected = await fileTypeFromBuffer(file.buffer);
    const extension = detected ? ALLOWED_TYPES[detected.mime] : undefined;
    if (!detected || !extension) {
      throw uploadRejected(415, 'File type not allowed. Allowed: JPEG, PNG, WebP, PDF');
    }

    const scanStatus = await virusScanner.scan(file.buffer);
    if (scanStatus === 'infected') throw uploadRejected(415, 'File failed the malware scan');

    const storedKey = `${randomUUID()}.${extension}`;
    const storage = await getStorage();
    await storage.put(storedKey, file.buffer, detected.mime);

    ticket.attachments.push({
      originalName: sanitiseOriginalName(file.originalname),
      storedKey,
      mimeType: detected.mime,
      size: file.size,
      uploadedBy: caller.id,
      scanStatus,
    });
    ticket.lastActivityAt = new Date();
    try {
      await ticketsRepository.save(ticket);
    } catch (err) {
      // Don't leave orphaned bytes if the metadata write failed.
      await storage.delete(storedKey).catch(() => undefined);
      throw err;
    }

    // Populate so the response carries uploadedBy as a UserRef (docs/API.md §4.4).
    await ticketsRepository.populate(ticket);
    const attachment = ticket.attachments[ticket.attachments.length - 1];
    if (!attachment) throw new AppError('INTERNAL'); // unreachable: just pushed
    try {
      await historyRepository.append({
        ticketId,
        actorId: caller.id,
        type: 'attachment_added',
        changes: { attachmentId: { from: null, to: attachment._id.toString() } },
      });
    } catch (err) {
      logger.error(
        { err, requestId: caller.requestId, ticketId },
        'ticket history append failed; attachment already committed',
      );
    }
    return attachment;
  },

  async downloadForOwner(ticketId: string, attachmentId: string, caller: Caller) {
    const ticket = await ticketsRepository.findOwned(ticketId, caller.id);
    if (!ticket) throw new AppError('NOT_FOUND');
    return findAttachment(ticket, attachmentId);
  },

  async downloadForAdmin(ticketId: string, attachmentId: string) {
    const ticket = await ticketsRepository.findByIdAdmin(ticketId);
    if (!ticket) throw new AppError('NOT_FOUND');
    return findAttachment(ticket, attachmentId);
  },
};
