import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getConversations, createConversation, getDirectMessages, sendDirectMessage,
} from '../controllers/dm';

const router = Router();

router.get('/conversations', authenticate, getConversations);
router.post('/conversations', authenticate, createConversation);
router.get('/conversations/:conversationId/messages', authenticate, getDirectMessages);
router.post('/conversations/:conversationId/messages', authenticate, sendDirectMessage);

export default router;
