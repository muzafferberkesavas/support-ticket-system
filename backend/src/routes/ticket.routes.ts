import { Router } from 'express';
import { authenticate, requireStaff } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { upload } from '../services/upload';
import { uploadAttachments } from '../controllers/attachment.controller';
import {
  addReply,
  assignTicket,
  createTicket,
  deleteTicket,
  escalateTicket,
  getActivity,
  getEstimate,
  getTicket,
  listTickets,
  submitCsat,
  updateTicket,
} from '../controllers/ticket.controller';

const router = Router();

// All ticket routes require authentication.
router.use(authenticate);

// Static path before /:id so it isn't swallowed by the param route.
router.get('/estimate', asyncHandler(getEstimate));

router.get('/', asyncHandler(listTickets));
router.post('/', asyncHandler(createTicket));
router.get('/:id', asyncHandler(getTicket));
router.get('/:id/activity', asyncHandler(getActivity));
router.put('/:id', asyncHandler(updateTicket));
router.delete('/:id', asyncHandler(deleteTicket));
router.patch('/:id/assign', requireStaff, asyncHandler(assignTicket));
router.patch('/:id/escalate', requireStaff, asyncHandler(escalateTicket));
router.post('/:id/attachments', upload.array('files', 5), asyncHandler(uploadAttachments));
router.post('/:id/csat', asyncHandler(submitCsat));
router.post('/:id/replies', asyncHandler(addReply));

export default router;
