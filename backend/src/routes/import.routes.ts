import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { uploadImport, previewImport, getPreview, confirmImport } from '../controllers/import.controller';

// Toplu içe aktarım — yalnızca admin. Akış: upload→önizleme, onay→worker.
const router = Router();
router.use(authenticate, requireAdmin);

router.post('/:entity', uploadImport.single('file'), asyncHandler(previewImport));
router.get('/:importId', asyncHandler(getPreview));
router.post('/:importId/confirm', asyncHandler(confirmImport));

export default router;
