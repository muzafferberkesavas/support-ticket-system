import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import {
  createDepartment,
  deleteDepartment,
  getDepartment,
  listDepartments,
  updateDepartment,
} from '../controllers/department.controller';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(listDepartments));
router.get('/:id', asyncHandler(getDepartment));
router.post('/', requireAdmin, asyncHandler(createDepartment));
router.put('/:id', requireAdmin, asyncHandler(updateDepartment));
router.delete('/:id', requireAdmin, asyncHandler(deleteDepartment));

export default router;
