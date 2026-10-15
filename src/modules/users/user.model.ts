import { model, Schema, type HydratedDocument, type InferSchemaType, type Model } from 'mongoose';

export const ROLES = ['user', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

// docs/PLAN.md §4.1. Lockout state lives on the user document: the counter is only ever touched by
// one atomic update per login attempt, and keeping it here avoids a second round trip on the hot path.
const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      unique: true,
    },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    // `select: false` keeps the hash out of every query by default; only the login path opts in.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'user', required: true, index: true },
    failedLoginAttempts: { type: Number, default: 0, required: true },
    lockedUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'users',
    toJSON: {
      // The public User shape from docs/API.md §4.1 — nothing else may leak.
      transform: (_doc, ret: Record<string, unknown>) => ({
        id: String(ret['_id']),
        email: ret['email'],
        name: ret['name'],
        role: ret['role'],
        createdAt: ret['createdAt'],
        updatedAt: ret['updatedAt'],
      }),
    },
  },
);

export type User = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<User>;

export const UserModel: Model<User> = model<User>('User', userSchema);
