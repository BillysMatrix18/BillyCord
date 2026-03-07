import { useState } from 'react';
import { createPortal } from 'react-dom';

interface MicrophonePermissionDialogProps {
  onAllow: () => void;
  onDeny: () => void;
}

export default function MicrophonePermissionDialog({ onAllow, onDeny }: MicrophonePermissionDialogProps) {
  const [showDeniedInfo, setShowDeniedInfo] = useState(false);

  if (showDeniedInfo) {
    return createPortal(
      <div className="mic-permission-overlay" style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 10000,
      }}>
        <div className="mic-permission-dialog" style={{
          background: 'var(--bg-secondary, #2f3136)', borderRadius: 12,
          padding: '24px 28px', maxWidth: 420, width: '90%',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="var(--red, #ed4245)">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18, fontWeight: 600 }}>
              Microphone Blocked
            </h2>
          </div>
          <p style={{ color: 'var(--text-secondary, #b9bbbe)', fontSize: 14, lineHeight: 1.5, margin: '0 0 12px' }}>
            Microphone access was denied. To enable voice calls, you need to allow microphone access:
          </p>
          <div style={{
            background: 'var(--bg-tertiary, #202225)', borderRadius: 8,
            padding: '12px 16px', marginBottom: 16, fontSize: 13,
            color: 'var(--text-secondary, #b9bbbe)', lineHeight: 1.6,
          }}>
            <strong style={{ color: 'var(--text-primary)' }}>For Electron/Desktop:</strong><br/>
            Restart BillyCord and click "Allow" when prompted.<br/><br/>
            <strong style={{ color: 'var(--text-primary)' }}>For Windows Settings:</strong><br/>
            Settings &gt; Privacy &gt; Microphone &gt; Allow apps to access microphone<br/><br/>
            <strong style={{ color: 'var(--text-primary)' }}>For Browser:</strong><br/>
            Click the lock/site icon in the address bar &gt; Allow Microphone
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={onDeny} style={{
              background: 'var(--accent, #5865f2)', color: '#fff',
              border: 'none', borderRadius: 4, padding: '8px 24px',
              fontSize: 14, fontWeight: 500, cursor: 'pointer',
            }}>
              Got it
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="mic-permission-overlay" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10000,
    }}>
      <div className="mic-permission-dialog" style={{
        background: 'var(--bg-secondary, #2f3136)', borderRadius: 12,
        padding: '24px 28px', maxWidth: 400, width: '90%',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="var(--accent, #5865f2)">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/>
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
          </svg>
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18, fontWeight: 600 }}>
            Allow microphone access?
          </h2>
        </div>
        <p style={{ color: 'var(--text-secondary, #b9bbbe)', fontSize: 14, lineHeight: 1.5, margin: '0 0 20px' }}>
          BillyCord needs your microphone for voice calls. Your microphone will only be used during active calls.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={() => setShowDeniedInfo(true)} style={{
            background: 'var(--bg-tertiary, #202225)', color: 'var(--text-primary)',
            border: 'none', borderRadius: 4, padding: '8px 20px',
            fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}>
            Deny
          </button>
          <button onClick={onAllow} style={{
            background: 'var(--accent, #5865f2)', color: '#fff',
            border: 'none', borderRadius: 4, padding: '8px 20px',
            fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}>
            Allow
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
