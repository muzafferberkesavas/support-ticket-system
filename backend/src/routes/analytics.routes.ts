import { Router } from 'express';
import { authenticate, requireManager } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { getAnalytics } from '../controllers/analytics.controller';

const router = Router();
router.use(authenticate);

router.get('/', requireManager, asyncHandler(getAnalytics));

export default router;
