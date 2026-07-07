import React, { useState, useEffect, useRef } from 'react';
import { discovery, auth } from './services/api';
import Settings from './pages/Settings';
import PasswordChangeModal from './components/PasswordChangeModal';

export default function App() {
  const [health, setHealth] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('theman_token'));
  const [user, setUser] = useState(null);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [view, setView] = useState('dashboard');
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const dudeFileInputRef = useRef(null);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || ''}/health`)
      .then(r => r.json())
      .then(setHealth)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (token) {
      auth.me().then(u => {
        setUser(u);
        if (u.mustChangePassword) {
          setMustChangePassword(true);
        }
      }).catch(() => {
        localStorage.removeItem('theman_token');
        setToken(null);
      });
      loadDevices();
    }
  }, [token]);

  const loadDevices = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/devices`, {
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
      const data = await auth.login(username, password);
      setToken(data.token);
      setUser(data.user);
      if (data.user.mustChangePassword) {
        setMustChangePassword(true);
      }
    } catch (err) {
      alert('Login failed: ' + err.message);
    }
  };

  const logout = () => {
    auth.logout().catch(() => {});
    localStorage.removeItem('theman_token');
    setToken(null);
    setUser(null);
    setDevices([]);
    setView('dashboard');
    setMustChangePassword(false);
  };

  const handlePasswordChanged = () => {
    setMustChangePassword(false);
    auth.me().then(u => setUser(u));
  };

  const handleDudeFileSelected = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
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
          `Dude import complete!\n\n` +
            `Devices: ${r.devices}\nServices: ${r.services}\nMaps: ${r.maps}\n` +
            `Links: ${r.links}\nNotes: ${r.notes}\nMetrics: ${r.metrics}\n` +
            `Outages: ${r.outages}\nMetric samples: ${r.metricSamples}` +
            (r.warnings.length ? `\n\n${r.warnings.length} warning(s) - see server logs.` : '')
        );
        loadDevices();
      } else {
        alert('Dude import failed: ' + (job.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Dude import error: ' + err.message);
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
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>The MAN</h1>
        <p style={{ color: '#666', marginBottom: '1rem' }}>
          Backend Health: {health ? health.status : 'Checking...'}
        </p>
        <form onSubmit={login}>
          <input
            name="username"
            placeholder="Username"
            defaultValue="admin"
            style={inputStyle}
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            defaultValue="admin"
            style={inputStyle}
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

  if (mustChangePassword) {
    return (
      <PasswordChangeModal
        username={user?.username || 'admin'}
        onComplete={handlePasswordChanged}
      />
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem'
      }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>The MAN Dashboard</h1>
          <p style={{ color: '#666' }}>
            Backend: {health ? health.status : 'loading'} |
            Devices: {devices.length} |
            Database: {health?.services?.database || 'unknown'} |
            Logged in as: <strong>{user?.username}</strong> ({user?.role})
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setView(view === 'settings' ? 'dashboard' : 'settings')}
            style={{
              padding: '0.5rem 1rem',
              background: view === 'settings' ? '#22c55e' : '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            {view === 'settings' ? 'Dashboard' : 'Settings'}
          </button>
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
      </div>

      {view === 'settings' ? (
        <Settings user={user} />
      ) : (
        <>
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
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>IP Address</th>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Vendor</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map(device => (
                    <tr key={device.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={tdStyle}>{device.name}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{device.ip}</td>
                      <td style={tdStyle}>{device.deviceType}</td>
                      <td style={tdStyle}>
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
                      <td style={tdStyle}>{device.vendor || 'Unknown'}</td>
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
                Start Network Scan
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
                {importing ? 'Importing...' : 'Import from Dude'}
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
                Refresh Devices
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const inputStyle = {
  display: 'block',
  width: '100%',
  padding: '0.75rem',
  margin: '0.5rem 0',
  border: '1px solid #ddd',
  borderRadius: '4px',
  fontSize: '1rem',
  boxSizing: 'border-box'
};

const thStyle = {
  padding: '0.75rem',
  textAlign: 'left',
  fontSize: '0.8rem',
  fontWeight: 'bold',
  color: '#6b7280',
  textTransform: 'uppercase'
};

const tdStyle = {
  padding: '0.75rem',
  fontSize: '0.9rem'
};
