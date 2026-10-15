import { TicketModel } from '../tickets/ticket.model.js';
import { CategoryModel, type CategoryDocument } from './category.model.js';

export interface CreateCategoryInput {
  name: string;
  description?: string | undefined;
}

export interface UpdateCategoryInput {
  name?: string | undefined;
  description?: string | undefined;
}

export const categoriesRepository = {
  listActive(): Promise<CategoryDocument[]> {
    return CategoryModel.find({ deletedAt: null }).sort({ name: 1 }).exec();
  },

  listAll(includeDeleted: boolean): Promise<CategoryDocument[]> {
    return CategoryModel.find(includeDeleted ? {} : { deletedAt: null })
      .sort({ name: 1 })
      .exec();
  },

  findActiveById(id: string): Promise<CategoryDocument | null> {
    return CategoryModel.findOne({ _id: id, deletedAt: null }).exec();
  },

  create(input: CreateCategoryInput): Promise<CategoryDocument> {
    return CategoryModel.create(input);
  },

  // Scoped to active documents: a deleted category is 404, not editable back to life.
  update(id: string, input: UpdateCategoryInput): Promise<CategoryDocument | null> {
    return CategoryModel.findOneAndUpdate(
      { _id: id, deletedAt: null },
      { $set: input },
      { new: true, runValidators: true },
    ).exec();
  },

  softDelete(id: string): Promise<CategoryDocument | null> {
    return CategoryModel.findOneAndUpdate(
      { _id: id, deletedAt: null },
      { $set: { deletedAt: new Date() } },
      { new: true },
    ).exec();
  },

  // "In use" means any ticket, any status, references it (docs/PLAN.md D5).
  async isReferencedByAnyTicket(categoryId: string): Promise<boolean> {
    const found = await TicketModel.exists({ categoryId }).exec();
    return found !== null;
  },

  // One aggregation for the admin listing: ticket count per category id.
  async countTicketsByCategory(): Promise<Record<string, number>> {
    const rows = await TicketModel.aggregate<{ _id: unknown; count: number }>([
      { $group: { _id: '$categoryId', count: { $sum: 1 } } },
    ]).exec();
    return Object.fromEntries(rows.map((row) => [String(row._id), row.count]));
  },
};
