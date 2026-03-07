import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { upload, enforceFileSize } from '../middleware/upload';
import {
  getConversations, createConversation, getDirectMessages, sendDirectMessage,
  editDirectMessage, deleteDirectMessage, addDmReaction, removeDmReaction,
  pinDirectMessage, unpinDirectMessage,
  updateConversation, addGroupMember, removeGroupMember, leaveGroup, getGroupMembers,
  markConversationRead,
} from '../controllers/dm';

const router = Router();

router.get('/conversations', authenticate, getConversations);
router.post('/conversations', authenticate, createConversation);
router.get('/conversations/:conversationId/messages', authenticate, getDirectMessages);
router.post('/conversations/:conversationId/messages', authenticate, upload.array('files', 10), enforceFileSize, sendDirectMessage);

// DM message management
router.patch('/messages/:messageId', authenticate, editDirectMessage);
router.delete('/messages/:messageId', authenticate, deleteDirectMessage);
router.post('/messages/:messageId/reactions', authenticate, addDmReaction);
router.delete('/messages/:messageId/reactions/:emoji', authenticate, removeDmReaction);
router.post('/messages/:messageId/pin', authenticate, pinDirectMessage);
router.delete('/messages/:messageId/pin', authenticate, unpinDirectMessage);

// Mark conversation as read
router.post('/conversations/:conversationId/read', authenticate, markConversationRead);

// Group chat management
router.patch('/conversations/:conversationId', authenticate, updateConversation);
router.post('/conversations/:conversationId/members', authenticate, addGroupMember);
router.delete('/conversations/:conversationId/members/:memberId', authenticate, removeGroupMember);
router.post('/conversations/:conversationId/leave', authenticate, leaveGroup);
router.get('/conversations/:conversationId/members', authenticate, getGroupMembers);

export default router;
