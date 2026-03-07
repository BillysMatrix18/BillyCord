import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { messageApi } from '../services/api';
import { Message } from '../types';

interface MessageState {
  messages: Message[];
  loading: boolean;
  hasMore: boolean;
  typingUsers: { userId: string; username: string }[];
}

const initialState: MessageState = {
  messages: [],
  loading: false,
  hasMore: true,
  typingUsers: [],
};

export const fetchMessages = createAsyncThunk(
  'messages/fetch',
  async ({ channelId, before }: { channelId: string; before?: string }) => {
    const response = await messageApi.getMessages(channelId, before);
    return response.data.messages;
  }
);

export const sendMessage = createAsyncThunk(
  'messages/send',
  async ({ channelId, content }: { channelId: string; content: string; tempId?: string }) => {
    const response = await messageApi.send(channelId, content);
    return response.data.message;
  }
);

const messageSlice = createSlice({
  name: 'messages',
  initialState,
  reducers: {
    clearMessages(state) {
      state.messages = [];
      state.hasMore = true;
    },
    addMessage(state, action: PayloadAction<Message>) {
      // Avoid duplicates (also skip if this is our own optimistic message already shown)
      if (!state.messages.find(m => m.id === action.payload.id)) {
        // Check if there's an optimistic version to replace
        const optimisticIdx = state.messages.findIndex(
          m => m.id.startsWith('optimistic-') && m.content === action.payload.content && m.sender_id === action.payload.sender_id
        );
        if (optimisticIdx !== -1) {
          state.messages[optimisticIdx] = action.payload;
        } else {
          state.messages.push(action.payload);
        }
      }
    },
    addOptimisticMessage(state, action: PayloadAction<Message>) {
      state.messages.push(action.payload);
    },
    replaceOptimisticMessage(state, action: PayloadAction<{ tempId: string; message: Message }>) {
      const idx = state.messages.findIndex(m => m.id === action.payload.tempId);
      if (idx !== -1) {
        state.messages[idx] = action.payload.message;
      }
    },
    removeOptimisticMessage(state, action: PayloadAction<string>) {
      state.messages = state.messages.filter(m => m.id !== action.payload);
    },
    updateMessage(state, action: PayloadAction<Message>) {
      const index = state.messages.findIndex(m => m.id === action.payload.id);
      if (index !== -1) {
        state.messages[index] = action.payload;
      }
    },
    removeMessage(state, action: PayloadAction<string>) {
      state.messages = state.messages.filter(m => m.id !== action.payload);
    },
    addTypingUser(state, action: PayloadAction<{ userId: string; username: string }>) {
      if (!state.typingUsers.find(u => u.userId === action.payload.userId)) {
        state.typingUsers.push(action.payload);
      }
    },
    removeTypingUser(state, action: PayloadAction<string>) {
      state.typingUsers = state.typingUsers.filter(u => u.userId !== action.payload);
    },
    addReactionToMessage(state, action: PayloadAction<{ messageId: string; emoji: string; userId: string; username: string }>) {
      const msg = state.messages.find(m => m.id === action.payload.messageId);
      if (msg) {
        if (!msg.reactions) msg.reactions = [];
        // Filter out any null entries from json_group_array
        msg.reactions = msg.reactions.filter(r => r && r.emoji);
        // Avoid duplicate reactions
        const exists = msg.reactions.some(r => r.emoji === action.payload.emoji && r.user_id === action.payload.userId);
        if (!exists) {
          msg.reactions.push({
            emoji: action.payload.emoji,
            user_id: action.payload.userId,
            username: action.payload.username,
          });
        }
      }
    },
    removeReactionFromMessage(state, action: PayloadAction<{ messageId: string; emoji: string; userId: string }>) {
      const msg = state.messages.find(m => m.id === action.payload.messageId);
      if (msg) {
        if (!msg.reactions) msg.reactions = [];
        msg.reactions = msg.reactions.filter(r => r && r.emoji);
        msg.reactions = msg.reactions.filter(
          r => !(r.emoji === action.payload.emoji && r.user_id === action.payload.userId)
        );
      }
    },
    setMessagePinned(state, action: PayloadAction<{ messageId: string; pinned: boolean }>) {
      const msg = state.messages.find(m => m.id === action.payload.messageId);
      if (msg) {
        msg.pinned = action.payload.pinned;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMessages.pending, (state) => { state.loading = true; })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.length < 50) {
          state.hasMore = false;
        }
        // Prepend older messages if loading history, append if fresh load
        if (state.messages.length === 0) {
          state.messages = action.payload;
        } else {
          const newMsgs = action.payload.filter(
            (m: Message) => !state.messages.find(existing => existing.id === m.id)
          );
          state.messages = [...newMsgs, ...state.messages];
        }
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        // Replace optimistic message with server response, or add if not found
        const tempId = action.meta.arg.tempId;
        if (tempId) {
          const idx = state.messages.findIndex(m => m.id === tempId);
          if (idx !== -1) {
            state.messages[idx] = action.payload;
            return;
          }
        }
        if (!state.messages.find(m => m.id === action.payload.id)) {
          state.messages.push(action.payload);
        }
      })
      .addCase(sendMessage.rejected, (state, action) => {
        // Remove optimistic message on failure
        const tempId = action.meta.arg.tempId;
        if (tempId) {
          state.messages = state.messages.filter(m => m.id !== tempId);
        }
      });
  },
});

export const {
  clearMessages, addMessage, updateMessage, removeMessage,
  addTypingUser, removeTypingUser, addReactionToMessage, removeReactionFromMessage,
  setMessagePinned, addOptimisticMessage, replaceOptimisticMessage, removeOptimisticMessage,
} = messageSlice.actions;
export default messageSlice.reducer;
