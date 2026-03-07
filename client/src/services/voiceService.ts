import { getSocket } from './socket';
import { store } from '../store';
import {
  setCurrentCall, setCallStatus, setIncomingCall,
  addParticipant, removeParticipant, updateParticipant,
  setMuted, setDeafened, setAvailableDevices,
  addCallHistory, clearCall, CallInfo, VoiceParticipant,
} from '../store/voiceSlice';

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
  } catch (e) {
    console.error('Failed to enumerate devices:', e);
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
  return navigator.mediaDevices.getUserMedia(constraints);
}

// ─── Peer Connection ───
function createPeerConnection(targetSocketId: string, targetUserId: string): RTCPeerConnection {
  const socket = getSocket();
  const pc = new RTCPeerConnection(ICE_SERVERS);

  pc.onicecandidate = (event) => {
    if (event.candidate && socket) {
      socket.emit('voice:ice-candidate', { targetSocketId, candidate: event.candidate });
    }
  };

  pc.ontrack = (event) => {
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
    if (pc.connectionState === 'connected') {
      dispatch(updateParticipant({ userId: targetUserId, updates: { latency: 0 } }));
    }
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      dispatch(updateParticipant({ userId: targetUserId, updates: { latency: -1 } }));
    }
  };

  // Add local tracks
  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream!));
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
  } catch (e) {
    console.error('VAD setup failed:', e);
  }
}

function stopVAD() {
  if (vadTimer) clearInterval(vadTimer);
  vadTimer = null;
  if (audioContext) { audioContext.close().catch(() => {}); audioContext = null; }
  analyser = null;
}

// ─── Socket Event Listeners ───
let listenersAttached = false;

export function attachVoiceListeners() {
  const socket = getSocket();
  if (!socket || listenersAttached) return;
  listenersAttached = true;

  // Incoming call notification
  socket.on('voice:call:incoming', (data: {
    callId: string; callerId: string; callerName: string;
    callerAvatar: string | null; conversationId?: string; callType: 'dm' | 'group';
  }) => {
    // Don't show if already in a call
    if (getState().currentCall) return;
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
    const pc = createPeerConnection(data.socketId, data.userId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('voice:offer', { targetSocketId: data.socketId, offer });
  });

  // Call rejected
  socket.on('voice:call:rejected', (data: { callId: string; reason?: string }) => {
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
    }
  });

  // Call ended
  socket.on('voice:call:ended', (data: { callId: string }) => {
    stopRingtone();
    if (getState().currentCall?.id === data.callId) {
      endCallCleanup();
    }
  });

  // Participant joined (group/channel)
  socket.on('voice:call:participant-joined', (data: { callId: string; userId: string; username: string; socketId: string; avatarUrl: string | null }) => {
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
    const pc = createPeerConnection(data.socketId, data.userId);
    pc.createOffer().then(offer => {
      pc.setLocalDescription(offer);
      socket.emit('voice:offer', { targetSocketId: data.socketId, offer });
    });
  });

  // Participant left
  socket.on('voice:call:participant-left', (data: { userId: string; socketId: string }) => {
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

  // WebRTC signaling (reuse existing voice channel events)
  socket.on('voice:offer', async (data: { offer: RTCSessionDescriptionInit; senderSocketId: string; userId: string }) => {
    const pc = createPeerConnection(data.senderSocketId, data.userId);
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('voice:answer', { targetSocketId: data.senderSocketId, answer });
  });

  socket.on('voice:answer', async (data: { answer: RTCSessionDescriptionInit; senderSocketId: string }) => {
    const pc = peerConnections.get(data.senderSocketId);
    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
  });

  socket.on('voice:ice-candidate', async (data: { candidate: RTCIceCandidateInit; senderSocketId: string }) => {
    const pc = peerConnections.get(data.senderSocketId);
    if (pc) await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
  });

  // Call history update from server
  socket.on('voice:call:history', (data: { history: Array<{ id: string; participant_names: string; call_type: string; status: string; duration: number; created_at: string }> }) => {
    // We'll just use the local history for now
    void data;
  });
}

export function detachVoiceListeners() {
  const socket = getSocket();
  if (!socket) return;
  listenersAttached = false;
  socket.off('voice:call:incoming');
  socket.off('voice:call:accepted');
  socket.off('voice:call:rejected');
  socket.off('voice:call:ended');
  socket.off('voice:call:participant-joined');
  socket.off('voice:call:participant-left');
  socket.off('voice:call:mute-status');
  socket.off('voice:call:deafen-status');
  socket.off('voice:call:history');
}

// ─── Call Actions ───

export async function initiateCall(conversationId: string, callType: 'dm' | 'group') {
  const socket = getSocket();
  if (!socket || getState().currentCall) return;

  try {
    localStream = await getMicrophoneStream(getState().selectedMicId);
    await enumerateDevices();
    startVAD();
  } catch {
    console.error('Mic access denied');
    return;
  }

  const callId = `call-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const user = store.getState().auth.user;

  socket.emit('voice:call:initiate', {
    callId,
    conversationId,
    callType,
    callerName: user?.username,
    callerAvatar: user?.avatar_url,
  });

  const callInfo: CallInfo = {
    id: callId,
    type: callType,
    status: 'ringing',
    conversationId,
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
  playRingtone();

  // Timeout after 60s if not accepted
  missedCallTimer = setTimeout(() => {
    const state = getState();
    if (state.currentCall?.id === callId && state.currentCall.status === 'ringing') {
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
    }
  }, 60000);
}

export async function acceptCall() {
  const socket = getSocket();
  const incoming = getState().incomingCall;
  if (!socket || !incoming) return;

  stopRingtone();
  if (missedCallTimer) { clearTimeout(missedCallTimer); missedCallTimer = null; }

  try {
    localStream = await getMicrophoneStream(getState().selectedMicId);
    await enumerateDevices();
    startVAD();
  } catch {
    console.error('Mic access denied');
    dispatch(setIncomingCall(null));
    return;
  }

  const user = store.getState().auth.user;

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

  // Start duration timer
  startDurationTimer();
  // Start heartbeat
  startHeartbeat(incoming.callId);
}

export function rejectCall() {
  const socket = getSocket();
  const incoming = getState().incomingCall;
  if (!socket || !incoming) return;

  stopRingtone();
  if (missedCallTimer) { clearTimeout(missedCallTimer); missedCallTimer = null; }

  socket.emit('voice:call:reject', { callId: incoming.callId });
  dispatch(setIncomingCall(null));
}

export function endCall() {
  const socket = getSocket();
  const call = getState().currentCall;
  if (!socket || !call) return;

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
  stopRingtone();
  stopVAD();

  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }

  peerConnections.forEach(pc => pc.close());
  peerConnections.clear();

  audioElements.forEach(audio => { audio.srcObject = null; });
  audioElements.clear();

  if (callDurationTimer) { clearInterval(callDurationTimer); callDurationTimer = null; }
  if (missedCallTimer) { clearTimeout(missedCallTimer); missedCallTimer = null; }
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }

  dispatch(clearCall());
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
  if (!localStream) return;

  const track = localStream.getAudioTracks()[0];
  if (!track) return;

  const newMuted = !state.isMuted;
  track.enabled = !newMuted;
  dispatch(setMuted(newMuted));

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
  } catch (e) {
    console.error('Failed to switch microphone:', e);
  }
}

export function switchSpeaker(deviceId: string) {
  audioElements.forEach(audio => {
    if ('setSinkId' in audio) {
      (audio as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId).catch(() => {});
    }
  });
  store.dispatch({ type: 'voice/setSelectedSpeaker', payload: deviceId });
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
    }
  } catch {
    // Audio context not available
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
  const socket = getSocket();
  if (!socket || getState().currentCall) return;

  try {
    localStream = await getMicrophoneStream(getState().selectedMicId);
    await enumerateDevices();
    startVAD();
  } catch {
    console.error('Mic access denied');
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

  // Use existing voice channel join
  socket.emit('voice:join', { channelId });

  // Listen for existing participants
  const handleParticipants = ({ participants }: { participants: Array<{ socketId: string; userId: string; username: string }> }) => {
    participants.forEach(async (p) => {
      dispatch(addParticipant({
        userId: p.userId,
        username: p.username,
        avatarUrl: null,
        socketId: p.socketId,
        muted: false,
        deafened: false,
        speaking: false,
        latency: 0,
      }));
      const pc = createPeerConnection(p.socketId, p.userId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('voice:offer', { targetSocketId: p.socketId, offer });
    });
    socket.off('voice:participants', handleParticipants);
  };

  socket.on('voice:participants', handleParticipants);

  socket.on('voice:user-joined', (data: { userId: string; username: string; socketId: string }) => {
    if (getState().currentCall?.channelId !== channelId) return;
    dispatch(addParticipant({
      userId: data.userId,
      username: data.username,
      avatarUrl: null,
      socketId: data.socketId,
      muted: false,
      deafened: false,
      speaking: false,
      latency: 0,
    }));
  });

  socket.on('voice:user-left', (data: { userId: string; socketId: string }) => {
    dispatch(removeParticipant(data.userId));
    cleanupPeer(data.socketId);
  });

  socket.on('voice:user-muted', (data: { userId: string; muted: boolean }) => {
    dispatch(updateParticipant({ userId: data.userId, updates: { muted: data.muted } }));
  });

  socket.on('voice:user-deafened', (data: { userId: string; deafened: boolean }) => {
    dispatch(updateParticipant({ userId: data.userId, updates: { deafened: data.deafened } }));
  });

  startHeartbeat(callId);
}

export function leaveVoiceChannelCall() {
  const socket = getSocket();
  const call = getState().currentCall;
  if (!socket || !call || call.type !== 'channel') return;

  socket.emit('voice:leave', { channelId: call.channelId });

  // Remove vc-specific listeners
  socket.off('voice:user-joined');
  socket.off('voice:user-left');
  socket.off('voice:user-muted');
  socket.off('voice:user-deafened');

  endCallCleanup();
}
