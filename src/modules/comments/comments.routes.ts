import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { commentsController } from './comments.controller.js';
import {
  adminCreateCommentSchema,
  createCommentSchema,
  listCommentsSchema,
} from './comments.schemas.js';

// Mounted at /tickets/:id/comments and /admin/tickets/:id/comments; mergeParams carries :id through.
export const commentsOwnerRouter = Router({ mergeParams: true });
commentsOwnerRouter.get('/', validate(listCommentsSchema), commentsController.listForOwner);
commentsOwnerRouter.post('/', validate(createCommentSchema), commentsController.createForOwner);

export const commentsAdminRouter = Router({ mergeParams: true });
commentsAdminRouter.get('/', validate(listCommentsSchema), commentsController.listForAdmin);
commentsAdminRouter.post(
  '/',
  validate(adminCreateCommentSchema),
  commentsController.createForAdmin,
);
