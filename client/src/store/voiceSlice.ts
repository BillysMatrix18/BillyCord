import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface VoiceParticipant {
  userId: string;
  username: string;
  avatarUrl: string | null;
  socketId: string;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
  latency: number;
}

export interface CallInfo {
  id: string;
  type: 'dm' | 'group' | 'channel';
  status: 'ringing' | 'active' | 'connecting' | 'ended';
  conversationId?: string;
  channelId?: string;
  serverId?: string;
  startTime: number;
  participants: VoiceParticipant[];
}

export interface IncomingCall {
  callId: string;
  callerId: string;
  callerName: string;
  callerAvatar: string | null;
  conversationId?: string;
  callType: 'dm' | 'group';
  timestamp: number;
}

export interface CallHistoryEntry {
  id: string;
  participantNames: string[];
  callType: 'dm' | 'group' | 'channel';
  status: 'completed' | 'missed' | 'declined';
  duration: number;
  timestamp: string;
}

export interface AudioDevice {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
}

interface VoiceState {
  currentCall: CallInfo | null;
  incomingCall: IncomingCall | null;
  isMuted: boolean;
  isDeafened: boolean;
  selectedMicId: string | null;
  selectedSpeakerId: string | null;
  inputVolume: number;
  outputVolume: number;
  noiseSuppression: boolean;
  availableMicrophones: AudioDevice[];
  availableSpeakers: AudioDevice[];
  callHistory: CallHistoryEntry[];
  panelMinimized: boolean;
}

const initialState: VoiceState = {
  currentCall: null,
  incomingCall: null,
  isMuted: false,
  isDeafened: false,
  selectedMicId: localStorage.getItem('voice_mic_id') || null,
  selectedSpeakerId: localStorage.getItem('voice_speaker_id') || null,
  inputVolume: parseInt(localStorage.getItem('voice_input_vol') || '100'),
  outputVolume: parseInt(localStorage.getItem('voice_output_vol') || '100'),
  noiseSuppression: localStorage.getItem('voice_noise_suppress') !== 'false',
  availableMicrophones: [],
  availableSpeakers: [],
  callHistory: [],
  panelMinimized: false,
};

const voiceSlice = createSlice({
  name: 'voice',
  initialState,
  reducers: {
    setCurrentCall(state, action: PayloadAction<CallInfo | null>) {
      state.currentCall = action.payload;
    },
    setCallStatus(state, action: PayloadAction<CallInfo['status']>) {
      if (state.currentCall) state.currentCall.status = action.payload;
    },
    setIncomingCall(state, action: PayloadAction<IncomingCall | null>) {
      state.incomingCall = action.payload;
    },
    addParticipant(state, action: PayloadAction<VoiceParticipant>) {
      if (state.currentCall) {
        const exists = state.currentCall.participants.find(p => p.userId === action.payload.userId);
        if (!exists) state.currentCall.participants.push(action.payload);
      }
    },
    removeParticipant(state, action: PayloadAction<string>) {
      if (state.currentCall) {
        state.currentCall.participants = state.currentCall.participants.filter(p => p.userId !== action.payload);
      }
    },
    updateParticipant(state, action: PayloadAction<{ userId: string; updates: Partial<VoiceParticipant> }>) {
      if (state.currentCall) {
        const p = state.currentCall.participants.find(p => p.userId === action.payload.userId);
        if (p) Object.assign(p, action.payload.updates);
      }
    },
    setMuted(state, action: PayloadAction<boolean>) {
      state.isMuted = action.payload;
    },
    setDeafened(state, action: PayloadAction<boolean>) {
      state.isDeafened = action.payload;
    },
    setSelectedMic(state, action: PayloadAction<string | null>) {
      state.selectedMicId = action.payload;
      if (action.payload) localStorage.setItem('voice_mic_id', action.payload);
    },
    setSelectedSpeaker(state, action: PayloadAction<string | null>) {
      state.selectedSpeakerId = action.payload;
      if (action.payload) localStorage.setItem('voice_speaker_id', action.payload);
    },
    setInputVolume(state, action: PayloadAction<number>) {
      state.inputVolume = action.payload;
      localStorage.setItem('voice_input_vol', String(action.payload));
    },
    setOutputVolume(state, action: PayloadAction<number>) {
      state.outputVolume = action.payload;
      localStorage.setItem('voice_output_vol', String(action.payload));
    },
    setNoiseSuppression(state, action: PayloadAction<boolean>) {
      state.noiseSuppression = action.payload;
      localStorage.setItem('voice_noise_suppress', String(action.payload));
    },
    setAvailableDevices(state, action: PayloadAction<{ microphones: AudioDevice[]; speakers: AudioDevice[] }>) {
      state.availableMicrophones = action.payload.microphones;
      state.availableSpeakers = action.payload.speakers;
    },
    addCallHistory(state, action: PayloadAction<CallHistoryEntry>) {
      state.callHistory.unshift(action.payload);
      if (state.callHistory.length > 100) state.callHistory.pop();
    },
    setCallHistory(state, action: PayloadAction<CallHistoryEntry[]>) {
      state.callHistory = action.payload;
    },
    setPanelMinimized(state, action: PayloadAction<boolean>) {
      state.panelMinimized = action.payload;
    },
    clearCall(state) {
      state.currentCall = null;
      state.isMuted = false;
      state.isDeafened = false;
    },
  },
});

export const {
  setCurrentCall, setCallStatus, setIncomingCall,
  addParticipant, removeParticipant, updateParticipant,
  setMuted, setDeafened, setSelectedMic, setSelectedSpeaker,
  setInputVolume, setOutputVolume, setNoiseSuppression,
  setAvailableDevices, addCallHistory, setCallHistory,
  setPanelMinimized, clearCall,
} = voiceSlice.actions;

export default voiceSlice.reducer;
