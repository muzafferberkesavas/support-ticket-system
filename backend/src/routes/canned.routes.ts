import { Router } from 'express';
import { authenticate, requireStaff } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { createCanned, deleteCanned, listCanned, updateCanned } from '../controllers/canned.controller';

const router = Router();
router.use(authenticate, requireStaff);

router.get('/', asyncHandler(listCanned));
router.post('/', asyncHandler(createCanned));
router.put('/:id', asyncHandler(updateCanned));
router.delete('/:id', asyncHandler(deleteCanned));

export default router;
