import React, { useState, useEffect, useRef } from 'react';
import { discovery } from './services/api.js';

export default function App() {
  const [health, setHealth] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('theman_token'));
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const dudeFileInputRef = useRef(null);

  useEffect(() => {
    fetch('http://localhost:3000/health')
      .then(r => r.json())
      .then(setHealth)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (token) {
      loadDevices();
    }
  }, [token]);

  const loadDevices = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:3000/api/v1/devices', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setDevices(data);
    } catch (err) {
      console.error('Failed to load devices:', err);
    }
    setLoading(false);
  };

  const login = async (e) => {
    e.preventDefault();
    const username = e.target.username.value;
    const password = e.target.password.value;

    try {
      const res = await fetch('http://localhost:3000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (data.token) {
        localStorage.setItem('theman_token', data.token);
        setToken(data.token);
        alert('✅ Login successful!');
      } else {
        alert('❌ Login failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('❌ Login error: ' + err.message);
    }
  };

  const logout = () => {
    localStorage.removeItem('theman_token');
    setToken(null);
    setDevices([]);
  };

  const handleDudeFileSelected = async (e) => {
    const file = e.target.files[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    setImporting(true);
    try {
      const { jobId } = await discovery.importFromDude(file);

      let job;
      do {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        job = await discovery.getJob(jobId);
      } while (job.status === 'running');

      if (job.status === 'completed') {
        const r = job.result;
        alert(
          `✅ Dude import complete!\n\n` +
            `Devices: ${r.devices}\nServices: ${r.services}\nMaps: ${r.maps}\n` +
            `Links: ${r.links}\nNotes: ${r.notes}\nMetrics: ${r.metrics}\n` +
            `Outages: ${r.outages}\nMetric samples: ${r.metricSamples}` +
            (r.warnings.length ? `\n\n${r.warnings.length} warning(s) - see server logs.` : '')
        );
        loadDevices();
      } else {
        alert('❌ Dude import failed: ' + (job.error || 'Unknown error'));
      }
    } catch (err) {
      alert('❌ Dude import error: ' + err.message);
    }
    setImporting(false);
  };

  if (!token) {
    return (
      <div style={{ 
        padding: '2rem', 
        maxWidth: '400px', 
        margin: '100px auto',
        background: 'white',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔥 The MAN</h1>
        <p style={{ color: '#666', marginBottom: '1rem' }}>
          Backend Health: {health ? '✅ ' + health.status : '⏳ Checking...'}
        </p>
        <form onSubmit={login}>
          <input 
            name="username" 
            placeholder="Username" 
            defaultValue="admin" 
            style={{ 
              display: 'block', 
              width: '100%', 
              padding: '0.75rem', 
              margin: '0.5rem 0',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '1rem'
            }} 
          />
          <input 
            name="password" 
            type="password" 
            placeholder="Password" 
            defaultValue="admin" 
            style={{ 
              display: 'block', 
              width: '100%', 
              padding: '0.75rem', 
              margin: '0.5rem 0',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '1rem'
            }} 
          />
          <button 
            type="submit" 
            style={{ 
              width: '100%',
              padding: '0.75rem', 
              marginTop: '1rem',
              background: '#22c55e', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: 'pointer' 
            }}
          >
            Login to The MAN
          </button>
        </form>
        <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#666' }}>
          Default: admin / admin
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔥 The MAN Dashboard</h1>
          <p style={{ color: '#666' }}>
            Backend: {health ? health.status : 'loading'} | 
            Devices: {devices.length} | 
            Database: {health?.services?.database || 'unknown'}
          </p>
        </div>
        <button 
          onClick={logout}
          style={{ 
            padding: '0.5rem 1rem', 
            background: '#ef4444', 
            color: 'white', 
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Logout
        </button>
      </div>

      <div style={{ 
        background: 'white', 
        padding: '1.5rem', 
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        marginBottom: '2rem'
      }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Monitored Devices</h2>
        {loading ? (
          <p>Loading devices...</p>
        ) : devices.length === 0 ? (
          <p style={{ color: '#666' }}>No devices found. Start a network scan to discover devices!</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Name</th>
                <th style={{ padding: '0.75rem', textAlign: 'left' }}>IP Address</th>
                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Type</th>
                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Status</th>
                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Vendor</th>
              </tr>
            </thead>
            <tbody>
              {devices.map(device => (
                <tr key={device.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '0.75rem' }}>{device.name}</td>
                  <td style={{ padding: '0.75rem', fontFamily: 'monospace' }}>{device.ip}</td>
                  <td style={{ padding: '0.75rem' }}>{device.deviceType}</td>
                  <td style={{ padding: '0.75rem' }}>
                    <span style={{ 
                      padding: '0.25rem 0.75rem',
                      borderRadius: '12px',
                      fontSize: '0.875rem',
                      fontWeight: 'bold',
                      background: device.status === 'UP' ? '#d1fae5' : '#fee2e2',
                      color: device.status === 'UP' ? '#065f46' : '#991b1b'
                    }}>
                      {device.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem' }}>{device.vendor || 'Unknown'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ 
        background: 'white', 
        padding: '1.5rem', 
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Quick Actions</h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button style={{ 
            padding: '0.75rem 1.5rem', 
            background: '#3b82f6', 
            color: 'white', 
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}>
            🔍 Start Network Scan
          </button>
          <input
            type="file"
            accept=".db,.db.gz"
            ref={dudeFileInputRef}
            onChange={handleDudeFileSelected}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => dudeFileInputRef.current?.click()}
            disabled={importing}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: importing ? 'default' : 'pointer',
              fontWeight: 'bold',
              opacity: importing ? 0.6 : 1,
            }}
          >
            {importing ? '⏳ Importing...' : '📥 Import from Dude'}
          </button>
          <button 
            onClick={loadDevices}
            style={{ 
              padding: '0.75rem 1.5rem', 
              background: '#10b981', 
              color: 'white', 
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            🔄 Refresh Devices
          </button>
        </div>
      </div>
    </div>
  );
}
