import type { FilterQuery } from 'mongoose';
import { CommentModel, type Comment, type CommentDocument } from './comment.model.js';

export interface CreateCommentInput {
  ticketId: string;
  authorId: string;
  body: string;
  isInternal: boolean;
}

const POPULATE = { path: 'authorId', select: 'name role' };

export const commentsRepository = {
  async create(input: CreateCommentInput): Promise<CommentDocument> {
    const comment = await CommentModel.create(input);
    return comment.populate(POPULATE);
  },

  // Oldest first, fixed (docs/API.md §7.3); _id breaks same-millisecond ties. Internal comments are
  // excluded in the filter itself so they can never leak through a later mapping step.
  async listByTicket(
    ticketId: string,
    options: { includeInternal: boolean; page: number; limit: number },
  ): Promise<{ items: CommentDocument[]; total: number }> {
    const filter: FilterQuery<Comment> = { ticketId };
    if (!options.includeInternal) filter.isInternal = false;
    const [items, total] = await Promise.all([
      CommentModel.find(filter)
        .sort({ createdAt: 1, _id: 1 })
        .skip((options.page - 1) * options.limit)
        .limit(options.limit)
        .populate(POPULATE)
        .exec(),
      CommentModel.countDocuments(filter).exec(),
    ]);
    return { items, total };
  },
};
