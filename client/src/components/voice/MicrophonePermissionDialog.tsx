import { useState } from 'react';
import { createPortal } from 'react-dom';

interface MicrophonePermissionDialogProps {
  onAllow: () => void;
  onDeny: () => void;
}

export default function MicrophonePermissionDialog({ onAllow, onDeny }: MicrophonePermissionDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [granted, setGranted] = useState(false);

  const handleAllow = async () => {
    setRequesting(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Permission granted - stop the test stream
      stream.getTracks().forEach(t => t.stop());
      // Save to localStorage so we don't ask again
      localStorage.setItem('micPermissionGranted', 'true');
      setGranted(true);
      // Brief success message then close
      setTimeout(() => onAllow(), 800);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('NotFoundError') || message.includes('Requested device not found') || message.includes('no audio')) {
        setError('No microphone detected. Please connect a microphone and try again.');
      } else if (message.includes('NotAllowedError') || message.includes('Permission denied')) {
        setError('Microphone access was blocked. Try restarting BillyCord.');
      } else {
        setError('Could not access microphone. Please check your audio devices and try again.');
      }
      setRequesting(false);
    }
  };

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10000, backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: '#1e2028', borderRadius: 8, width: 440, maxWidth: '95%',
        boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)',
        overflow: 'hidden',
      }}>
        {/* Header bar - admin style */}
        <div style={{
          background: '#2b2d36', padding: '14px 20px',
          display: 'flex', alignItems: 'center', gap: 12,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          {/* Shield icon */}
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: 'linear-gradient(135deg, #5865f2, #3b44c4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
            </svg>
          </div>
          <div>
            <div style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>
              BillyCord Security
            </div>
            <div style={{ color: '#8e9297', fontSize: 12 }}>
              Permission Request
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>
          {granted ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="#43b581" style={{ marginBottom: 12 }}>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
              <div style={{ color: '#43b581', fontSize: 16, fontWeight: 600 }}>
                Microphone access granted
              </div>
              <div style={{ color: '#8e9297', fontSize: 13, marginTop: 4 }}>
                You can now make voice calls
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: 'rgba(88,101,242,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="#5865f2">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/>
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                  </svg>
                </div>
                <div>
                  <div style={{ color: '#fff', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
                    Allow microphone access?
                  </div>
                  <div style={{ color: '#b9bbbe', fontSize: 13, lineHeight: 1.5 }}>
                    BillyCord wants to use your microphone for voice calls.
                    Audio is only captured during active calls and is never recorded or stored.
                  </div>
                </div>
              </div>

              {/* Permission details box */}
              <div style={{
                background: '#2b2d36', borderRadius: 6, padding: '12px 14px',
                marginBottom: 16, border: '1px solid rgba(255,255,255,0.04)',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#72767d', marginBottom: 8, letterSpacing: '0.5px' }}>
                  This will allow BillyCord to:
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#43b581"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                  <span style={{ color: '#dcddde', fontSize: 13 }}>Access your microphone during calls</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#43b581"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                  <span style={{ color: '#dcddde', fontSize: 13 }}>Detect voice activity for speaking indicators</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#43b581"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                  <span style={{ color: '#dcddde', fontSize: 13 }}>Switch between audio input devices</span>
                </div>
              </div>

              {error && (
                <div style={{
                  background: 'rgba(237, 66, 69, 0.12)', border: '1px solid rgba(237, 66, 69, 0.3)',
                  borderRadius: 6, padding: '10px 14px', marginBottom: 16,
                  fontSize: 13, color: '#ed4245', lineHeight: 1.5,
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#ed4245" style={{ flexShrink: 0, marginTop: 1 }}>
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                  </svg>
                  <span>{error}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer buttons */}
        {!granted && (
          <div style={{
            padding: '14px 24px', background: '#2b2d36',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', justifyContent: 'flex-end', gap: 10,
          }}>
            <button onClick={onDeny} disabled={requesting} style={{
              background: '#4f545c', color: '#fff',
              border: 'none', borderRadius: 4, padding: '9px 22px',
              fontSize: 14, fontWeight: 500, cursor: requesting ? 'not-allowed' : 'pointer',
              opacity: requesting ? 0.5 : 1,
              transition: 'background 0.15s',
            }}
              onMouseEnter={e => { if (!requesting) e.currentTarget.style.background = '#5d6269'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#4f545c'; }}
            >
              Deny
            </button>
            <button onClick={handleAllow} disabled={requesting} style={{
              background: requesting ? '#4752c4' : '#5865f2', color: '#fff',
              border: 'none', borderRadius: 4, padding: '9px 22px',
              fontSize: 14, fontWeight: 500, cursor: requesting ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
              onMouseEnter={e => { if (!requesting) e.currentTarget.style.background = '#4752c4'; }}
              onMouseLeave={e => { if (!requesting) e.currentTarget.style.background = '#5865f2'; }}
            >
              {requesting ? (
                <>
                  <div style={{
                    width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff', borderRadius: '50%',
                    animation: 'micSpinner 0.6s linear infinite',
                  }} />
                  Granting...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
                  </svg>
                  Allow Access
                </>
              )}
            </button>
          </div>
        )}

        <style>{`
          @keyframes micSpinner {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>,
    document.body
  );
}
