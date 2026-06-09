import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { deleteAttachment, downloadAttachment } from '../controllers/attachment.controller';

const router = Router();
router.use(authenticate);

router.get('/:id', asyncHandler(downloadAttachment));
router.delete('/:id', asyncHandler(deleteAttachment));

export default router;
