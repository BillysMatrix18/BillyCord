import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  sendFriendRequest, respondToFriendRequest, getFriends,
  getPendingRequests, removeFriend, blockUser, getFriendshipStatus,
} from '../controllers/friends';

const router = Router();

router.post('/request', authenticate, sendFriendRequest);
router.post('/respond/:requestId', authenticate, respondToFriendRequest);
router.get('/', authenticate, getFriends);
router.get('/pending', authenticate, getPendingRequests);
router.get('/status/:userId', authenticate, getFriendshipStatus);
router.delete('/:friendId', authenticate, removeFriend);
router.post('/block/:userId', authenticate, blockUser);

export default router;
