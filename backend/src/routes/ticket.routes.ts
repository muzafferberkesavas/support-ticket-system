import { Router } from 'express';
import { authenticate, requireStaff } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { upload } from '../services/upload';
import { uploadAttachments } from '../controllers/attachment.controller';
import {
  addReply,
  assignTicket,
  bulkUpdate,
  createTicket,
  deleteTicket,
  escalateTicket,
  getActivity,
  getEstimate,
  getTicket,
  listTags,
  listTickets,
  reopenTicket,
  submitCsat,
  updateTicket,
} from '../controllers/ticket.controller';

const router = Router();

// All ticket routes require authentication.
router.use(authenticate);

// Static paths before /:id so they aren't swallowed by the param route.
router.get('/estimate', asyncHandler(getEstimate));
router.get('/tags', asyncHandler(listTags));

router.get('/', asyncHandler(listTickets));
router.post('/', asyncHandler(createTicket));
router.post('/bulk', requireStaff, asyncHandler(bulkUpdate));
router.get('/:id', asyncHandler(getTicket));
router.get('/:id/activity', asyncHandler(getActivity));
router.put('/:id', asyncHandler(updateTicket));
router.delete('/:id', asyncHandler(deleteTicket));
router.patch('/:id/assign', requireStaff, asyncHandler(assignTicket));
router.patch('/:id/escalate', requireStaff, asyncHandler(escalateTicket));
router.post('/:id/reopen', asyncHandler(reopenTicket));
router.post('/:id/attachments', upload.array('files', 5), asyncHandler(uploadAttachments));
router.post('/:id/csat', asyncHandler(submitCsat));
router.post('/:id/replies', asyncHandler(addReply));

export default router;
