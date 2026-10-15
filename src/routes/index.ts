import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { mutatingLimiter } from '../middleware/rateLimit.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { adminCategoriesRouter } from '../modules/categories/admin-categories.routes.js';
import { categoriesRouter } from '../modules/categories/categories.routes.js';
import { adminTicketsRouter } from '../modules/tickets/admin-tickets.routes.js';
import { ticketsRouter } from '../modules/tickets/ticket.routes.js';
import { adminUsersRouter } from '../modules/users/admin-users.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);

// User-facing resources: authenticated, with the per-user mutating limiter.
apiRouter.use('/categories', requireAuth, mutatingLimiter, categoriesRouter);
apiRouter.use('/tickets', requireAuth, mutatingLimiter, ticketsRouter);

// RBAC is applied once, here, for the whole admin surface so no admin route can be mounted without it.
const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('admin'), mutatingLimiter);
adminRouter.use('/users', adminUsersRouter);
adminRouter.use('/categories', adminCategoriesRouter);
adminRouter.use('/tickets', adminTicketsRouter);

apiRouter.use('/admin', adminRouter);
