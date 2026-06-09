import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { runDigest } from '../controllers/jobs.controller';

const router = Router();
router.use(authenticate, requireAdmin);

router.post('/digest', asyncHandler(runDigest));

export default router;
