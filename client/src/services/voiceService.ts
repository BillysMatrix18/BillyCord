import { getSocket } from './socket';
import { store } from '../store';
import {
  setCurrentCall, setCallStatus, setIncomingCall,
  addParticipant, removeParticipant, updateParticipant,
  setMuted, setDeafened, setAvailableDevices,
  addCallHistory, clearCall, CallInfo, VoiceParticipant,
} from '../store/voiceSlice';

const LOG_PREFIX = '[VoiceService]';
function log(...args: unknown[]) { console.log(LOG_PREFIX, ...args); }
function logError(...args: unknown[]) { console.error(LOG_PREFIX, ...args); }

// Simple toast notification system
function showCallError(message: string) {
  logError('Call Error:', message);
  window.dispatchEvent(new CustomEvent('voice:error', { detail: { message } }));
}

function showCallInfo(message: string) {
  log('Call Info:', message);
  window.dispatchEvent(new CustomEvent('voice:info', { detail: { message } }));
}

// ─── Microphone Permission System ───
// Uses localStorage to remember user's choice across sessions

export function getMicPermissionStatus(): 'granted' | 'unknown' {
  return localStorage.getItem('micPermissionGranted') === 'true' ? 'granted' : 'unknown';
}

export async function checkMicPermission(): Promise<'granted' | 'unknown'> {
  const saved = localStorage.getItem('micPermissionGranted');
  if (saved === 'true') {
    log('Mic permission previously granted (localStorage)');
    return 'granted';
  }
  // Try Permissions API as a secondary check
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (result.state === 'granted') {
        localStorage.setItem('micPermissionGranted', 'true');
        log('Mic permission already granted (Permissions API)');
        return 'granted';
      }
    }
  } catch {
    // Permissions API not supported
  }
  return 'unknown';
}

export async function requestMicPermission(): Promise<boolean> {
  log('Requesting microphone permission...');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    localStorage.setItem('micPermissionGranted', 'true');
    log('Microphone permission granted');
    window.dispatchEvent(new CustomEvent('voice:mic-permission-changed', { detail: { status: 'granted' } }));
    return true;
  } catch (err) {
    logError('Microphone permission denied:', err);
    window.dispatchEvent(new CustomEvent('voice:mic-permission-changed', { detail: { status: 'denied' } }));
    return false;
  }
}

// Show the permission dialog via event
function showMicPermissionDialog() {
  log('Showing mic permission dialog');
  window.dispatchEvent(new CustomEvent('voice:show-mic-dialog'));
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

let localStream: MediaStream | null = null;
const peerConnections = new Map<string, RTCPeerConnection>();
const audioElements = new Map<string, HTMLAudioElement>();
let callDurationTimer: ReturnType<typeof setInterval> | null = null;
let ringtoneAudio: HTMLAudioElement | null = null;
let missedCallTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

// Voice activity detection
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let vadTimer: ReturnType<typeof setInterval> | null = null;

function getState() { return store.getState().voice; }
function dispatch(action: Parameters<typeof store.dispatch>[0]) { store.dispatch(action); }

// ─── Device Enumeration ───
export async function enumerateDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const microphones = devices
      .filter(d => d.kind === 'audioinput' && d.deviceId)
      .map(d => ({ deviceId: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 5)}`, kind: 'audioinput' as const }));
    const speakers = devices
      .filter(d => d.kind === 'audiooutput' && d.deviceId)
      .map(d => ({ deviceId: d.deviceId, label: d.label || `Speaker ${d.deviceId.slice(0, 5)}`, kind: 'audiooutput' as const }));
    dispatch(setAvailableDevices({ microphones, speakers }));
    log('Devices enumerated:', microphones.length, 'mics,', speakers.length, 'speakers');
  } catch (e) {
    logError('Failed to enumerate devices:', e);
  }
}

// ─── Get Microphone Stream ───
async function getMicrophoneStream(deviceId?: string | null): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: getState().noiseSuppression,
      autoGainControl: true,
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    },
    video: false,
  };
  log('Requesting microphone with constraints:', JSON.stringify(constraints));
  return navigator.mediaDevices.getUserMedia(constraints);
}

// ─── Peer Connection ───
function createPeerConnection(targetSocketId: string, targetUserId: string): RTCPeerConnection {
  const socket = getSocket();
  const pc = new RTCPeerConnection(ICE_SERVERS);
  log('Creating peer connection to:', targetSocketId, 'userId:', targetUserId);

  pc.onicecandidate = (event) => {
    if (event.candidate && socket) {
      log('Sending ICE candidate to:', targetSocketId);
      socket.emit('voice:ice-candidate', { targetSocketId, candidate: event.candidate });
    }
  };

  pc.ontrack = (event) => {
    log('Remote track received from:', targetSocketId);
    let audio = audioElements.get(targetSocketId);
    if (!audio) {
      audio = new Audio();
      audio.autoplay = true;
      audioElements.set(targetSocketId, audio);
    }
    audio.srcObject = event.streams[0];
    // Apply output volume
    audio.volume = getState().outputVolume / 100;
    // Apply speaker selection
    const speakerId = getState().selectedSpeakerId;
    if (speakerId && 'setSinkId' in audio) {
      (audio as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(speakerId).catch(() => {});
    }
  };

  pc.onconnectionstatechange = () => {
    log('Peer connection state:', pc.connectionState, 'for:', targetSocketId);
    if (pc.connectionState === 'connected') {
      dispatch(updateParticipant({ userId: targetUserId, updates: { latency: 0 } }));
    }
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      dispatch(updateParticipant({ userId: targetUserId, updates: { latency: -1 } }));
    }
  };

  pc.oniceconnectionstatechange = () => {
    log('ICE connection state:', pc.iceConnectionState, 'for:', targetSocketId);
  };

  // Add local tracks
  if (localStream) {
    localStream.getTracks().forEach(track => {
      log('Adding local track:', track.kind, 'enabled:', track.enabled);
      pc.addTrack(track, localStream!);
    });
  } else {
    logError('No local stream when creating peer connection!');
  }

  peerConnections.set(targetSocketId, pc);
  return pc;
}

// ─── Voice Activity Detection ───
function startVAD() {
  if (!localStream) return;
  try {
    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.4;
    const source = audioContext.createMediaStreamSource(localStream);
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    vadTimer = setInterval(() => {
      if (!analyser) return;
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      const speaking = avg > 15;
      const state = getState();
      const userId = store.getState().auth.user?.id;
      if (userId && state.currentCall) {
        const me = state.currentCall.participants.find(p => p.userId === userId);
        if (me && me.speaking !== speaking) {
          dispatch(updateParticipant({ userId, updates: { speaking } }));
        }
      }
    }, 100);
    log('VAD started');
  } catch (e) {
    logError('VAD setup failed:', e);
  }
}

function stopVAD() {
  if (vadTimer) clearInterval(vadTimer);
  vadTimer = null;
  if (audioContext) { audioContext.close().catch(() => {}); audioContext = null; }
  analyser = null;
}

// ─── WebRTC signaling for DM/group calls ───
let callSignalingAttached = false;

function attachCallSignaling() {
  const socket = getSocket();
  if (!socket) {
    logError('attachCallSignaling: No socket available');
    return;
  }
  if (callSignalingAttached) {
    log('attachCallSignaling: Already attached, skipping');
    return;
  }
  callSignalingAttached = true;
  log('Attaching call signaling listeners');

  socket.on('voice:offer', async (data: { offer: RTCSessionDescriptionInit; senderSocketId: string; userId: string }) => {
    // Only handle if we're in a DM/group call
    const state = getState();
    log('Received voice:offer from:', data.senderSocketId, 'userId:', data.userId, 'currentCall:', state.currentCall?.id, 'type:', state.currentCall?.type);
    if (!state.currentCall || state.currentCall.type === 'channel') {
      log('Ignoring voice:offer - not in DM/group call');
      return;
    }
    try {
      const pc = createPeerConnection(data.senderSocketId, data.userId);
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      log('Sending voice:answer to:', data.senderSocketId);
      socket.emit('voice:answer', { targetSocketId: data.senderSocketId, answer });
    } catch (e) {
      logError('Error handling voice:offer:', e);
    }
  });

  socket.on('voice:answer', async (data: { answer: RTCSessionDescriptionInit; senderSocketId: string }) => {
    const state = getState();
    log('Received voice:answer from:', data.senderSocketId);
    if (!state.currentCall || state.currentCall.type === 'channel') return;
    try {
      const pc = peerConnections.get(data.senderSocketId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        log('Set remote description for answer from:', data.senderSocketId);
      } else {
        logError('No peer connection found for:', data.senderSocketId);
      }
    } catch (e) {
      logError('Error handling voice:answer:', e);
    }
  });

  socket.on('voice:ice-candidate', async (data: { candidate: RTCIceCandidateInit; senderSocketId: string }) => {
    const state = getState();
    if (!state.currentCall || state.currentCall.type === 'channel') return;
    try {
      const pc = peerConnections.get(data.senderSocketId);
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    } catch (e) {
      logError('Error handling voice:ice-candidate:', e);
    }
  });
}

function detachCallSignaling() {
  const socket = getSocket();
  if (!socket || !callSignalingAttached) return;
  callSignalingAttached = false;
  socket.off('voice:offer');
  socket.off('voice:answer');
  socket.off('voice:ice-candidate');
  log('Detached call signaling listeners');
}

// ─── Socket Event Listeners ───
let listenersAttached = false;

export function attachVoiceListeners() {
  const socket = getSocket();
  if (!socket) {
    logError('attachVoiceListeners: No socket available! Socket is null.');
    return;
  }

  // Reset the flag on reconnection - if socket changed, re-attach
  if (listenersAttached) {
    log('attachVoiceListeners: Already attached, skipping');
    return;
  }
  listenersAttached = true;
  log('Attaching voice listeners. Socket connected:', socket.connected, 'Socket ID:', socket.id);

  // Incoming call notification
  socket.on('voice:call:incoming', (data: {
    callId: string; callerId: string; callerName: string;
    callerAvatar: string | null; conversationId?: string; callType: 'dm' | 'group';
  }) => {
    log('Received voice:call:incoming', data);
    // Don't show if already in a call
    if (getState().currentCall) {
      log('Already in a call, ignoring incoming call');
      return;
    }
    dispatch(setIncomingCall({
      callId: data.callId,
      callerId: data.callerId,
      callerName: data.callerName,
      callerAvatar: data.callerAvatar,
      conversationId: data.conversationId,
      callType: data.callType,
      timestamp: Date.now(),
    }));
    // Play ringtone
    playRingtone();
    // Auto-dismiss after 60s
    missedCallTimer = setTimeout(() => {
      const state = getState();
      if (state.incomingCall?.callId === data.callId) {
        rejectCall();
      }
    }, 60000);
  });

  // Call accepted by the other side
  socket.on('voice:call:accepted', async (data: { callId: string; userId: string; username: string; socketId: string; avatarUrl: string | null }) => {
    log('Received voice:call:accepted', data);
    stopRingtone();
    dispatch(setCallStatus('active'));
    dispatch(addParticipant({
      userId: data.userId,
      username: data.username,
      avatarUrl: data.avatarUrl,
      socketId: data.socketId,
      muted: false,
      deafened: false,
      speaking: false,
      latency: 0,
    }));
    // Create WebRTC offer to the accepted user
    try {
      const pc = createPeerConnection(data.socketId, data.userId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      log('Sending voice:offer to accepted user:', data.socketId);
      socket.emit('voice:offer', { targetSocketId: data.socketId, offer });
      showCallInfo('Call connected!');
    } catch (e) {
      logError('Error creating offer for accepted user:', e);
      showCallError('Failed to establish connection');
    }
  });

  // Call rejected
  socket.on('voice:call:rejected', (data: { callId: string; reason?: string }) => {
    log('Received voice:call:rejected', data);
    stopRingtone();
    if (getState().currentCall?.id === data.callId) {
      const call = getState().currentCall;
      if (call) {
        dispatch(addCallHistory({
          id: call.id,
          participantNames: call.participants.map(p => p.username),
          callType: call.type as 'dm' | 'group' | 'channel',
          status: data.reason === 'missed' ? 'missed' : 'declined',
          duration: 0,
          timestamp: new Date().toISOString(),
        }));
      }
      dispatch(clearCall());
      showCallInfo(data.reason === 'missed' ? 'Call not answered' : 'Call declined');
    }
    // Also clear incoming call if we're rejecting
    if (getState().incomingCall?.callId === data.callId) {
      dispatch(setIncomingCall(null));
    }
  });

  // Call ended
  socket.on('voice:call:ended', (data: { callId: string }) => {
    log('Received voice:call:ended', data);
    stopRingtone();
    if (getState().currentCall?.id === data.callId) {
      showCallInfo('Call ended');
      endCallCleanup();
    }
  });

  // Participant joined (group/channel)
  socket.on('voice:call:participant-joined', (data: { callId: string; userId: string; username: string; socketId: string; avatarUrl: string | null }) => {
    log('Received voice:call:participant-joined', data);
    if (getState().currentCall?.id !== data.callId) return;
    dispatch(addParticipant({
      userId: data.userId,
      username: data.username,
      avatarUrl: data.avatarUrl,
      socketId: data.socketId,
      muted: false,
      deafened: false,
      speaking: false,
      latency: 0,
    }));
    // Create offer to new participant
    try {
      const pc = createPeerConnection(data.socketId, data.userId);
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        socket.emit('voice:offer', { targetSocketId: data.socketId, offer });
      });
    } catch (e) {
      logError('Error creating offer for new participant:', e);
    }
  });

  // Participant left
  socket.on('voice:call:participant-left', (data: { userId: string; socketId: string }) => {
    log('Received voice:call:participant-left', data);
    dispatch(removeParticipant(data.userId));
    cleanupPeer(data.socketId);
  });

  // Mute status
  socket.on('voice:call:mute-status', (data: { userId: string; muted: boolean }) => {
    dispatch(updateParticipant({ userId: data.userId, updates: { muted: data.muted } }));
  });

  // Deafen status
  socket.on('voice:call:deafen-status', (data: { userId: string; deafened: boolean }) => {
    dispatch(updateParticipant({ userId: data.userId, updates: { deafened: data.deafened } }));
  });

  // Server error responses
  socket.on('voice:call:error', (data: { message: string }) => {
    logError('Server voice call error:', data.message);
    showCallError(data.message);
  });

  // Call history update from server
  socket.on('voice:call:history', (data: { history: Array<{ id: string; participant_names: string; call_type: string; status: string; duration: number; created_at: string }> }) => {
    void data;
  });
}

export function detachVoiceListeners() {
  const socket = getSocket();
  if (!socket) return;
  listenersAttached = false;
  callSignalingAttached = false;
  socket.off('voice:call:incoming');
  socket.off('voice:call:accepted');
  socket.off('voice:call:rejected');
  socket.off('voice:call:ended');
  socket.off('voice:call:participant-joined');
  socket.off('voice:call:participant-left');
  socket.off('voice:call:mute-status');
  socket.off('voice:call:deafen-status');
  socket.off('voice:call:error');
  socket.off('voice:call:history');
  socket.off('voice:offer');
  socket.off('voice:answer');
  socket.off('voice:ice-candidate');
  log('Detached all voice listeners');
}

// Reset listeners flag (needed for reconnection)
export function resetListenersFlag() {
  listenersAttached = false;
  callSignalingAttached = false;
  log('Reset voice listener flags for reconnection');
}

// ─── Call Actions ───

export async function initiateCall(conversationId: string, callType: 'dm' | 'group') {
  log('initiateCall called with:', { conversationId, callType });

  const socket = getSocket();
  if (!socket) {
    showCallError('Not connected to server. Please check your connection.');
    logError('initiateCall: Socket is null');
    return;
  }

  if (!socket.connected) {
    showCallError('Not connected to server. Reconnecting...');
    logError('initiateCall: Socket exists but not connected. State:', socket.connected);
    return;
  }

  log('Socket state - connected:', socket.connected, 'id:', socket.id);

  if (getState().currentCall) {
    showCallError('Already in a call. Please end the current call first.');
    logError('initiateCall: Already in a call:', getState().currentCall?.id);
    return;
  }

  if (!conversationId) {
    showCallError('No conversation selected.');
    logError('initiateCall: No conversationId');
    return;
  }

  // Check microphone permission - show dialog if not yet granted
  const micStatus = await checkMicPermission();
  if (micStatus !== 'granted') {
    log('Mic permission not yet granted, showing dialog');
    showMicPermissionDialog();
    return;
  }

  // Get microphone access
  try {
    log('Requesting microphone access...');
    localStream = await getMicrophoneStream(getState().selectedMicId);
    log('Microphone access granted. Tracks:', localStream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, label: t.label })));
    await enumerateDevices();
    startVAD();
  } catch (err) {
    logError('Microphone access failed:', err);
    // Permission was granted before but now failed - could be device issue
    showCallError('Could not access microphone. Check your device connection.');
    return;
  }

  const callId = `call-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const user = store.getState().auth.user;

  if (!user) {
    showCallError('Not logged in.');
    logError('initiateCall: No user in auth state');
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    return;
  }

  log('Emitting voice:call:initiate', { callId, conversationId, callType, callerName: user.username });

  // Set up a response listener for server acknowledgment
  const initTimeout = setTimeout(() => {
    log('Call initiation timeout - no response from server after 10s');
    const state = getState();
    if (state.currentCall?.id === callId && state.currentCall.status === 'ringing') {
      // Check if we at least got the call set up
      log('Call is still ringing, server may have processed but no one answered yet');
    }
  }, 10000);

  socket.emit('voice:call:initiate', {
    callId,
    conversationId,
    callType,
    callerName: user.username,
    callerAvatar: user.avatar_url,
  });

  const callInfo: CallInfo = {
    id: callId,
    type: callType,
    status: 'ringing',
    conversationId,
    startTime: Date.now(),
    participants: [{
      userId: user.id || '',
      username: user.username || '',
      avatarUrl: user.avatar_url || null,
      socketId: socket.id || '',
      muted: false,
      deafened: false,
      speaking: false,
      latency: 0,
    }],
  };

  dispatch(setCurrentCall(callInfo));
  attachCallSignaling();
  playRingtone();
  showCallInfo('Calling...');

  log('Call initiated successfully. Call ID:', callId, 'Redux state updated.');

  // Timeout after 60s if not accepted
  missedCallTimer = setTimeout(() => {
    clearTimeout(initTimeout);
    const state = getState();
    if (state.currentCall?.id === callId && state.currentCall.status === 'ringing') {
      log('Call timeout - no answer after 60s');
      socket.emit('voice:call:end', { callId, reason: 'timeout' });
      stopRingtone();
      dispatch(addCallHistory({
        id: callId,
        participantNames: [],
        callType,
        status: 'missed',
        duration: 0,
        timestamp: new Date().toISOString(),
      }));
      endCallCleanup();
      showCallInfo('No answer');
    }
  }, 60000);
}

export async function acceptCall() {
  log('acceptCall called');
  const socket = getSocket();
  const incoming = getState().incomingCall;

  if (!socket) {
    showCallError('Not connected to server.');
    logError('acceptCall: Socket is null');
    return;
  }
  if (!incoming) {
    showCallError('No incoming call to accept.');
    logError('acceptCall: No incoming call');
    return;
  }

  log('Accepting call:', incoming.callId);
  stopRingtone();
  if (missedCallTimer) { clearTimeout(missedCallTimer); missedCallTimer = null; }

  // Check mic permission
  const micStatus = await checkMicPermission();
  if (micStatus !== 'granted') {
    showMicPermissionDialog();
    return;
  }

  try {
    log('Requesting microphone access for accepting call...');
    localStream = await getMicrophoneStream(getState().selectedMicId);
    log('Microphone access granted for accepting call');
    await enumerateDevices();
    startVAD();
  } catch (err) {
    logError('Mic access failed on accept:', err);
    showCallError('Could not access microphone. Check your device connection.');
    dispatch(setIncomingCall(null));
    return;
  }

  const user = store.getState().auth.user;

  log('Emitting voice:call:accept', { callId: incoming.callId, userId: user?.id, username: user?.username });
  socket.emit('voice:call:accept', {
    callId: incoming.callId,
    userId: user?.id,
    username: user?.username,
    avatarUrl: user?.avatar_url,
  });

  const callInfo: CallInfo = {
    id: incoming.callId,
    type: incoming.callType,
    status: 'active',
    conversationId: incoming.conversationId,
    startTime: Date.now(),
    participants: [{
      userId: user?.id || '',
      username: user?.username || '',
      avatarUrl: user?.avatar_url || null,
      socketId: socket.id || '',
      muted: false,
      deafened: false,
      speaking: false,
      latency: 0,
    }],
  };

  dispatch(setCurrentCall(callInfo));
  dispatch(setIncomingCall(null));
  attachCallSignaling();

  // Start heartbeat
  startHeartbeat(incoming.callId);
  showCallInfo('Call connected!');
  log('Call accepted successfully');
}

export function rejectCall() {
  log('rejectCall called');
  const socket = getSocket();
  const incoming = getState().incomingCall;
  if (!socket || !incoming) {
    log('rejectCall: No socket or no incoming call');
    return;
  }

  stopRingtone();
  if (missedCallTimer) { clearTimeout(missedCallTimer); missedCallTimer = null; }

  log('Emitting voice:call:reject', { callId: incoming.callId });
  socket.emit('voice:call:reject', { callId: incoming.callId });
  dispatch(setIncomingCall(null));
}

export function endCall() {
  log('endCall called');
  const socket = getSocket();
  const call = getState().currentCall;
  if (!socket || !call) {
    log('endCall: No socket or no current call');
    return;
  }

  log('Emitting voice:call:end', { callId: call.id });
  socket.emit('voice:call:end', { callId: call.id });

  const duration = Math.floor((Date.now() - call.startTime) / 1000);
  dispatch(addCallHistory({
    id: call.id,
    participantNames: call.participants.map(p => p.username),
    callType: call.type as 'dm' | 'group' | 'channel',
    status: 'completed',
    duration,
    timestamp: new Date().toISOString(),
  }));

  endCallCleanup();
}

function endCallCleanup() {
  log('endCallCleanup called');
  stopRingtone();
  stopVAD();
  detachCallSignaling();

  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
    log('Local stream stopped');
  }

  peerConnections.forEach((pc, id) => {
    log('Closing peer connection:', id);
    pc.close();
  });
  peerConnections.clear();

  audioElements.forEach(audio => { audio.srcObject = null; });
  audioElements.clear();

  if (callDurationTimer) { clearInterval(callDurationTimer); callDurationTimer = null; }
  if (missedCallTimer) { clearTimeout(missedCallTimer); missedCallTimer = null; }
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }

  dispatch(clearCall());
  log('Call cleanup complete');
}

function cleanupPeer(socketId: string) {
  const pc = peerConnections.get(socketId);
  if (pc) { pc.close(); peerConnections.delete(socketId); }
  const audio = audioElements.get(socketId);
  if (audio) { audio.srcObject = null; audioElements.delete(socketId); }
}

// ─── Mute/Deafen ───

export function toggleMute() {
  const socket = getSocket();
  const state = getState();
  if (!localStream) {
    log('toggleMute: No local stream');
    return;
  }

  const track = localStream.getAudioTracks()[0];
  if (!track) {
    log('toggleMute: No audio track');
    return;
  }

  const newMuted = !state.isMuted;
  track.enabled = !newMuted;
  dispatch(setMuted(newMuted));
  log('Mute toggled:', newMuted);

  if (socket && state.currentCall) {
    socket.emit('voice:call:mute-toggle', { callId: state.currentCall.id, muted: newMuted });
  }
}

export function toggleDeafen() {
  const socket = getSocket();
  const state = getState();
  const newDeafened = !state.isDeafened;
  dispatch(setDeafened(newDeafened));
  audioElements.forEach(audio => { audio.muted = newDeafened; });
  log('Deafen toggled:', newDeafened);

  if (socket && state.currentCall) {
    socket.emit('voice:call:deafen-toggle', { callId: state.currentCall.id, deafened: newDeafened });
  }
}

// ─── Device Switching ───

export async function switchMicrophone(deviceId: string) {
  if (!localStream) return;
  try {
    const newStream = await getMicrophoneStream(deviceId);
    const newTrack = newStream.getAudioTracks()[0];

    // Replace track in all peer connections
    peerConnections.forEach(pc => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
      if (sender) sender.replaceTrack(newTrack);
    });

    // Stop old stream tracks
    localStream.getTracks().forEach(t => t.stop());
    localStream = newStream;

    // Re-setup VAD
    stopVAD();
    startVAD();

    store.dispatch({ type: 'voice/setSelectedMic', payload: deviceId });
    log('Switched microphone to:', deviceId);
  } catch (e) {
    logError('Failed to switch microphone:', e);
  }
}

export function switchSpeaker(deviceId: string) {
  audioElements.forEach(audio => {
    if ('setSinkId' in audio) {
      (audio as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId).catch(() => {});
    }
  });
  store.dispatch({ type: 'voice/setSelectedSpeaker', payload: deviceId });
  log('Switched speaker to:', deviceId);
}

export function setOutputVolumeLevel(volume: number) {
  audioElements.forEach(audio => { audio.volume = volume / 100; });
  store.dispatch({ type: 'voice/setOutputVolume', payload: volume });
}

// ─── Helpers ───

function startDurationTimer() {
  if (callDurationTimer) clearInterval(callDurationTimer);
  // Duration is calculated from startTime in the UI, no need for a timer
}

function startHeartbeat(callId: string) {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    const socket = getSocket();
    if (socket) socket.emit('voice:call:heartbeat', { callId });
  }, 10000);
  log('Heartbeat started for call:', callId);
}

function playRingtone() {
  try {
    // Use a simple oscillator-based ringtone
    if (!ringtoneAudio) {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 440;
      gain.gain.value = 0.1;
      osc.start();

      // Create a repeating pattern
      const ringInterval = setInterval(() => {
        if (!ringtoneAudio) { clearInterval(ringInterval); osc.stop(); ctx.close(); return; }
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.setValueAtTime(0, ctx.currentTime + 0.5);
      }, 1500);

      ringtoneAudio = new Audio(); // placeholder to track state
      (ringtoneAudio as unknown as Record<string, unknown>)._ctx = ctx;
      (ringtoneAudio as unknown as Record<string, unknown>)._osc = osc;
      (ringtoneAudio as unknown as Record<string, unknown>)._interval = ringInterval;
      log('Ringtone playing');
    }
  } catch {
    logError('Failed to play ringtone');
  }
}

function stopRingtone() {
  if (ringtoneAudio) {
    try {
      const ctx = (ringtoneAudio as unknown as Record<string, unknown>)._ctx as AudioContext;
      const osc = (ringtoneAudio as unknown as Record<string, unknown>)._osc as OscillatorNode;
      const interval = (ringtoneAudio as unknown as Record<string, unknown>)._interval as ReturnType<typeof setInterval>;
      if (interval) clearInterval(interval);
      if (osc) osc.stop();
      if (ctx) ctx.close();
    } catch { /* already closed */ }
    ringtoneAudio = null;
    log('Ringtone stopped');
  }
}

// ─── Latency Measurement ───
export function measureLatency() {
  peerConnections.forEach((pc, socketId) => {
    pc.getStats().then(stats => {
      stats.forEach(report => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          const rtt = report.currentRoundTripTime;
          if (rtt !== undefined) {
            const participant = getState().currentCall?.participants.find(
              p => p.socketId === socketId
            );
            if (participant) {
              dispatch(updateParticipant({
                userId: participant.userId,
                updates: { latency: Math.round(rtt * 1000) },
              }));
            }
          }
        }
      });
    });
  });
}

// ─── Voice Channel Calls (server voice channels) ───

export async function joinVoiceChannelCall(channelId: string, serverId: string) {
  log('joinVoiceChannelCall called:', { channelId, serverId });
  const socket = getSocket();
  if (!socket) {
    showCallError('Not connected to server.');
    return;
  }
  if (getState().currentCall) {
    showCallError('Already in a call. Please leave current call first.');
    return;
  }

  // Check mic permission
  const micStatus = await checkMicPermission();
  if (micStatus !== 'granted') {
    showMicPermissionDialog();
    return;
  }

  try {
    localStream = await getMicrophoneStream(getState().selectedMicId);
    await enumerateDevices();
    startVAD();
  } catch {
    logError('Mic access failed for voice channel');
    showCallError('Could not access microphone. Check your device connection.');
    return;
  }

  const user = store.getState().auth.user;
  const callId = `vc-${channelId}-${Date.now()}`;

  const callInfo: CallInfo = {
    id: callId,
    type: 'channel',
    status: 'active',
    channelId,
    serverId,
    startTime: Date.now(),
    participants: [{
      userId: user?.id || '',
      username: user?.username || '',
      avatarUrl: user?.avatar_url || null,
      socketId: socket.id || '',
      muted: false,
      deafened: false,
      speaking: false,
      latency: 0,
    }],
  };

  dispatch(setCurrentCall(callInfo));

  // Note: voice:join is handled by the useVoice hook which also handles
  // voice channel specific signaling. We only track state here.
  // Don't emit voice:join here as useVoice hook does it.

  startHeartbeat(callId);
  log('Joined voice channel call:', callId);
}

export function leaveVoiceChannelCall() {
  log('leaveVoiceChannelCall called');
  const call = getState().currentCall;
  if (!call || call.type !== 'channel') return;

  // Only clean up our state, let useVoice handle the actual voice:leave
  endCallCleanup();
}
