import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { dmApi } from '../services/api';
import { Conversation, DirectMessage } from '../types';

interface DmState {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: DirectMessage[];
  loading: boolean;
}

const initialState: DmState = {
  conversations: [],
  currentConversation: null,
  messages: [],
  loading: false,
};

export const fetchConversations = createAsyncThunk('dm/fetchConversations', async () => {
  const response = await dmApi.getConversations();
  return response.data.conversations;
});

export const fetchDmMessages = createAsyncThunk(
  'dm/fetchMessages',
  async ({ conversationId, before }: { conversationId: string; before?: string }) => {
    const response = await dmApi.getMessages(conversationId, before);
    return response.data.messages;
  }
);

const dmSlice = createSlice({
  name: 'dm',
  initialState,
  reducers: {
    setCurrentConversation(state, action: PayloadAction<Conversation | null>) {
      state.currentConversation = action.payload;
    },
    clearDmMessages(state) {
      state.messages = [];
    },
    addDmMessage(state, action: PayloadAction<DirectMessage>) {
      if (!state.messages.find(m => m.id === action.payload.id)) {
        state.messages.push(action.payload);
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchConversations.fulfilled, (state, action) => {
        state.conversations = action.payload;
      })
      .addCase(fetchDmMessages.pending, (state) => { state.loading = true; })
      .addCase(fetchDmMessages.fulfilled, (state, action) => {
        state.loading = false;
        state.messages = action.payload;
      });
  },
});

export const { setCurrentConversation, clearDmMessages, addDmMessage } = dmSlice.actions;
export default dmSlice.reducer;
