import { z } from 'zod';
import { objectIdSchema } from '../../lib/objectId.js';

// Upload is multipart: multer handles the file; any stray text field is rejected by the strict
// empty body schema so nothing unvalidated rides along.
export const uploadAttachmentSchema = {
  params: z.object({ id: objectIdSchema }).strict(),
  body: z.object({}).strict(),
};

export const downloadAttachmentSchema = {
  params: z.object({ id: objectIdSchema, attachmentId: objectIdSchema }).strict(),
};
