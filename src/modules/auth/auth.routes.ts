import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import {
  loginRegisterLimiter,
  mutatingLimiter,
  refreshLogoutLimiter,
} from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { authController } from './auth.controller.js';
import {
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  updateMeSchema,
} from './auth.schemas.js';

export const authRouter = Router();

// docs/API.md §8: every /auth/* response — success or error — is uncacheable.
authRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

authRouter.post(
  '/register',
  loginRegisterLimiter,
  validate(registerSchema),
  authController.register,
);
authRouter.post('/login', loginRegisterLimiter, validate(loginSchema), authController.login);
authRouter.post('/refresh', refreshLogoutLimiter, validate(refreshSchema), authController.refresh);
// Public by contract 1.1.0 §7.1: possession of the refresh token is the credential, so a client
// whose access token already expired can still end its session server-side.
authRouter.post('/logout', refreshLogoutLimiter, validate(logoutSchema), authController.logout);
authRouter.get('/me', requireAuth, authController.me);
// Rate-limited with the other per-user mutating routes (docs/API.md §7.1).
authRouter.patch(
  '/me',
  requireAuth,
  mutatingLimiter,
  validate(updateMeSchema),
  authController.updateMe,
);
