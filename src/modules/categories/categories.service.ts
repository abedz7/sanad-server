import { AppError } from '../../lib/errors.js';
import {
  categoriesRepository,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from './categories.repository.js';
import type { CategoryDocument } from './category.model.js';

const MONGO_DUPLICATE_KEY = 11000;

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && 'code' in err && err.code === MONGO_DUPLICATE_KEY
  );
}

// Admin listing row: public Category shape + ticketCount + deletedAt (docs/API.md §7.2).
export interface AdminCategoryRow extends Record<string, unknown> {
  ticketCount: number;
  deletedAt: Date | null;
}

export const categoriesService = {
  listActive(): Promise<CategoryDocument[]> {
    return categoriesRepository.listActive();
  },

  async listAdmin(includeDeleted: boolean): Promise<AdminCategoryRow[]> {
    const [categories, counts] = await Promise.all([
      categoriesRepository.listAll(includeDeleted),
      categoriesRepository.countTicketsByCategory(),
    ]);
    return categories.map((category) => ({
      ...(category.toJSON() as unknown as Record<string, unknown>),
      ticketCount: counts[category._id.toString()] ?? 0,
      deletedAt: category.deletedAt ?? null,
    }));
  },

  // The unique partial index is the only duplicate check — a find-then-insert would race.
  async create(input: CreateCategoryInput): Promise<CategoryDocument> {
    try {
      return await categoriesRepository.create(input);
    } catch (err) {
      if (isDuplicateKeyError(err))
        throw new AppError('CONFLICT', { message: 'Category name is already in use' });
      throw err;
    }
  },

  async update(id: string, input: UpdateCategoryInput): Promise<CategoryDocument> {
    let updated: CategoryDocument | null;
    try {
      updated = await categoriesRepository.update(id, input);
    } catch (err) {
      if (isDuplicateKeyError(err))
        throw new AppError('CONFLICT', { message: 'Category name is already in use' });
      throw err;
    }
    if (!updated) throw new AppError('NOT_FOUND');
    return updated;
  },

  async softDelete(id: string): Promise<void> {
    const category = await categoriesRepository.findActiveById(id);
    if (!category) throw new AppError('NOT_FOUND');
    // Any ticket in any status blocks deletion (docs/PLAN.md D5: history must keep resolving).
    if (await categoriesRepository.isReferencedByAnyTicket(id)) {
      throw new AppError('CATEGORY_IN_USE');
    }
    await categoriesRepository.softDelete(id);
  },
};
