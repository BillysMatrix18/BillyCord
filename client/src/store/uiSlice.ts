import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { authApi } from '../services/api';

type Theme = 'dark' | 'light' | 'super' | 'glass' | 'midnight' | 'sunset' | 'forest' | 'sakura';

interface Announcement {
  message: string;
  timestamp: string;
}

interface UiState {
  theme: Theme;
  showSettings: boolean;
  showCreateServer: boolean;
  showJoinServer: boolean;
  showMemberList: boolean;
  showPinnedMessages: boolean;
  sidebarCollapsed: boolean;
  announcement: Announcement | null;
}

const initialState: UiState = {
  theme: (localStorage.getItem('theme') as Theme) || 'dark',
  showSettings: false,
  showCreateServer: false,
  showJoinServer: false,
  showMemberList: true,
  showPinnedMessages: false,
  sidebarCollapsed: false,
  announcement: null,
};

// Save theme to backend (fire-and-forget)
export const setThemeWithSync = createAsyncThunk(
  'ui/setThemeWithSync',
  async (theme: Theme) => {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    try { await authApi.updateProfile({ theme }); } catch { /* ignore if not logged in */ }
    return theme;
  }
);

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setTheme(state, action: PayloadAction<Theme>) {
      state.theme = action.payload;
      localStorage.setItem('theme', action.payload);
    },
    toggleSettings(state) { state.showSettings = !state.showSettings; },
    toggleCreateServer(state) { state.showCreateServer = !state.showCreateServer; },
    toggleJoinServer(state) { state.showJoinServer = !state.showJoinServer; },
    toggleMemberList(state) { state.showMemberList = !state.showMemberList; },
    togglePinnedMessages(state) { state.showPinnedMessages = !state.showPinnedMessages; },
    toggleSidebar(state) { state.sidebarCollapsed = !state.sidebarCollapsed; },
    setAnnouncement(state, action: PayloadAction<Announcement | null>) {
      state.announcement = action.payload;
    },
    closeAllModals(state) {
      state.showSettings = false;
      state.showCreateServer = false;
      state.showJoinServer = false;
      state.showPinnedMessages = false;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(setThemeWithSync.fulfilled, (state, action) => {
      state.theme = action.payload;
    });
  },
});

export const {
  setTheme, toggleSettings, toggleCreateServer, toggleJoinServer,
  toggleMemberList, togglePinnedMessages, toggleSidebar, closeAllModals,
  setAnnouncement,
} = uiSlice.actions;
export default uiSlice.reducer;
