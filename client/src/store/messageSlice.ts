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
  async ({ channelId, content }: { channelId: string; content: string }) => {
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
      // Avoid duplicates
      if (!state.messages.find(m => m.id === action.payload.id)) {
        state.messages.push(action.payload);
      }
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
        msg.reactions.push({
          emoji: action.payload.emoji,
          user_id: action.payload.userId,
          username: action.payload.username,
        });
      }
    },
    removeReactionFromMessage(state, action: PayloadAction<{ messageId: string; emoji: string; userId: string }>) {
      const msg = state.messages.find(m => m.id === action.payload.messageId);
      if (msg) {
        msg.reactions = msg.reactions.filter(
          r => !(r.emoji === action.payload.emoji && r.user_id === action.payload.userId)
        );
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
        if (!state.messages.find(m => m.id === action.payload.id)) {
          state.messages.push(action.payload);
        }
      });
  },
});

export const {
  clearMessages, addMessage, updateMessage, removeMessage,
  addTypingUser, removeTypingUser, addReactionToMessage, removeReactionFromMessage,
} = messageSlice.actions;
export default messageSlice.reducer;
