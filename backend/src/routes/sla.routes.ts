import { Router } from 'express';
import { authenticate, requireAdmin, requireManager } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { getSla, updateSla } from '../controllers/sla.controller';

const router = Router();
router.use(authenticate);

router.get('/', requireManager, asyncHandler(getSla));
router.put('/', requireAdmin, asyncHandler(updateSla));

export default router;
