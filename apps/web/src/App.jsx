import React, { useState, useEffect, useRef } from 'react';
import { discovery, auth } from './services/api';
import Settings from './pages/Settings';
import PasswordChangeModal from './components/PasswordChangeModal';
import DeviceList from './components/devices/DeviceList';

export default function App() {
  const [health, setHealth] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('theman_token'));
  const [user, setUser] = useState(null);
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
        if (u.mustChangePassword) setMustChangePassword(true);
      }).catch(() => {
        localStorage.removeItem('theman_token');
        setToken(null);
      });
    }
  }, [token]);

  const login = async (e) => {
    e.preventDefault();
    const username = e.target.username.value;
    const password = e.target.password.value;
    try {
      const data = await auth.login(username, password);
      setToken(data.token);
      setUser(data.user);
      if (data.user.mustChangePassword) setMustChangePassword(true);
    } catch (err) {
      alert('Login failed: ' + err.message);
    }
  };

  const logout = () => {
    auth.logout().catch(() => {});
    localStorage.removeItem('theman_token');
    setToken(null);
    setUser(null);
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
      <div style={{ padding: '2rem', maxWidth: '400px', margin: '100px auto', background: 'white', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>The MAN</h1>
        <p style={{ color: '#666', marginBottom: '1rem' }}>
          Backend Health: {health ? health.status : 'Checking...'}
        </p>
        <form onSubmit={login}>
          <input name="username" placeholder="Username" defaultValue="admin" style={inputStyle} />
          <input name="password" type="password" placeholder="Password" defaultValue="admin" style={inputStyle} />
          <button type="submit" style={{
            width: '100%', padding: '0.75rem', marginTop: '1rem',
            background: '#22c55e', color: 'white', border: 'none',
            borderRadius: '4px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer'
          }}>
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
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>The MAN Dashboard</h1>
          <p style={{ color: '#666' }}>
            Backend: {health ? health.status : 'loading'} |
            Database: {health?.services?.database || 'unknown'} |
            Logged in as: <strong>{user?.username}</strong> ({user?.role})
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <input type="file" accept=".db,.db.gz" ref={dudeFileInputRef} onChange={handleDudeFileSelected} style={{ display: 'none' }} />
            <button onClick={() => dudeFileInputRef.current?.click()} disabled={importing}
              style={{
                padding: '0.5rem 1rem', background: '#8b5cf6', color: 'white',
                border: 'none', borderRadius: '4px', cursor: importing ? 'default' : 'pointer',
                fontWeight: 'bold', opacity: importing ? 0.6 : 1,
              }}>
              {importing ? 'Importing...' : 'Import from Dude'}
            </button>
          </div>
          <button onClick={() => setView(view === 'settings' ? 'dashboard' : 'settings')}
            style={{
              padding: '0.5rem 1rem', background: view === 'settings' ? '#22c55e' : '#6b7280',
              color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
            }}>
            {view === 'settings' ? 'Dashboard' : 'Settings'}
          </button>
          <button onClick={logout}
            style={{
              padding: '0.5rem 1rem', background: '#ef4444', color: 'white',
              border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
            }}>
            Logout
          </button>
        </div>
      </div>

      {view === 'settings' ? (
        <Settings user={user} />
      ) : (
        <DeviceList />
      )}
    </div>
  );
}

const inputStyle = {
  display: 'block', width: '100%', padding: '0.75rem',
  margin: '0.5rem 0', border: '1px solid #ddd',
  borderRadius: '4px', fontSize: '1rem', boxSizing: 'border-box'
};
