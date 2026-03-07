import rateLimit from 'express-rate-limit';

// General API limiter — generous enough that active clients + admin dashboard
// don't get throttled during normal use.
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // was 100 — too low, admin health checks alone exceed that
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for health checks — the admin dashboard polls this every 5s
  skip: (req) => req.path === '/api/health',
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // was 10 — give a bit more room for login retries
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: { error: 'Sending messages too quickly, please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});
