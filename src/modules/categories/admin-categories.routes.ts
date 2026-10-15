import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { adminCategoriesController } from './categories.controller.js';
import {
  adminListCategoriesSchema,
  categoryIdParams,
  createCategorySchema,
  updateCategorySchema,
} from './categories.schemas.js';

// Mounted under /api/v1/admin, which already enforces requireAuth + requireRole('admin').
export const adminCategoriesRouter = Router();

adminCategoriesRouter.get('/', validate(adminListCategoriesSchema), adminCategoriesController.list);
adminCategoriesRouter.post('/', validate(createCategorySchema), adminCategoriesController.create);
adminCategoriesRouter.patch(
  '/:id',
  validate(updateCategorySchema),
  adminCategoriesController.update,
);
adminCategoriesRouter.delete('/:id', validate(categoryIdParams), adminCategoriesController.remove);
