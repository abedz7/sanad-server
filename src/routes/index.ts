import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { mutatingLimiter } from '../middleware/rateLimit.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { adminUsersRouter } from '../modules/users/admin-users.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);

// Phase 2 — user-facing resources (each router applies requireAuth itself):
// apiRouter.use('/categories', requireAuth, mutatingLimiter, categoriesRouter);
// apiRouter.use('/tickets', requireAuth, mutatingLimiter, ticketsRouter);

// RBAC is applied once, here, for the whole admin surface so no admin route can be mounted without it.
const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('admin'), mutatingLimiter);
adminRouter.use('/users', adminUsersRouter);
// Phase 2 — admin resources:
// adminRouter.use('/categories', adminCategoriesRouter);
// adminRouter.use('/tickets', adminTicketsRouter);
// adminRouter.use('/stats', statsRouter);

apiRouter.use('/admin', adminRouter);
