import { Router } from 'express';
import { authenticate, requireAdmin, requireStaff } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { runDigest, runExport, downloadExport } from '../controllers/jobs.controller';

const router = Router();
router.use(authenticate);

router.post('/digest', requireAdmin, asyncHandler(runDigest));
router.post('/export', requireStaff, asyncHandler(runExport));
router.post('/export/download', requireStaff, asyncHandler(downloadExport));

export default router;
