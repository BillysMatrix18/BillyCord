import { createSlice, PayloadAction } from '@reduxjs/toolkit';

type Theme = 'dark' | 'light' | 'super';

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
});

export const {
  setTheme, toggleSettings, toggleCreateServer, toggleJoinServer,
  toggleMemberList, togglePinnedMessages, toggleSidebar, closeAllModals,
  setAnnouncement,
} = uiSlice.actions;
export default uiSlice.reducer;
