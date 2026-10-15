import { model, Schema, type HydratedDocument, type InferSchemaType, type Model } from 'mongoose';

// Populated authors are serialised by the User schema's toJSON first (so `id`, not `_id`).
function toAuthorRef(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && 'name' in value) {
    const populated = value as Record<string, unknown>;
    return {
      id: String(populated['id'] ?? populated['_id']),
      name: populated['name'],
      role: populated['role'],
    };
  }
  return { id: String(value) };
}

// docs/PLAN.md §4.5 — referenced, not embedded: comments are unbounded per ticket.
const commentSchema = new Schema(
  {
    ticketId: { type: Schema.Types.ObjectId, ref: 'Ticket', required: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, minlength: 1, maxlength: 2000 },
    // Admin-only notes; users never receive these (filtered in the query, never post-hoc).
    isInternal: { type: Boolean, default: false, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'comments',
    toJSON: {
      // docs/API.md §4.5.
      transform: (_doc, ret: Record<string, unknown>) => ({
        id: String(ret['_id']),
        ticketId: String(ret['ticketId']),
        author: toAuthorRef(ret['authorId']),
        body: ret['body'],
        isInternal: ret['isInternal'],
        createdAt: ret['createdAt'],
      }),
    },
  },
);

commentSchema.index({ ticketId: 1, createdAt: 1 });

export type Comment = InferSchemaType<typeof commentSchema>;
export type CommentDocument = HydratedDocument<Comment>;

export const CommentModel: Model<Comment> = model<Comment>('Comment', commentSchema);
