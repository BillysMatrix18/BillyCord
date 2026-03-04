import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  sendFriendRequest, respondToFriendRequest, getFriends,
  getPendingRequests, removeFriend, blockUser,
} from '../controllers/friends';

const router = Router();

router.post('/request', authenticate, sendFriendRequest);
router.post('/respond/:requestId', authenticate, respondToFriendRequest);
router.get('/', authenticate, getFriends);
router.get('/pending', authenticate, getPendingRequests);
router.delete('/:friendId', authenticate, removeFriend);
router.post('/block/:userId', authenticate, blockUser);

export default router;
