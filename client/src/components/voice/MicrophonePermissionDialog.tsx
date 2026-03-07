import { useState } from 'react';
import { createPortal } from 'react-dom';

interface MicrophonePermissionDialogProps {
  onAllow: () => void;
  onDeny: () => void;
}

export default function MicrophonePermissionDialog({ onAllow, onDeny }: MicrophonePermissionDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  const handleAllow = async () => {
    setRequesting(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Permission granted - stop the test stream
      stream.getTracks().forEach(t => t.stop());
      // Save to localStorage so we don't ask again
      localStorage.setItem('micPermissionGranted', 'true');
      onAllow();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('NotFoundError') || message.includes('Requested device not found') || message.includes('no audio')) {
        setError('No microphone found. Please connect a microphone and try again.');
      } else if (message.includes('NotAllowedError') || message.includes('Permission denied')) {
        setError('Permission denied. Please try restarting the app.');
      } else {
        setError('Could not access microphone. Please try again.');
      }
      setRequesting(false);
    }
  };

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
            Microphone access required
          </h2>
        </div>
        <p style={{ color: 'var(--text-secondary, #b9bbbe)', fontSize: 14, lineHeight: 1.5, margin: '0 0 20px' }}>
          BillyCord needs your microphone for voice calls. Your microphone will only be used during active calls.
        </p>

        {error && (
          <div style={{
            background: 'rgba(237, 66, 69, 0.15)', border: '1px solid rgba(237, 66, 69, 0.4)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 16,
            fontSize: 13, color: '#ed4245', lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onDeny} disabled={requesting} style={{
            background: 'var(--bg-tertiary, #202225)', color: 'var(--text-primary)',
            border: 'none', borderRadius: 4, padding: '8px 20px',
            fontSize: 14, fontWeight: 500, cursor: requesting ? 'not-allowed' : 'pointer',
            opacity: requesting ? 0.5 : 1,
          }}>
            Not now
          </button>
          <button onClick={handleAllow} disabled={requesting} style={{
            background: 'var(--accent, #5865f2)', color: '#fff',
            border: 'none', borderRadius: 4, padding: '8px 20px',
            fontSize: 14, fontWeight: 500, cursor: requesting ? 'not-allowed' : 'pointer',
            opacity: requesting ? 0.7 : 1,
          }}>
            {requesting ? 'Requesting...' : 'Allow'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
