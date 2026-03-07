import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Channel, Category } from '../types';

interface ChannelState {
  channels: Channel[];
  categories: Category[];
  currentChannel: Channel | null;
  unreadChannels: Record<string, number>; // channelId -> unread count
}

const initialState: ChannelState = {
  channels: [],
  categories: [],
  currentChannel: null,
  unreadChannels: {},
};

const channelSlice = createSlice({
  name: 'channels',
  initialState,
  reducers: {
    setChannels(state, action: PayloadAction<Channel[]>) {
      state.channels = action.payload;
    },
    setCategories(state, action: PayloadAction<Category[]>) {
      state.categories = action.payload;
    },
    setCurrentChannel(state, action: PayloadAction<Channel | null>) {
      state.currentChannel = action.payload;
    },
    addChannel(state, action: PayloadAction<Channel>) {
      state.channels.push(action.payload);
    },
    removeChannel(state, action: PayloadAction<string>) {
      state.channels = state.channels.filter(c => c.id !== action.payload);
      if (state.currentChannel?.id === action.payload) {
        state.currentChannel = null;
      }
    },
    incrementChannelUnread(state, action: PayloadAction<string>) {
      state.unreadChannels[action.payload] = (state.unreadChannels[action.payload] || 0) + 1;
    },
    clearChannelUnread(state, action: PayloadAction<string>) {
      delete state.unreadChannels[action.payload];
    },
    clearAllChannelUnreads(state) {
      state.unreadChannels = {};
    },
  },
});

export const { setChannels, setCategories, setCurrentChannel, addChannel, removeChannel, incrementChannelUnread, clearChannelUnread, clearAllChannelUnreads } = channelSlice.actions;
export default channelSlice.reducer;
