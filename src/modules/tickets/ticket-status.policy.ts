import { env } from '../../config/env.js';

// The status machine from docs/API.md §5, as pure data + two pure functions. Deliberately no
// Mongoose (or any I/O) imports: the whole policy is testable as a table and can never be bypassed
// by a query. Status constants live here (not in the model) so this file stays dependency-free;
// the model imports them from here.
export const STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export type Status = (typeof STATUSES)[number];

export type StatusActor = 'admin' | 'requester';

// docs/API.md §5, one row per edge. Anything absent is TICKET_INVALID_TRANSITION.
const ADMIN_TRANSITIONS: Record<Status, readonly Status[]> = {
  open: ['in_progress', 'closed'],
  in_progress: ['open', 'resolved', 'closed'],
  resolved: ['in_progress', 'closed'], // resolved → open is requester-only
  closed: ['open'],
};

const REQUESTER_TRANSITIONS: Record<Status, readonly Status[]> = {
  open: ['closed'],
  in_progress: ['closed'],
  resolved: ['open', 'closed'],
  closed: ['open'], // only within the reopen window — enforced in canTransition
};

export function canTransition(
  from: Status,
  to: Status,
  actor: StatusActor,
  closedAt?: Date | null,
  now: Date = new Date(),
): boolean {
  const table = actor === 'admin' ? ADMIN_TRANSITIONS : REQUESTER_TRANSITIONS;
  if (!table[from].includes(to)) return false;
  if (actor === 'requester' && from === 'closed') {
    // docs/API.md §5: requester may reopen only within REOPEN_WINDOW_DAYS of closedAt.
    if (!closedAt) return false;
    return now.getTime() - closedAt.getTime() <= env.REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  }
  return true;
}

// For clients that want to render only the legal actions. Not exposed over HTTP in Phase 2;
// exported for tests and future use.
export function allowedTransitions(
  from: Status,
  actor: StatusActor,
  closedAt?: Date | null,
  now: Date = new Date(),
): Status[] {
  return STATUSES.filter((to) => canTransition(from, to, actor, closedAt, now));
}
