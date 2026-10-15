import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { adminUsersController } from './admin-users.controller.js';
import { listUsersSchema } from './users.schemas.js';

// Mounted under /api/v1/admin, which already enforces requireAuth + requireRole('admin').
export const adminUsersRouter = Router();

adminUsersRouter.get('/', validate(listUsersSchema), adminUsersController.list);
