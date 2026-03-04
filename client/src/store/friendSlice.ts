import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { friendApi } from '../services/api';
import { Friend } from '../types';

interface FriendState {
  friends: Friend[];
  pendingIncoming: Array<{ id: string; user_id: string; username: string; avatar_url: string | null; created_at: string }>;
  pendingOutgoing: Array<{ id: string; user_id: string; username: string; avatar_url: string | null; created_at: string }>;
  loading: boolean;
}

const initialState: FriendState = {
  friends: [],
  pendingIncoming: [],
  pendingOutgoing: [],
  loading: false,
};

export const fetchFriends = createAsyncThunk('friends/fetchAll', async () => {
  const response = await friendApi.getAll();
  return response.data.friends;
});

export const fetchPendingRequests = createAsyncThunk('friends/fetchPending', async () => {
  const response = await friendApi.getPending();
  return response.data;
});

export const sendFriendRequest = createAsyncThunk(
  'friends/sendRequest',
  async (username: string, { rejectWithValue }) => {
    try {
      await friendApi.sendRequest(username);
      return username;
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      return rejectWithValue(error.response?.data?.error || 'Failed to send request');
    }
  }
);

const friendSlice = createSlice({
  name: 'friends',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchFriends.pending, (state) => { state.loading = true; })
      .addCase(fetchFriends.fulfilled, (state, action) => {
        state.loading = false;
        state.friends = action.payload;
      })
      .addCase(fetchPendingRequests.fulfilled, (state, action) => {
        state.pendingIncoming = action.payload.incoming;
        state.pendingOutgoing = action.payload.outgoing;
      });
  },
});

export default friendSlice.reducer;
