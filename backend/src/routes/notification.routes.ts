import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import {
  listNotifications,
  markAllRead,
  markRead,
  unreadCount,
} from '../controllers/notification.controller';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(listNotifications));
router.get('/unread-count', asyncHandler(unreadCount));
router.post('/read-all', asyncHandler(markAllRead));
router.patch('/:id/read', asyncHandler(markRead));

export default router;
