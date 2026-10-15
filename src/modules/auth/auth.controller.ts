import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import { env } from '../../config/env.js';
import { ok } from '../../lib/response.js';
import { validated } from '../../middleware/validate.js';
import { loginSchema, logoutSchema, refreshSchema, registerSchema } from './auth.schemas.js';
import { authService, type AuthResult, type RequestContext } from './auth.service.js';

export const REFRESH_COOKIE = 'sanad_rt';

// Scoped to the refresh path so the browser never sends it to any other route, SameSite=Strict so
// a cross-site page cannot trigger a refresh, httpOnly so script cannot read it.
const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: env.COOKIE_SECURE,
  path: '/api/v1/auth/refresh',
};

function contextOf(req: Request): RequestContext {
  return { userAgent: req.get('user-agent') ?? '', ip: req.ip ?? '' };
}

// docs/API.md §7.1: web gets the refresh token only as a cookie, mobile only in the body.
// (Cache-Control: no-store is set router-wide in auth.routes.ts so error responses carry it too.)
function respond(res: Response, result: AuthResult, status: number): void {
  if (result.client === 'web') {
    res.cookie(REFRESH_COOKIE, result.refreshToken, {
      ...cookieOptions,
      maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    });
    ok(res, { user: result.user, accessToken: result.accessToken }, undefined, status);
    return;
  }
  ok(
    res,
    { user: result.user, accessToken: result.accessToken, refreshToken: result.refreshToken },
    undefined,
    status,
  );
}

function presentedRefreshToken(
  req: Request,
  body: { refreshToken?: string | undefined },
): string | undefined {
  const cookies = req.cookies as Record<string, unknown>;
  const fromCookie = cookies[REFRESH_COOKIE];
  return typeof fromCookie === 'string' ? fromCookie : body.refreshToken;
}

export const authController = {
  register: (async (req, res) => {
    const { body } = validated(req, registerSchema);
    respond(res, await authService.register(body, contextOf(req)), 201);
  }) satisfies RequestHandler,

  login: (async (req, res) => {
    const { body } = validated(req, loginSchema);
    respond(res, await authService.login(body, contextOf(req)), 200);
  }) satisfies RequestHandler,

  refresh: (async (req, res) => {
    const { body } = validated(req, refreshSchema);
    const presented = presentedRefreshToken(req, body) ?? '';
    const result = await authService.refresh(presented, contextOf(req));
    respond(res, result, 200);
  }) satisfies RequestHandler,

  logout: (async (req, res) => {
    const { body } = validated(req, logoutSchema);
    await authService.logout(presentedRefreshToken(req, body));
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    res.status(204).end();
  }) satisfies RequestHandler,

  me: (async (req, res) => {
    ok(res, await authService.me(req.user?.id ?? ''));
  }) satisfies RequestHandler,
};
