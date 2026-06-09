import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import {
  changePassword,
  forgotPassword,
  login,
  me,
  register,
  resetPassword,
} from '../controllers/auth.controller';

const router = Router();

router.post('/register', asyncHandler(register));
router.post('/login', asyncHandler(login));
router.post('/forgot-password', asyncHandler(forgotPassword));
router.post('/reset-password', asyncHandler(resetPassword));
router.get('/me', authenticate, asyncHandler(me));
router.post('/change-password', authenticate, asyncHandler(changePassword));

export default router;
