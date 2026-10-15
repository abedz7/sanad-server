import { Router } from 'express';
import { categoriesController } from './categories.controller.js';

// Mounted at /api/v1/categories behind requireAuth (src/routes/index.ts).
export const categoriesRouter = Router();

categoriesRouter.get('/', categoriesController.list);
