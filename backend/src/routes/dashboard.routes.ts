import { Router } from 'express';
import { authenticate, requireStaff } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { getDashboard } from '../controllers/dashboard.controller';

const router = Router();
router.use(authenticate, requireStaff);

router.get('/', asyncHandler(getDashboard));

export default router;
