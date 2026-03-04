import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../src/config/database', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

import { query } from '../src/config/database';

const mockedQuery = query as jest.MockedFunction<typeof query>;

function mockRequest(body: Record<string, unknown> = {}, params: Record<string, string> = {}): any {
  return {
    body,
    params,
    query: {},
    user: { userId: 'user-123', email: 'test@example.com' },
  };
}

function mockResponse(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('Messages Controller', () => {
  let createMessage: any, getMessages: any, deleteMessage: any, addReaction: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const messages = await import('../src/controllers/messages');
    createMessage = messages.createMessage;
    getMessages = messages.getMessages;
    deleteMessage = messages.deleteMessage;
    addReaction = messages.addReaction;
  });

  describe('createMessage', () => {
    it('should create a message with valid content', async () => {
      mockedQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'msg-1',
            channel_id: 'ch-1',
            sender_id: 'user-123',
            content: 'Hello world',
            attachments: [],
            edited: false,
            pinned: false,
            created_at: new Date(),
            updated_at: new Date(),
          }],
          rowCount: 1,
        } as any)
        .mockResolvedValueOnce({
          rows: [{ username: 'testuser', avatar_url: null }],
          rowCount: 1,
        } as any);

      const req = mockRequest({ content: 'Hello world' }, { channelId: 'ch-1' });
      const res = mockResponse();

      await createMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.objectContaining({ content: 'Hello world' }),
        })
      );
    });

    it('should reject empty message', async () => {
      const req = mockRequest({ content: '' }, { channelId: 'ch-1' });
      const res = mockResponse();

      await createMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should reject message exceeding max length', async () => {
      const req = mockRequest({ content: 'a'.repeat(4001) }, { channelId: 'ch-1' });
      const res = mockResponse();

      await createMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('getMessages', () => {
    it('should return messages for a channel', async () => {
      const mockMessages = [
        { id: 'msg-1', content: 'Hello', sender_name: 'user1', reactions: '[]' },
        { id: 'msg-2', content: 'World', sender_name: 'user2', reactions: '[]' },
      ];

      mockedQuery.mockResolvedValueOnce({ rows: mockMessages, rowCount: 2 } as any);

      const req = mockRequest({}, { channelId: 'ch-1' });
      req.query = { limit: '50' };
      const res = mockResponse();

      await getMessages(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ content: 'Hello' }),
          ]),
        })
      );
    });
  });

  describe('deleteMessage', () => {
    it('should allow sender to delete their own message', async () => {
      mockedQuery
        .mockResolvedValueOnce({
          rows: [{ sender_id: 'user-123', server_id: 'srv-1' }],
          rowCount: 1,
        } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      const req = mockRequest({}, { messageId: 'msg-1' });
      const res = mockResponse();

      await deleteMessage(req, res);

      expect(res.json).toHaveBeenCalledWith({ message: 'Message deleted' });
    });

    it('should reject deleting non-existent message', async () => {
      mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const req = mockRequest({}, { messageId: 'non-existent' });
      const res = mockResponse();

      await deleteMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should reject deleting other user message without permissions', async () => {
      mockedQuery
        .mockResolvedValueOnce({
          rows: [{ sender_id: 'other-user', server_id: 'srv-1' }],
          rowCount: 1,
        } as any)
        .mockResolvedValueOnce({
          rows: [{ owner_id: 'another-user' }],
          rowCount: 1,
        } as any);

      const req = mockRequest({}, { messageId: 'msg-1' });
      const res = mockResponse();

      await deleteMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('addReaction', () => {
    it('should add a reaction to a message', async () => {
      mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      const req = mockRequest({ emoji: '👍' }, { messageId: 'msg-1' });
      const res = mockResponse();

      await addReaction(req, res);

      expect(res.json).toHaveBeenCalledWith({ message: 'Reaction added' });
    });

    it('should reject reaction without emoji', async () => {
      const req = mockRequest({}, { messageId: 'msg-1' });
      const res = mockResponse();

      await addReaction(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
