import React from 'react';

export default function MapToolbar({ onZoomIn, onZoomOut, onResetView, onAddDevice, onAddSubmap }) {
  const btnStyle = {
    display: 'block', width: '100%', padding: '6px 12px', marginBottom: '4px',
    background: '#2d2d2d', color: '#e2e8f0', border: '1px solid #404040',
    borderRadius: '4px', cursor: 'pointer', fontSize: '12px', textAlign: 'left',
    fontFamily: 'Segoe UI, sans-serif',
  };

  return (
    <div style={{
      position: 'absolute', top: 12, left: 12, zIndex: 10,
      background: '#1a1a2e', border: '1px solid #333', borderRadius: '8px',
      padding: '8px', minWidth: '140px', boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    }}>
      <button style={{ ...btnStyle, color: '#22c55e', fontWeight: 600 }} onClick={onAddDevice}>+ Add Device</button>
      <button style={{ ...btnStyle, color: '#3b82f6', fontWeight: 600 }} onClick={onAddSubmap}>+ Add Submap</button>
      <div style={{ height: '1px', background: '#333', margin: '4px 0' }} />
      <button style={btnStyle} onClick={onZoomIn}>🔍 Zoom In</button>
      <button style={btnStyle} onClick={onZoomOut}>🔍 Zoom Out</button>
      <button style={btnStyle} onClick={onResetView}>⟲ Reset View</button>
    </div>
  );
}
