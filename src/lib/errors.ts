// The error catalogue from docs/API.md §2. Every error the API emits must come from here so the
// response shape stays uniform and clients can rely on `code`.
export const ERROR_CATALOGUE = {
  VALIDATION_FAILED: { status: 400, message: 'Request validation failed' },
  AUTH_REQUIRED: { status: 401, message: 'Authentication required' },
  AUTH_INVALID_CREDENTIALS: { status: 401, message: 'Invalid email or password' },
  AUTH_REFRESH_INVALID: { status: 401, message: 'Refresh token is invalid' },
  FORBIDDEN: { status: 403, message: 'You do not have permission to perform this action' },
  NOT_FOUND: { status: 404, message: 'Resource not found' },
  CONFLICT: { status: 409, message: 'Resource already exists' },
  TICKET_INVALID_TRANSITION: { status: 409, message: 'Status transition not allowed' },
  TICKET_CLOSED: { status: 409, message: 'Ticket is closed' },
  TICKET_NOT_EDITABLE: { status: 409, message: 'Ticket can only be edited while open' },
  CATEGORY_IN_USE: { status: 409, message: 'Category is referenced by tickets' },
  CATEGORY_UNAVAILABLE: { status: 409, message: 'Category is not available' },
  UPLOAD_REJECTED: { status: 400, message: 'Upload rejected' },
  RATE_LIMITED: { status: 429, message: 'Too many requests' },
  INTERNAL: { status: 500, message: 'Internal server error' },
} as const satisfies Record<string, { status: number; message: string }>;

export type ErrorCode = keyof typeof ERROR_CATALOGUE;

export interface ErrorDetail {
  path: string;
  message: string;
}

interface AppErrorOptions {
  message?: string;
  details?: ErrorDetail[];
  // UPLOAD_REJECTED is the only code whose status varies (400 / 413 / 415).
  status?: number;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: ErrorDetail[] | undefined;

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    const entry = ERROR_CATALOGUE[code];
    super(options.message ?? entry.message);
    this.name = 'AppError';
    this.code = code;
    this.status = options.status ?? entry.status;
    this.details = options.details;
  }
}
