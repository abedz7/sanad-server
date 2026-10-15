import { model, Schema, type HydratedDocument, type InferSchemaType, type Model } from 'mongoose';

export const CLIENTS = ['web', 'mobile'] as const;
export type Client = (typeof CLIENTS)[number];

// docs/PLAN.md §4.2. One document per issued token; a login starts a family and every rotation adds
// a sibling with the same familyId, so reuse detection and logout can revoke the whole session.
const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    familyId: { type: String, required: true, index: true },
    client: { type: String, enum: CLIENTS, required: true },
    // TTL index: Mongo purges expired tokens on its own, so the collection cannot grow unbounded.
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    usedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    userAgent: { type: String, maxlength: 512, default: '' },
    ip: { type: String, maxlength: 64, default: '' },
  },
  {
    timestamps: true,
    collection: 'refresh_tokens',
    // Never serialised to a client; the transform exists so an accidental res.json leaks nothing.
    toJSON: { transform: () => ({}) },
  },
);

export type RefreshToken = InferSchemaType<typeof refreshTokenSchema>;
export type RefreshTokenDocument = HydratedDocument<RefreshToken>;

export const RefreshTokenModel: Model<RefreshToken> = model<RefreshToken>(
  'RefreshToken',
  refreshTokenSchema,
);
