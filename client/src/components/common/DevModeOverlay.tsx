import { useState, useEffect, useCallback, useRef } from 'react';
import { getSocket } from '../../services/socket';

export default function DevModeOverlay() {
  const [ping, setPing] = useState<number | null>(null);
  const [pingHistory, setPingHistory] = useState<number[]>([]);
  const [connectionQuality, setConnectionQuality] = useState<'Excellent' | 'Good' | 'Fair' | 'Weak' | 'Disconnected'>('Good');
  const [socketTransport, setSocketTransport] = useState<string>('unknown');
  const [socketConnected, setSocketConnected] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 16, y: 16 });
  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const measurePing = useCallback(() => {
    const socket = getSocket();
    if (!socket?.connected) {
      setSocketConnected(false);
      setConnectionQuality('Disconnected');
      setPing(null);
      return;
    }
    setSocketConnected(true);
    setSocketTransport(socket.io?.engine?.transport?.name || 'unknown');
    const start = Date.now();
    socket.volatile.emit('ping:measure', {}, () => {
      const latency = Date.now() - start;
      setPing(latency);
      setPingHistory(prev => [...prev.slice(-29), latency]);
      if (latency < 80) setConnectionQuality('Excellent');
      else if (latency < 150) setConnectionQuality('Good');
      else if (latency < 300) setConnectionQuality('Fair');
      else setConnectionQuality('Weak');
    });
    setTimeout(() => { setPing(prev => prev ?? -1); }, 3000);
  }, []);

  useEffect(() => {
    measurePing();
    pingIntervalRef.current = setInterval(measurePing, 3000);
    return () => { if (pingIntervalRef.current) clearInterval(pingIntervalRef.current); };
  }, [measurePing]);

  const avgPing = pingHistory.length > 0 ? Math.round(pingHistory.reduce((a, b) => a + b, 0) / pingHistory.length) : null;
  const qualityColor = connectionQuality === 'Excellent' ? '#48bb78' : connectionQuality === 'Good' ? '#68d391' : connectionQuality === 'Fair' ? '#ecc94b' : connectionQuality === 'Weak' ? '#fc5c65' : '#6d6f78';

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, posX: position.x, posY: position.y };
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPosition({ x: dragRef.current.posX + dx, y: dragRef.current.posY + dy });
    };
    const handleMouseUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, []);

  return (
    <div
      ref={overlayRef}
      className="dev-mode-overlay"
      style={{
        position: 'fixed',
        top: position.y,
        left: position.x,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 10,
        padding: minimized ? '6px 12px' : '12px 16px',
        color: '#fff',
        fontSize: 12,
        fontFamily: 'monospace',
        minWidth: minimized ? 'auto' : 240,
        maxWidth: 320,
        cursor: 'move',
        userSelect: 'none',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        pointerEvents: 'auto',
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: minimized ? 0 : 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: socketConnected ? '#48bb78' : '#fc5c65', display: 'inline-block', boxShadow: socketConnected ? '0 0 6px #48bb78' : '0 0 6px #fc5c65' }} />
          <span style={{ fontWeight: 700, fontSize: 11, letterSpacing: 0.5 }}>DEV MODE</span>
          <span style={{ color: qualityColor, fontWeight: 600 }}>
            {ping !== null ? `${ping}ms` : '---'}
          </span>
        </div>
        <button
          onClick={() => setMinimized(!minimized)}
          style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: 4, padding: '2px 6px', fontSize: 11 }}
        >
          {minimized ? '+' : '−'}
        </button>
      </div>

      {!minimized && (
        <>
          {/* Ping bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '6px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: qualityColor }}>{ping !== null ? `${ping}ms` : '---'}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>Ping</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: qualityColor }}>{connectionQuality}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>Quality</div>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 8 }}>
            <div style={{ textAlign: 'center', padding: '4px 0' }}>
              <div style={{ fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>{avgPing !== null ? `${avgPing}ms` : '---'}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>AVG</div>
            </div>
            <div style={{ textAlign: 'center', padding: '4px 0' }}>
              <div style={{ fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>{pingHistory.length > 0 ? `${Math.min(...pingHistory)}ms` : '---'}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>MIN</div>
            </div>
            <div style={{ textAlign: 'center', padding: '4px 0' }}>
              <div style={{ fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>{pingHistory.length > 0 ? `${Math.max(...pingHistory)}ms` : '---'}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>MAX</div>
            </div>
          </div>

          {/* Ping history mini-graph */}
          {pingHistory.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 30, marginBottom: 8, padding: '4px 4px 0', background: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>
              {pingHistory.map((p, i) => {
                const maxVal = Math.max(...pingHistory, 100);
                const height = Math.max((p / maxVal) * 100, 5);
                const barColor = p < 80 ? '#48bb78' : p < 150 ? '#68d391' : p < 300 ? '#ecc94b' : '#fc5c65';
                return <div key={i} style={{ flex: 1, height: `${height}%`, background: barColor, borderRadius: '1px 1px 0 0', minWidth: 2 }} />;
              })}
            </div>
          )}

          {/* Network info */}
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
            <div>Transport: {socketTransport}</div>
            <div>Server: {localStorage.getItem('serverAddress') || window.location.origin}</div>
            <div>Samples: {pingHistory.length}/30</div>
          </div>
        </>
      )}
    </div>
  );
}
