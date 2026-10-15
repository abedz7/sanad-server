import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { authController } from './auth.controller.js';
import { loginSchema, logoutSchema, refreshSchema, registerSchema } from './auth.schemas.js';

export const authRouter = Router();

authRouter.post('/register', authLimiter, validate(registerSchema), authController.register);
authRouter.post('/login', authLimiter, validate(loginSchema), authController.login);
authRouter.post('/refresh', authLimiter, validate(refreshSchema), authController.refresh);
authRouter.post('/logout', requireAuth, validate(logoutSchema), authController.logout);
authRouter.get('/me', requireAuth, authController.me);
