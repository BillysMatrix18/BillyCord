import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { messageLimiter } from '../middleware/rateLimit';
import {
  getMessages, createMessage, updateMessage, deleteMessage,
  addReaction, removeReaction, pinMessage, getPinnedMessages,
} from '../controllers/messages';

const router = Router();

router.get('/channels/:channelId/messages', authenticate, getMessages);
router.post('/channels/:channelId/messages', authenticate, messageLimiter, createMessage);
router.patch('/messages/:messageId', authenticate, updateMessage);
router.delete('/messages/:messageId', authenticate, deleteMessage);
router.post('/messages/:messageId/reactions', authenticate, addReaction);
router.delete('/messages/:messageId/reactions/:emoji', authenticate, removeReaction);
router.post('/messages/:messageId/pin', authenticate, pinMessage);
router.get('/channels/:channelId/pins', authenticate, getPinnedMessages);

export default router;
