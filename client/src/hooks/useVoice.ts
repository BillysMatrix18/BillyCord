import { useState, useRef, useCallback, useEffect } from 'react';
import { getSocket } from '../services/socket';

interface VoiceUser {
  socketId: string;
  userId: string;
  username: string;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export function useVoice() {
  const [currentVoiceChannel, setCurrentVoiceChannel] = useState<string | null>(null);
  const [voiceUsers, setVoiceUsers] = useState<VoiceUser[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);

  const localStream = useRef<MediaStream | null>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioElements = useRef<Map<string, HTMLAudioElement>>(new Map());

  const createPeerConnection = useCallback((targetSocketId: string) => {
    const socket = getSocket();
    if (!socket) return null;

    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('voice:ice-candidate', {
          targetSocketId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      let audio = audioElements.current.get(targetSocketId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        audioElements.current.set(targetSocketId, audio);
      }
      audio.srcObject = event.streams[0];
    };

    // Add local tracks
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStream.current!);
      });
    }

    peerConnections.current.set(targetSocketId, pc);
    return pc;
  }, []);

  const joinVoiceChannel = useCallback(async (channelId: string) => {
    const socket = getSocket();
    if (!socket) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStream.current = stream;

      socket.emit('voice:join', { channelId });
      setCurrentVoiceChannel(channelId);

      // Listen for participants
      socket.on('voice:participants', ({ participants }: { participants: VoiceUser[] }) => {
        setVoiceUsers(participants);
        // Create offers for each participant
        participants.forEach(async (participant) => {
          const pc = createPeerConnection(participant.socketId);
          if (!pc) return;
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('voice:offer', { targetSocketId: participant.socketId, offer });
        });
      });

      socket.on('voice:user-joined', (user: VoiceUser) => {
        setVoiceUsers(prev => [...prev, user]);
      });

      socket.on('voice:user-left', ({ socketId }: { socketId: string }) => {
        setVoiceUsers(prev => prev.filter(u => u.socketId !== socketId));
        const pc = peerConnections.current.get(socketId);
        if (pc) {
          pc.close();
          peerConnections.current.delete(socketId);
        }
        const audio = audioElements.current.get(socketId);
        if (audio) {
          audio.srcObject = null;
          audioElements.current.delete(socketId);
        }
      });

      socket.on('voice:offer', async ({ offer, senderSocketId }: { offer: RTCSessionDescriptionInit; senderSocketId: string }) => {
        const pc = createPeerConnection(senderSocketId);
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('voice:answer', { targetSocketId: senderSocketId, answer });
      });

      socket.on('voice:answer', async ({ answer, senderSocketId }: { answer: RTCSessionDescriptionInit; senderSocketId: string }) => {
        const pc = peerConnections.current.get(senderSocketId);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
      });

      socket.on('voice:ice-candidate', async ({ candidate, senderSocketId }: { candidate: RTCIceCandidateInit; senderSocketId: string }) => {
        const pc = peerConnections.current.get(senderSocketId);
        if (pc) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      });

      socket.on('voice:user-muted', ({ userId, muted }: { userId: string; muted: boolean }) => {
        setVoiceUsers(prev => prev.map(u =>
          u.userId === userId ? { ...u, muted } : u
        ));
      });

    } catch (error) {
      console.error('Failed to join voice channel:', error);
    }
  }, [createPeerConnection]);

  const leaveVoiceChannel = useCallback(() => {
    const socket = getSocket();
    if (!socket || !currentVoiceChannel) return;

    socket.emit('voice:leave', { channelId: currentVoiceChannel });

    // Cleanup
    localStream.current?.getTracks().forEach(track => track.stop());
    localStream.current = null;

    peerConnections.current.forEach(pc => pc.close());
    peerConnections.current.clear();

    audioElements.current.forEach(audio => { audio.srcObject = null; });
    audioElements.current.clear();

    // Remove listeners
    socket.off('voice:participants');
    socket.off('voice:user-joined');
    socket.off('voice:user-left');
    socket.off('voice:offer');
    socket.off('voice:answer');
    socket.off('voice:ice-candidate');
    socket.off('voice:user-muted');

    setCurrentVoiceChannel(null);
    setVoiceUsers([]);
    setIsMuted(false);
    setIsDeafened(false);
  }, [currentVoiceChannel]);

  const toggleMute = useCallback(() => {
    const socket = getSocket();
    if (localStream.current) {
      const audioTrack = localStream.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted; // toggle
        setIsMuted(!isMuted);
        if (socket && currentVoiceChannel) {
          socket.emit('voice:mute', { channelId: currentVoiceChannel, muted: !isMuted });
        }
      }
    }
  }, [isMuted, currentVoiceChannel]);

  const toggleDeafen = useCallback(() => {
    const socket = getSocket();
    const newDeafened = !isDeafened;
    setIsDeafened(newDeafened);
    audioElements.current.forEach(audio => { audio.muted = newDeafened; });
    if (socket && currentVoiceChannel) {
      socket.emit('voice:deafen', { channelId: currentVoiceChannel, deafened: newDeafened });
    }
  }, [isDeafened, currentVoiceChannel]);

  useEffect(() => {
    return () => {
      leaveVoiceChannel();
    };
  }, [leaveVoiceChannel]);

  return {
    currentVoiceChannel,
    voiceUsers,
    isMuted,
    isDeafened,
    joinVoiceChannel,
    leaveVoiceChannel,
    toggleMute,
    toggleDeafen,
  };
}
