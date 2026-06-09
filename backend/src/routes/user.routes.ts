import { Router } from 'express';
import { authenticate, requireAdmin, requireStaff } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { createUser, deleteUser, listUsers, updateUser } from '../controllers/user.controller';

const router = Router();
router.use(authenticate);

router.get('/', requireStaff, asyncHandler(listUsers));
router.post('/', requireAdmin, asyncHandler(createUser));
router.put('/:id', requireAdmin, asyncHandler(updateUser));
router.delete('/:id', requireAdmin, asyncHandler(deleteUser));

export default router;
