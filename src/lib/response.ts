import type { Response } from 'express';

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// The single success envelope from docs/API.md §1. Controllers never call res.json directly.
export function ok(res: Response, data: unknown, meta?: PageMeta, status = 200): void {
  res.status(status).json(meta ? { data, meta } : { data });
}

export function buildMeta(page: number, limit: number, total: number): PageMeta {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
