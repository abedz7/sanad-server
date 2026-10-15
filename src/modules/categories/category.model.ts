import { model, Schema, type HydratedDocument, type InferSchemaType, type Model } from 'mongoose';

// docs/PLAN.md §4.3. Soft delete: list endpoints filter deletedAt, old tickets keep their reference.
const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'categories',
    toJSON: {
      // docs/API.md §4.2. deletedAt is added manually on the admin listing only.
      transform: (_doc, ret: Record<string, unknown>) => ({
        id: String(ret['_id']),
        name: ret['name'],
        description: ret['description'],
        createdAt: ret['createdAt'],
        updatedAt: ret['updatedAt'],
      }),
    },
  },
);

// Unique only among active categories, so a deleted name can be reused (docs/PLAN.md §4.3).
// MongoDB accepts null equality in a partialFilterExpression and the schema always materialises
// deletedAt (default null), so every active document is covered.
categorySchema.index({ name: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });

export type Category = InferSchemaType<typeof categorySchema>;
export type CategoryDocument = HydratedDocument<Category>;

export const CategoryModel: Model<Category> = model<Category>('Category', categorySchema);
