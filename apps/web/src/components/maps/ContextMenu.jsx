import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function ContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    const handleEscape = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const adjustedX = Math.min(x, window.innerWidth - 220);
  const adjustedY = Math.min(y, window.innerHeight - items.length * 36 - 16);

  return createPortal(
    <div ref={menuRef} style={{
      position: 'fixed', left: adjustedX, top: adjustedY, zIndex: 9999,
      minWidth: '200px', background: '#2d2d2d', border: '1px solid #404040',
      borderRadius: '6px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      padding: '4px 0', fontFamily: 'Segoe UI, sans-serif', fontSize: '13px',
    }}>
      {items.map((item, i) => item.separator ? (
        <div key={i} style={{ height: '1px', background: '#404040', margin: '4px 8px' }} />
      ) : (
        <div key={i} onClick={() => { if (!item.disabled) { item.action(); onClose(); } }}
          style={{
            padding: '6px 16px', cursor: item.disabled ? 'default' : 'pointer',
            color: item.disabled ? '#666' : '#e2e8f0',
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'transparent',
          }}
          onMouseEnter={e => { if (!item.disabled) e.target.style.background = '#094771'; }}
          onMouseLeave={e => e.target.style.background = 'transparent'}>
          {item.icon && <span style={{ width: '16px', textAlign: 'center' }}>{item.icon}</span>}
          <span>{item.label}</span>
        </div>
      ))}
    </div>,
    document.body
  );
}
