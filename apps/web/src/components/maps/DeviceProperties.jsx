import React from 'react';

const STATUS_COLORS = { ok: '#22c55e', warning: '#f59e0b', critical: '#ef4444', unknown: '#9ca3af' };

export default function DeviceProperties({ device, services, onClose }) {
  if (!device) return null;
  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.3)',
      }} onClick={onClose} />
      <div style={{
        position: 'fixed', top: 0, right: 0, width: '350px', height: '100%',
        zIndex: 50, background: '#1e1e2e', color: '#e2e8f0',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column', fontFamily: 'Segoe UI, sans-serif',
      }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{device.name}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '20px' }}>×</button>
        </div>
        <div style={{ padding: '16px', flex: 1, overflowY: 'auto', fontSize: '13px' }}>
          <PropertyRow label="IP" value={device.ip} />
          <PropertyRow label="MAC" value={device.mac} />
          <PropertyRow label="Vendor" value={device.vendor} />
          <PropertyRow label="Model" value={device.model} />
          <PropertyRow label="OS" value={device.osVersion} />
          <PropertyRow label="Type" value={device.deviceType} />

          <div style={{ marginTop: '16px', marginBottom: '8px', fontWeight: 600, fontSize: '14px' }}>Status</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLORS[device.status] || STATUS_COLORS.unknown }} />
            <span>{(device.status || 'unknown').toUpperCase()}</span>
          </div>

          <div style={{ marginTop: '16px', marginBottom: '8px', fontWeight: 600, fontSize: '14px' }}>Services</div>
          {(services || []).length === 0 && <p style={{ color: '#666' }}>No services</p>}
          {(services || []).map(s => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #2a2a3e' }}>
              <span>{s.name}</span>
              <span style={{
                padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                background: STATUS_COLORS[s.status] || STATUS_COLORS.unknown,
                color: '#fff',
              }}>{s.status || 'UNKNOWN'}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: '12px 16px', borderTop: '1px solid #333', display: 'flex', gap: '8px' }}>
          <QuickActionButton label="Ping" action={() => window.open(`http://${device.ip}`, '_blank')} />
          <QuickActionButton label="Telnet" action={() => {}} disabled />
          <QuickActionButton label="Ack" action={() => {}} />
        </div>
      </div>
    </>
  );
}

function PropertyRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #2a2a3e' }}>
      <span style={{ color: '#999' }}>{label}</span>
      <span style={{ textAlign: 'right', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value || '-'}</span>
    </div>
  );
}

function QuickActionButton({ label, action, disabled }) {
  return (
    <button onClick={action} disabled={disabled} style={{
      flex: 1, padding: '6px', background: disabled ? '#333' : '#2d5270', color: disabled ? '#666' : '#fff',
      border: 'none', borderRadius: '4px', cursor: disabled ? 'default' : 'pointer', fontSize: '12px', fontWeight: 600,
    }}>
      {label}
    </button>
  );
}
