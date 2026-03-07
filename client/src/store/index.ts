import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import serverReducer from './serverSlice';
import channelReducer from './channelSlice';
import messageReducer from './messageSlice';
import friendReducer from './friendSlice';
import dmReducer from './dmSlice';
import uiReducer from './uiSlice';
import voiceReducer from './voiceSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    servers: serverReducer,
    channels: channelReducer,
    messages: messageReducer,
    friends: friendReducer,
    dm: dmReducer,
    ui: uiReducer,
    voice: voiceReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
