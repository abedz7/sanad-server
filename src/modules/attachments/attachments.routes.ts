import { Router } from 'express';
import { uploadSingleFile } from '../../middleware/upload.js';
import { validate } from '../../middleware/validate.js';
import { attachmentsController } from './attachments.controller.js';
import { downloadAttachmentSchema, uploadAttachmentSchema } from './attachments.schemas.js';

// Mounted at /tickets/:id/attachments and /admin/tickets/:id/attachments (mergeParams carries :id).
// Upload exists only on the owner surface (docs/API.md §7.3/§7.4); admins download, never upload.
export const attachmentsOwnerRouter = Router({ mergeParams: true });
attachmentsOwnerRouter.post(
  '/',
  uploadSingleFile,
  validate(uploadAttachmentSchema),
  attachmentsController.upload,
);
attachmentsOwnerRouter.get(
  '/:attachmentId/download',
  validate(downloadAttachmentSchema),
  attachmentsController.downloadForOwner,
);

export const attachmentsAdminRouter = Router({ mergeParams: true });
attachmentsAdminRouter.get(
  '/:attachmentId/download',
  validate(downloadAttachmentSchema),
  attachmentsController.downloadForAdmin,
);
