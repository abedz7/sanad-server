import { model, Schema, type HydratedDocument, type InferSchemaType, type Model } from 'mongoose';
import { STATUSES } from './ticket-status.policy.js';

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

// Numeric rank so "sort by priority" is a plain indexed sort instead of an aggregation $switch on
// every list query. Maintained by the pre-validate hook below: every priority write in this codebase
// goes through document.save() (repositories never use update operators for priority), so the two
// fields cannot drift. See docs/DECISIONS.md.
export const PRIORITY_RANK: Record<Priority, number> = { low: 1, medium: 2, high: 3, urgent: 4 };

export const SCAN_STATUSES = ['pending', 'clean', 'skipped'] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export const MAX_ATTACHMENTS_PER_TICKET = 5;

// ObjectIds (and anything Mongoose puts in a ref slot) stringify to the 24-char hex id.
function idOf(value: unknown): string {
  return String(value);
}

// docs/API.md §4.1: UserRef = { id, name, role }. By the time the parent transform runs, a
// populated ref has already been serialised by ITS schema's toJSON (so it carries `id`, not `_id`);
// the raw-ObjectId fallback keeps an unpopulated doc from crashing.
function toUserRef(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && 'name' in value) {
    const populated = value as Record<string, unknown>;
    return {
      id: idOf(populated['id'] ?? populated['_id']),
      name: populated['name'],
      role: populated['role'],
    };
  }
  return { id: idOf(value) };
}

function toCategoryRef(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && 'name' in value) {
    const populated = value as Record<string, unknown>;
    return { id: idOf(populated['id'] ?? populated['_id']), name: populated['name'] };
  }
  return { id: idOf(value) };
}

// Embedded, bounded at 5, always read with the ticket — docs/PLAN.md §4.4.
const attachmentSchema = new Schema(
  {
    originalName: { type: String, required: true, maxlength: 200 },
    // Random storage key; never derived from the original name and never serialised.
    storedKey: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    scanStatus: { type: String, enum: SCAN_STATUSES, required: true, default: 'skipped' },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      // docs/API.md §4.4 — metadata only; storedKey stays server-side.
      transform: (_doc, ret: Record<string, unknown>) => ({
        id: String(ret['_id']),
        originalName: ret['originalName'],
        mimeType: ret['mimeType'],
        size: ret['size'],
        uploadedBy: toUserRef(ret['uploadedBy']),
        scanStatus: ret['scanStatus'],
        createdAt: ret['createdAt'],
      }),
    },
  },
);

// docs/PLAN.md §4.4.
const ticketSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
    description: { type: String, required: true, minlength: 1, maxlength: 5000 },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    priority: { type: String, enum: PRIORITIES, default: 'medium', required: true },
    priorityRank: { type: Number, required: true, default: PRIORITY_RANK.medium },
    status: { type: String, enum: STATUSES, default: 'open', required: true },
    requesterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assigneeId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    attachments: {
      type: [attachmentSchema],
      default: [],
      validate: {
        validator: (value: unknown[]) => value.length <= MAX_ATTACHMENTS_PER_TICKET,
        message: `at most ${MAX_ATTACHMENTS_PER_TICKET} attachments per ticket`,
      },
    },
    // Denormalised for list views (docs/PLAN.md §4.4) — avoids a count query per row.
    commentCount: { type: Number, default: 0, required: true },
    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    lastActivityAt: { type: Date, default: () => new Date(), required: true },
  },
  {
    timestamps: true,
    collection: 'tickets',
    toJSON: {
      // Full Ticket shape from docs/API.md §4.3; list endpoints derive TicketListItem from it.
      transform: (_doc, ret: Record<string, unknown>) => ({
        id: String(ret['_id']),
        title: ret['title'],
        description: ret['description'],
        category: toCategoryRef(ret['categoryId']),
        priority: ret['priority'],
        status: ret['status'],
        requester: toUserRef(ret['requesterId']),
        assignee: toUserRef(ret['assigneeId']),
        attachments: ret['attachments'],
        commentCount: ret['commentCount'],
        lastActivityAt: ret['lastActivityAt'],
        resolvedAt: ret['resolvedAt'],
        closedAt: ret['closedAt'],
        createdAt: ret['createdAt'],
        updatedAt: ret['updatedAt'],
      }),
    },
  },
);

// Keep the sortable rank in lockstep with priority on every document save.
ticketSchema.pre('validate', function syncPriorityRank() {
  this.priorityRank = PRIORITY_RANK[this.priority];
});

// docs/PLAN.md §4.4 indexes. The text index backs admin `q` search — never regex on user input.
ticketSchema.index({ requesterId: 1, lastActivityAt: -1 });
ticketSchema.index({ status: 1, priority: 1, createdAt: -1 });
ticketSchema.index({ categoryId: 1 });
ticketSchema.index({ assigneeId: 1 });
ticketSchema.index({ title: 'text', description: 'text' });

export type Ticket = InferSchemaType<typeof ticketSchema>;
export type TicketDocument = HydratedDocument<Ticket>;
export type TicketAttachment = TicketDocument['attachments'][number];

export const TicketModel: Model<Ticket> = model<Ticket>('Ticket', ticketSchema);

// docs/API.md §4.3 (contract 1.1.0): TicketListItem = Ticket minus description and attachments,
// plus attachmentCount. Derived from toJSON so there is exactly one serialisation to audit.
export function toTicketListItem(doc: TicketDocument): Record<string, unknown> {
  const json = doc.toJSON() as Record<string, unknown>;
  const { description: _description, attachments, ...rest } = json;
  return { ...rest, attachmentCount: Array.isArray(attachments) ? attachments.length : 0 };
}
