import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppSelector } from '../../hooks/useAppDispatch';
import {
  endCall, toggleMute, toggleDeafen, leaveVoiceChannelCall,
  switchMicrophone, switchSpeaker, setOutputVolumeLevel,
  measureLatency, enumerateDevices,
} from '../../services/voiceService';
import { store } from '../../store';
import { setPanelMinimized, setInputVolume } from '../../store/voiceSlice';
import { resolveUploadUrl } from '../../services/api';
import { IconMic, IconMicOff, IconHeadphones, IconX } from '../common/Icons';

export default function VoiceCallPanel() {
  const {
    currentCall, isMuted, isDeafened, panelMinimized,
    availableMicrophones, availableSpeakers,
    selectedMicId, selectedSpeakerId,
    inputVolume, outputVolume,
  } = useAppSelector((state) => state.voice);
  const currentUser = useAppSelector((state) => state.auth.user);
  const [elapsed, setElapsed] = useState(0);
  const [showDevices, setShowDevices] = useState(false);

  useEffect(() => {
    if (!currentCall || currentCall.status !== 'active') { setElapsed(0); return; }
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - currentCall.startTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [currentCall?.startTime, currentCall?.status]);

  // Latency measurement
  useEffect(() => {
    if (!currentCall || currentCall.status !== 'active') return;
    const timer = setInterval(measureLatency, 5000);
    return () => clearInterval(timer);
  }, [currentCall?.status]);

  // Enumerate devices on mount
  useEffect(() => { enumerateDevices(); }, []);

  if (!currentCall) return null;

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getQualityInfo = (latency: number) => {
    if (latency < 0) return { label: 'Disconnected', color: '#ff3b30', bars: 0 };
    if (latency === 0) return { label: 'Connecting', color: '#8e8e93', bars: 1 };
    if (latency < 50) return { label: 'Excellent', color: '#34c759', bars: 5 };
    if (latency < 100) return { label: 'Good', color: '#34c759', bars: 4 };
    if (latency < 200) return { label: 'Fair', color: '#ffcc00', bars: 3 };
    if (latency < 500) return { label: 'Poor', color: '#ff9500', bars: 2 };
    return { label: 'Bad', color: '#ff3b30', bars: 1 };
  };

  const otherParticipants = currentCall.participants.filter(p => p.userId !== currentUser?.id);

  const handleEndCall = () => {
    if (currentCall.type === 'channel') {
      leaveVoiceChannelCall();
    } else {
      endCall();
    }
  };

  if (panelMinimized) {
    return createPortal(
      <div className="voice-call-mini" onClick={() => store.dispatch(setPanelMinimized(false))}>
        <div className="voice-call-mini-info">
          <div className="voice-call-mini-dot" />
          <span>{currentCall.status === 'ringing' ? 'Calling...' : formatDuration(elapsed)}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
            {otherParticipants.map(p => p.username).join(', ') || 'Waiting...'}
          </span>
        </div>
        <button className="voice-call-mini-end" onClick={(e) => { e.stopPropagation(); handleEndCall(); }}>
          <IconX size={14} />
        </button>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="voice-call-panel animate-fade-in">
      {/* Header */}
      <div className="voice-call-header">
        <div>
          <span className="voice-call-status">
            {currentCall.status === 'ringing' ? 'Calling...' :
             currentCall.status === 'connecting' ? 'Connecting...' :
             'Voice Connected'}
          </span>
          {currentCall.status === 'active' && (
            <span className="voice-call-timer">{formatDuration(elapsed)}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="voice-call-minimize" onClick={() => store.dispatch(setPanelMinimized(true))} title="Minimize">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13H5v-2h14v2z"/></svg>
          </button>
        </div>
      </div>

      {/* Participants */}
      <div className="voice-call-participants">
        {currentCall.participants.map(p => {
          const avatar = resolveUploadUrl(p.avatarUrl);
          const quality = getQualityInfo(p.latency);
          const isMe = p.userId === currentUser?.id;
          return (
            <div key={p.userId} className={`voice-call-participant ${p.speaking ? 'speaking' : ''}`}>
              <div className="voice-call-participant-avatar">
                {avatar ? (
                  <img src={avatar} alt={p.username} />
                ) : (
                  <div className="voice-call-avatar-fallback">
                    {p.username[0]?.toUpperCase() || '?'}
                  </div>
                )}
                {p.speaking && <div className="voice-call-speaking-ring" />}
              </div>
              <div className="voice-call-participant-info">
                <span className="voice-call-participant-name">
                  {p.username}{isMe ? ' (You)' : ''}
                </span>
                <div className="voice-call-participant-status">
                  {p.muted && <span className="voice-call-badge muted">Muted</span>}
                  {p.deafened && <span className="voice-call-badge deafened">Deafened</span>}
                  {!isMe && currentCall.status === 'active' && (
                    <span className="voice-call-quality" style={{ color: quality.color }}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <span key={i} className={`quality-bar ${i < quality.bars ? 'active' : ''}`}
                          style={{ background: i < quality.bars ? quality.color : 'var(--bg-quaternary)' }} />
                      ))}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {currentCall.status === 'ringing' && otherParticipants.length === 0 && (
          <div className="voice-call-waiting">
            <div className="voice-call-ring-animation" />
            <span>Waiting for answer...</span>
          </div>
        )}
      </div>

      {/* Device selection */}
      {showDevices && (
        <div className="voice-call-devices">
          <div className="voice-call-device-section">
            <label>Microphone</label>
            <select
              value={selectedMicId || ''}
              onChange={(e) => switchMicrophone(e.target.value)}
            >
              {availableMicrophones.map(d => (
                <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
              ))}
            </select>
          </div>
          <div className="voice-call-device-section">
            <label>Speaker</label>
            <select
              value={selectedSpeakerId || ''}
              onChange={(e) => switchSpeaker(e.target.value)}
            >
              {availableSpeakers.map(d => (
                <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
              ))}
            </select>
          </div>
          <div className="voice-call-device-section">
            <label>Input Volume</label>
            <input type="range" min="0" max="200" value={inputVolume}
              onChange={(e) => store.dispatch(setInputVolume(Number(e.target.value)))} />
            <span>{inputVolume}%</span>
          </div>
          <div className="voice-call-device-section">
            <label>Output Volume</label>
            <input type="range" min="0" max="100" value={outputVolume}
              onChange={(e) => setOutputVolumeLevel(Number(e.target.value))} />
            <span>{outputVolume}%</span>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="voice-call-controls">
        <button
          className={`voice-call-btn ${isMuted ? 'active' : ''}`}
          onClick={toggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <IconMicOff size={20} /> : <IconMic size={20} />}
        </button>
        <button
          className={`voice-call-btn ${isDeafened ? 'active' : ''}`}
          onClick={toggleDeafen}
          title={isDeafened ? 'Undeafen' : 'Deafen'}
        >
          <IconHeadphones size={20} />
        </button>
        <button
          className={`voice-call-btn settings ${showDevices ? 'active' : ''}`}
          onClick={() => setShowDevices(!showDevices)}
          title="Audio Settings"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
          </svg>
        </button>
        <button className="voice-call-btn end-call" onClick={handleEndCall} title="End Call">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
          </svg>
        </button>
      </div>
    </div>,
    document.body
  );
}
