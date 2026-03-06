import { useState, useEffect, useCallback } from 'react';
import { IconX, IconDownload } from './Icons';

interface ImageModalProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export default function ImageModal({ src, alt, onClose }: ImageModalProps) {
  const [scale, setScale] = useState(1);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setScale(prev => Math.min(5, Math.max(0.5, prev + (e.deltaY > 0 ? -0.2 : 0.2))));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="image-modal-overlay"
      onClick={onClose}
      onWheel={(e) => handleWheel(e.nativeEvent)}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, cursor: 'zoom-out',
      }}
    >
      <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 10000 }}>
        <a
          href={src}
          download
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', textDecoration: 'none', cursor: 'pointer',
          }}
          title="Download"
        >
          <IconDownload size={20} />
        </a>
        <button
          onClick={onClose}
          style={{
            width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.1)',
            border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', cursor: 'pointer',
          }}
          title="Close"
        >
          <IconX size={20} />
        </button>
      </div>

      <img
        src={src}
        alt={alt || 'Image'}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain',
          transform: `scale(${scale})`, transition: 'transform 0.15s ease',
          borderRadius: 4, cursor: scale > 1 ? 'grab' : 'zoom-in',
        }}
      />

      <div style={{
        position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.6)', borderRadius: 8, padding: '6px 16px',
        color: '#fff', fontSize: 12, display: 'flex', gap: 12, alignItems: 'center',
      }}>
        <button onClick={(e) => { e.stopPropagation(); setScale(prev => Math.max(0.5, prev - 0.25)); }}
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16, fontWeight: 700 }}>-</button>
        <span>{Math.round(scale * 100)}%</span>
        <button onClick={(e) => { e.stopPropagation(); setScale(prev => Math.min(5, prev + 0.25)); }}
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16, fontWeight: 700 }}>+</button>
        <button onClick={(e) => { e.stopPropagation(); setScale(1); }}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 11 }}>Reset</button>
      </div>
    </div>
  );
}
