import React, { useState, useEffect, useRef, useCallback } from 'react';
import { discovery, auth, devices as apiDevices } from './services/api';
import Settings from './pages/Settings';
import PasswordChangeModal from './components/PasswordChangeModal';

export default function App() {
  const [health, setHealth] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('theman_token'));
  const [user, setUser] = useState(null);
  const [devices, setDevices] = useState([]);
  const [totalDevices, setTotalDevices] = useState(0);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [view, setView] = useState('dashboard');
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);
  const [selectedDevices, setSelectedDevices] = useState(new Set());
  const [expandedDevice, setExpandedDevice] = useState(null);
  const dudeFileInputRef = useRef(null);
  const searchRef = useRef('');
  const sortByRef = useRef('name');
  const sortOrderRef = useRef('asc');
  const pageRef = useRef(0);

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
    }
  }, [token]);

  const searchTimerRef = useRef(null);

  useEffect(() => {
    if (!token) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => loadDevices(), 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [token, search, sortBy, sortOrder, page]);

  const loadDevices = useCallback(async (opts = {}) => {
    setLoading(true);
    try {
      const s = opts.search !== undefined ? opts.search : searchRef.current;
      const sb = opts.sortBy !== undefined ? opts.sortBy : sortByRef.current;
      const so = opts.sortOrder !== undefined ? opts.sortOrder : sortOrderRef.current;
      const p = opts.page !== undefined ? opts.page : pageRef.current;

      const params = { limit: pageSize, offset: p * pageSize, sortBy: sb, sortOrder: so };
      if (s) params.search = s;

      const data = await apiDevices.list(params);
      setDevices(data.devices);
      setTotalDevices(data.total);
    } catch (err) {
      console.error('Failed to load devices:', err);
    }
    setLoading(false);
  }, [pageSize]);

  const handleSort = (column) => {
    const newOrder = sortByRef.current === column && sortOrderRef.current === 'asc' ? 'desc' : 'asc';
    sortByRef.current = column;
    sortOrderRef.current = newOrder;
    pageRef.current = 0;
    setSortBy(column);
    setSortOrder(newOrder);
    setPage(0);
    setExpandedDevice(null);
  };

  const handleSearch = (e) => {
    searchRef.current = e.target.value;
    pageRef.current = 0;
    setSearch(e.target.value);
    setPage(0);
    setExpandedDevice(null);
  };

  const goToPage = (p) => {
    pageRef.current = p;
    setPage(p);
    setExpandedDevice(null);
  };

  const toggleSelect = (id) => {
    setSelectedDevices(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedDevices.size === devices.length) {
      setSelectedDevices(new Set());
    } else {
      setSelectedDevices(new Set(devices.map(d => d.id)));
    }
  };

  const totalPages = Math.ceil(totalDevices / pageSize);

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
            Devices: {totalDevices} |
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.5rem' }}>Monitored Devices</h2>
              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                {totalDevices} device{totalDevices !== 1 ? 's' : ''}
                {selectedDevices.size > 0 && ` (${selectedDevices.size} selected)`}
              </span>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="Search name, IP, MAC, vendor, model, type..."
                value={search}
                onChange={handleSearch}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            {loading ? (
              <p style={{ color: '#6b7280' }}>Loading devices...</p>
            ) : devices.length === 0 ? (
              <p style={{ color: '#6b7280' }}>
                {search ? 'No devices match your search.' : 'No devices found. Start a network scan or import from Dude!'}
              </p>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                        <th style={{ ...thStyle, width: '2rem' }}>
                          <input type="checkbox" onChange={toggleSelectAll} checked={selectedDevices.size === devices.length && devices.length > 0} />
                        </th>
                        <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('name')}>
                          Name {sortBy === 'name' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                        </th>
                        <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('ip')}>
                          IP Address {sortBy === 'ip' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                        </th>
                        <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('macAddress')}>
                          MAC Address {sortBy === 'macAddress' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                        </th>
                        <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('deviceType')}>
                          Type {sortBy === 'deviceType' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                        </th>
                        <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('status')}>
                          Status {sortBy === 'status' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                        </th>
                        <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('vendor')}>
                          Vendor {sortBy === 'vendor' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                        </th>
                        <th style={{ ...thStyle }}>Model</th>
                      </tr>
                    </thead>
                    <tbody>
                      {devices.map(device => (
                        <React.Fragment key={device.id}>
                          <tr
                            style={{
                              borderBottom: '1px solid #e5e7eb',
                              background: selectedDevices.has(device.id) ? '#f0fdf4' : 'transparent',
                              cursor: 'pointer'
                            }}
                            onClick={() => setExpandedDevice(expandedDevice === device.id ? null : device.id)}
                          >
                            <td style={tdStyle} onClick={e => e.stopPropagation()}>
                              <input type="checkbox" checked={selectedDevices.has(device.id)} onChange={() => toggleSelect(device.id)} />
                            </td>
                            <td style={{ ...tdStyle, fontWeight: 500 }}>{device.name}</td>
                            <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{device.ip}</td>
                            <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '0.8rem' }}>{device.macAddress || '-'}</td>
                            <td style={tdStyle}>{device.deviceType}</td>
                            <td style={tdStyle}>
                              <span style={statusBadge(device.status)}>{device.status}</span>
                            </td>
                            <td style={tdStyle}>{device.vendor || '-'}</td>
                            <td style={tdStyle}>{device.model || '-'}</td>
                          </tr>
                          {expandedDevice === device.id && (
                            <tr style={{ background: '#f9fafb' }}>
                              <td colSpan={8} style={{ padding: '1rem 0.75rem' }}>
                                <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
                                  <div><strong>OS/Version:</strong> {device.osVersion || '-'}</div>
                                  <div><strong>Last Seen:</strong> {device.lastSeen ? new Date(device.lastSeen).toLocaleString() : '-'}</div>
                                  <div><strong>Map ID:</strong> {device.mapId || '-'}</div>
                                  <div><strong>Dude ID:</strong> {device.dudeId ?? '-'}</div>
                                  <div><strong>Position:</strong> {device.positionX != null ? `${device.positionX}, ${device.positionY}` : '-'}</div>
                                  <div><strong>Icon:</strong> {device.icon || '-'}</div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                    Page {page + 1} of {totalPages || 1}
                  </span>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button onClick={() => goToPage(0)} disabled={page === 0} style={pageBtnStyle} title="First page">«</button>
                    <button onClick={() => goToPage(page - 1)} disabled={page === 0} style={pageBtnStyle} title="Previous page">‹</button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const start = Math.max(0, Math.min(page - 2, totalPages - 5));
                      const p = start + i;
                      return (
                        <button
                          key={p}
                          onClick={() => goToPage(p)}
                          style={{ ...pageBtnStyle, background: p === page ? '#3b82f6' : 'white', color: p === page ? 'white' : '#374151', fontWeight: p === page ? 'bold' : 'normal' }}
                        >
                          {p + 1}
                        </button>
                      );
                    })}
                    <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages - 1} style={pageBtnStyle} title="Next page">›</button>
                    <button onClick={() => goToPage(totalPages - 1)} disabled={page >= totalPages - 1} style={pageBtnStyle} title="Last page">»</button>
                  </div>
                  <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                    {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalDevices)} of {totalDevices}
                  </span>
                </div>
              </>
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

const statusColor = {
  UP: { bg: '#d1fae5', fg: '#065f46' },
  DOWN: { bg: '#fee2e2', fg: '#991b1b' },
  UNKNOWN: { bg: '#fef3c7', fg: '#92400e' },
  WARNING: { bg: '#ffedd5', fg: '#9a3412' },
};

const statusBadge = (status) => ({
  padding: '0.25rem 0.75rem',
  borderRadius: '12px',
  fontSize: '0.8rem',
  fontWeight: 'bold',
  background: (statusColor[status] || statusColor.UNKNOWN).bg,
  color: (statusColor[status] || statusColor.UNKNOWN).fg,
});

const pageBtnStyle = {
  padding: '0.35rem 0.65rem',
  border: '1px solid #d1d5db',
  borderRadius: '4px',
  background: 'white',
  color: '#374151',
  fontSize: '0.85rem',
  cursor: 'pointer',
  minWidth: '2rem',
};

const thStyle = {
  padding: '0.75rem',
  textAlign: 'left',
  fontSize: '0.8rem',
  fontWeight: 'bold',
  color: '#6b7280',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '0.75rem',
  fontSize: '0.9rem',
  whiteSpace: 'nowrap',
};
