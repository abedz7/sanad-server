import { model, Schema, type HydratedDocument, type InferSchemaType, type Model } from 'mongoose';

export const EVENT_TYPES = [
  'created',
  'status_changed',
  'priority_changed',
  'assigned',
  'updated',
  'comment_added',
  'attachment_added',
] as const;
export type TicketEventType = (typeof EVENT_TYPES)[number];

// docs/API.md §4.6: changes is keyed by field with before/after values.
export type EventChanges = Record<string, { from: unknown; to: unknown }>;

// A populated actor is serialised by the User schema's toJSON before this transform runs, so it
// carries `id` rather than `_id`; a raw ObjectId stringifies to the hex id.
function toActorRef(value: unknown): Record<string, unknown> {
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

// docs/PLAN.md §4.6 — the audit log. Append-only by construction: the repository exposes no update
// or delete method, and nothing else is allowed to touch this model.
const ticketEventSchema = new Schema(
  {
    ticketId: { type: Schema.Types.ObjectId, ref: 'Ticket', required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: EVENT_TYPES, required: true },
    changes: { type: Schema.Types.Mixed, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'ticket_events',
    toJSON: {
      // docs/API.md §4.6.
      transform: (_doc, ret: Record<string, unknown>) => ({
        id: String(ret['_id']),
        ticketId: String(ret['ticketId']),
        actor: toActorRef(ret['actorId']),
        type: ret['type'],
        changes: ret['changes'],
        createdAt: ret['createdAt'],
      }),
    },
  },
);

ticketEventSchema.index({ ticketId: 1, createdAt: 1 });

export type TicketEvent = InferSchemaType<typeof ticketEventSchema>;
export type TicketEventDocument = HydratedDocument<TicketEvent>;

export const TicketEventModel: Model<TicketEvent> = model<TicketEvent>(
  'TicketEvent',
  ticketEventSchema,
);
