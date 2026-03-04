import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock database
jest.mock('../src/config/database', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  hash: jest.fn(() => Promise.resolve('$2a$12$hashedpassword')),
  compare: jest.fn(),
}));

// Mock JWT
jest.mock('../src/utils/jwt', () => ({
  generateAccessToken: jest.fn().mockReturnValue('mock-access-token'),
  generateRefreshToken: jest.fn().mockReturnValue('mock-refresh-token'),
  verifyAccessToken: jest.fn(),
  verifyRefreshToken: jest.fn(),
}));

import { query } from '../src/config/database';
import bcrypt from 'bcryptjs';
import { verifyRefreshToken } from '../src/utils/jwt';

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedBcryptCompare = bcrypt.compare as jest.MockedFunction<typeof bcrypt.compare>;
const mockedVerifyRefreshToken = verifyRefreshToken as jest.MockedFunction<typeof verifyRefreshToken>;

// Create mock request/response helpers
function mockRequest(body: Record<string, unknown> = {}, params: Record<string, string> = {}, headers: Record<string, string> = {}): any {
  return {
    body,
    params,
    headers,
    user: null,
  };
}

function mockResponse(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('Auth Controller', () => {
  let register: any, login: any, refreshToken: any, getMe: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const auth = await import('../src/controllers/auth');
    register = auth.register;
    login = auth.login;
    refreshToken = auth.refreshToken;
    getMe = auth.getMe;
  });

  describe('register', () => {
    it('should register a new user with valid data', async () => {
      mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      mockedQuery.mockResolvedValueOnce({
        rows: [{
          id: '123',
          username: 'testuser',
          email: 'test@example.com',
          avatar_url: null,
          bio: null,
          status: 'offline',
          created_at: new Date(),
        }],
        rowCount: 1,
      } as any);

      const req = mockRequest({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      });
      const res = mockResponse();

      await register(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ username: 'testuser' }),
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
        })
      );
    });

    it('should reject registration with invalid email', async () => {
      const req = mockRequest({
        username: 'testuser',
        email: 'invalid-email',
        password: 'password123',
      });
      const res = mockResponse();

      await register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should reject registration with short password', async () => {
      const req = mockRequest({
        username: 'testuser',
        email: 'test@example.com',
        password: '123',
      });
      const res = mockResponse();

      await register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should reject registration with existing email', async () => {
      mockedQuery.mockResolvedValueOnce({ rows: [{ id: '123' }], rowCount: 1 } as any);

      const req = mockRequest({
        username: 'testuser',
        email: 'existing@example.com',
        password: 'password123',
      });
      const res = mockResponse();

      await register(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
    });
  });

  describe('login', () => {
    it('should login with valid credentials', async () => {
      mockedQuery
        .mockResolvedValueOnce({
          rows: [{
            id: '123',
            username: 'testuser',
            email: 'test@example.com',
            password_hash: '$2a$12$hashedpassword',
            avatar_url: null,
            bio: null,
            status: 'offline',
            created_at: new Date(),
          }],
          rowCount: 1,
        } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      mockedBcryptCompare.mockResolvedValueOnce(true as never);

      const req = mockRequest({
        email: 'test@example.com',
        password: 'password123',
      });
      const res = mockResponse();

      await login(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ username: 'testuser' }),
          accessToken: 'mock-access-token',
        })
      );
    });

    it('should reject login with wrong password', async () => {
      mockedQuery.mockResolvedValueOnce({
        rows: [{
          id: '123',
          email: 'test@example.com',
          password_hash: '$2a$12$hashedpassword',
        }],
        rowCount: 1,
      } as any);

      mockedBcryptCompare.mockResolvedValueOnce(false as never);

      const req = mockRequest({
        email: 'test@example.com',
        password: 'wrongpassword',
      });
      const res = mockResponse();

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should reject login with non-existent email', async () => {
      mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const req = mockRequest({
        email: 'nonexistent@example.com',
        password: 'password123',
      });
      const res = mockResponse();

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('refreshToken', () => {
    it('should refresh tokens with valid refresh token', async () => {
      mockedVerifyRefreshToken.mockReturnValueOnce({ userId: '123', email: 'test@example.com' } as never);

      const req = mockRequest({ refreshToken: 'valid-refresh-token' });
      const res = mockResponse();

      await refreshToken(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
        })
      );
    });

    it('should reject with missing refresh token', async () => {
      const req = mockRequest({});
      const res = mockResponse();

      await refreshToken(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('getMe', () => {
    it('should return user profile', async () => {
      mockedQuery.mockResolvedValueOnce({
        rows: [{
          id: '123',
          username: 'testuser',
          email: 'test@example.com',
          avatar_url: null,
          bio: null,
          status: 'online',
          custom_status: null,
          email_verified: false,
          created_at: new Date(),
        }],
        rowCount: 1,
      } as any);

      const req = mockRequest();
      req.user = { userId: '123', email: 'test@example.com' };
      const res = mockResponse();

      await getMe(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ username: 'testuser' }),
        })
      );
    });
  });
});
