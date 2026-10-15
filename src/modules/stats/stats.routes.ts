import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { statsController, statsQuerySchema } from './stats.controller.js';

// Mounted under /api/v1/admin, which already enforces requireAuth + requireRole('admin').
export const statsRouter = Router();

statsRouter.get('/', validate(statsQuerySchema), statsController.get);
