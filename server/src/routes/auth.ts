import { Router } from 'express';
import { register, login, refreshToken, getMe, getUserProfile, updateProfile, changePassword } from '../controllers/auth';
import { authenticate } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';

const router = Router();

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/refresh', refreshToken);
router.get('/me', authenticate, getMe);
router.get('/users/:userId', authenticate, getUserProfile);
router.patch('/profile', authenticate, updateProfile);
router.post('/change-password', authenticate, changePassword);

export default router;
