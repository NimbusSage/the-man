import React, { useState, useEffect, useRef, useCallback } from 'react';
import { devices as apiDevices, maps } from '../../services/api';

const COLUMNS = {
  name:          { label: 'Name',          sortable: 'name',          default: true },
  ip:            { label: 'Addresses',      sortable: 'ip',            default: true },
  mac:           { label: 'MAC',            sortable: 'macAddress',    default: true },
  type:          { label: 'Type',           sortable: 'deviceType',    default: true },
  maps:          { label: 'Maps',           sortable: 'mapName',       default: true },
  servicesDown:  { label: 'Services Down',  sortable: 'servicesCritical', default: true },
  notes:         { label: 'Notes',          sortable: null,            default: true },
  status:        { label: 'Status',         sortable: 'status',        default: false },
  vendor:        { label: 'Vendor',         sortable: 'vendor',        default: false },
  model:         { label: 'Model',          sortable: 'model',         default: false },
  os:            { label: 'OS',             sortable: 'osVersion',     default: false },
  lastSeen:      { label: 'Last Seen',      sortable: 'lastSeen',      default: false },
};

const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'UP', label: 'Up' },
  { value: 'DOWN', label: 'Down' },
  { value: 'WARNING', label: 'Warning' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

const SERVICE_STATUS_OPTIONS = [
  { value: '', label: 'Service state: Any' },
  { value: 'up', label: 'Service state: Up (all OK)' },
  { value: 'down', label: 'Service state: Down (all critical)' },
  { value: 'partial', label: 'Service state: Partially down' },
  { value: 'unknown', label: 'Service state: Unknown (no probes)' },
  { value: 'acked', label: 'Service state: Acked' },
];

const STATUS_COLORS = {
  UP:      { bg: '#d1fae5', fg: '#065f46' },
  DOWN:    { bg: '#fee2e2', fg: '#991b1b' },
  WARNING: { bg: '#ffedd5', fg: '#9a3412' },
  UNKNOWN: { bg: '#fef3c7', fg: '#92400e' },
};

const STATUS_BADGE = (s) => ({
  padding: '0.2rem 0.6rem',
  borderRadius: '10px',
  fontSize: '0.78rem',
  fontWeight: 600,
  background: (STATUS_COLORS[s] || STATUS_COLORS.UNKNOWN).bg,
  color: (STATUS_COLORS[s] || STATUS_COLORS.UNKNOWN).fg,
});

export default function DeviceList({ onLogout }) {
  const [devices, setDevices] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [serviceStatusFilter, setServiceStatusFilter] = useState('');
  const [deviceTypeFilter, setDeviceTypeFilter] = useState('');
  const [mapIdFilter, setMapIdFilter] = useState('');

  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const [visibleCols, setVisibleCols] = useState(() => {
    try { return JSON.parse(localStorage.getItem('device_cols') || 'null') || Object.keys(COLUMNS).filter(k => COLUMNS[k].default); }
    catch { return Object.keys(COLUMNS).filter(k => COLUMNS[k].default); }
  });
  const [showColConfig, setShowColConfig] = useState(false);

  const [selected, setSelected] = useState(new Set());
  const [expandedId, setExpandedId] = useState(null);

  const [mapTree, setMapTree] = useState([]);
  const [flatMaps, setFlatMaps] = useState([]);
  const [deviceTypes, setDeviceTypes] = useState([]);
  const [showMapTree, setShowMapTree] = useState(false);

  const searchTimer = useRef(null);
  const colConfigRef = useRef(null);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        limit: pageSize, offset: page * pageSize,
        sortBy, sortOrder,
      };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (serviceStatusFilter) params.serviceStatus = serviceStatusFilter;
      if (deviceTypeFilter) params.deviceType = deviceTypeFilter;
      if (mapIdFilter) params.mapId = mapIdFilter;

      const data = await apiDevices.list(params);
      setDevices(data.devices);
      setTotal(data.total);
    } catch (err) {
      setError(err.message);
      setDevices([]);
      setTotal(0);
    }
    setLoading(false);
  }, [search, statusFilter, serviceStatusFilter, deviceTypeFilter, mapIdFilter, sortBy, sortOrder, page, pageSize]);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(loadDevices, 300);
    return () => clearTimeout(searchTimer.current);
  }, [loadDevices]);

  useEffect(() => {
    maps.tree().then(setMapTree).catch(() => {});
    maps.list().then(setFlatMaps).catch(() => {});
    apiDevices.types().then(setDeviceTypes).catch(() => {});
  }, []);

  useEffect(() => {
    const handleClick = (e) => {
      if (colConfigRef.current && !colConfigRef.current.contains(e.target)) {
        setShowColConfig(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    localStorage.setItem('device_cols', JSON.stringify(visibleCols));
  }, [visibleCols]);

  const totalPages = Math.ceil(total / pageSize);

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortOrder('asc');
    }
    setPage(0);
    setExpandedId(null);
  };

  const handleSearch = (e) => {
    setSearch(e.target.value);
    setPage(0);
    setExpandedId(null);
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setServiceStatusFilter('');
    setDeviceTypeFilter('');
    setMapIdFilter('');
    setPage(0);
    setExpandedId(null);
  };

  const hasFilters = search || statusFilter || serviceStatusFilter || deviceTypeFilter || mapIdFilter;

  const toggleCol = (key) => {
    setVisibleCols(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === devices.length && devices.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(devices.map(d => d.id)));
    }
  };

  const loadDevicesNow = () => {
    clearTimeout(searchTimer.current);
    loadDevices();
  };

  const doExport = async (format) => {
    try {
      const params = {
        sortBy, sortOrder,
      };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (serviceStatusFilter) params.serviceStatus = serviceStatusFilter;
      if (deviceTypeFilter) params.deviceType = deviceTypeFilter;
      if (mapIdFilter) params.mapId = mapIdFilter;

      const blob = await apiDevices.exportList(params, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `devices.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed: ' + err.message);
    }
  };

  const handleAckDevice = async (device, note = '') => {
    try {
      await apiDevices.ack(device.id, { acked: !device.acked, note });
      loadDevicesNow();
    } catch (err) {
      alert('Failed to update ack status: ' + err.message);
    }
  };

  const selectMap = (mapId) => {
    setMapIdFilter(mapId);
    setShowMapTree(false);
    setPage(0);
    setExpandedId(null);
  };

  const sortIndicator = (col) => {
    if (sortBy !== col) return '';
    return sortOrder === 'asc' ? ' ▲' : ' ▼';
  };

  function MapTreeNode({ node, depth }) {
    const [open, setOpen] = useState(depth === 0);
    const hasSubmaps = node.submaps && node.submaps.length > 0;
    const isActive = mapIdFilter === node.id;
    return (
      <div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.25rem',
          padding: '0.25rem 0.5rem 0.25rem ' + (depth * 1.2 + 0.25) + 'rem',
          cursor: 'pointer', borderRadius: '4px',
          background: isActive ? '#e0f2fe' : 'transparent',
          fontWeight: isActive ? 600 : 400,
          fontSize: '0.85rem',
          whiteSpace: 'nowrap',
        }}>
          {hasSubmaps ? (
            <span onClick={() => setOpen(!open)} style={{ width: '1rem', cursor: 'pointer', userSelect: 'none' }}>
              {open ? '▾' : '▸'}
            </span>
          ) : <span style={{ width: '1rem' }} />}
          <span onClick={() => selectMap(node.id)} style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {node.name}
          </span>
          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
            {node.deviceCount}
          </span>
        </div>
        {open && hasSubmaps && node.submaps.map(sm => (
          <MapTreeNode key={sm.id} node={sm} depth={depth + 1} />
        ))}
      </div>
    );
  }

  const renderCell = (device, colKey) => {
    switch (colKey) {
      case 'name':
        return <span style={{ fontWeight: 500 }}>{device.name}</span>;
      case 'ip':
        return <span style={{ fontFamily: 'monospace' }}>{device.ip}</span>;
      case 'mac':
        return <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{device.macAddress || '-'}</span>;
      case 'type':
        return device.deviceType;
      case 'status':
        return <span style={STATUS_BADGE(device.status)}>{device.status}</span>;
      case 'vendor':
        return device.vendor || '-';
      case 'model':
        return device.model || '-';
      case 'os':
        return device.osVersion || '-';
      case 'maps':
        return device.mapName || '-';
      case 'lastSeen':
        return device.lastSeen ? new Date(device.lastSeen).toLocaleString() : '-';
      case 'servicesDown': {
        const c = device.servicesCritical || 0;
        const w = device.servicesWarning || 0;
        const t = device.serviceCount || 0;
        return (
          <span style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
            {t > 0 ? (
              <>
                <span style={{ ...STATUS_BADGE(c > 0 ? 'DOWN' : 'UP'), fontSize: '0.75rem', padding: '0.1rem 0.4rem' }}>
                  {c} down
                </span>
                {w > 0 && (
                  <span style={{ ...STATUS_BADGE('WARNING'), fontSize: '0.75rem', padding: '0.1rem 0.4rem' }}>
                    {w} warn
                  </span>
                )}
                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{t} total</span>
              </>
            ) : (
              <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>No services</span>
            )}
          </span>
        );
      }
      case 'notes': {
        const preview = device.notePreview;
        return preview ? (
          <span title={preview} style={{ cursor: 'help', fontSize: '0.85rem' }}>
            {preview.length > 30 ? preview.slice(0, 30) + '…' : preview}
          </span>
        ) : (
          <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{device.noteCount > 0 ? '…' : '-'}</span>
        );
      }
      default:
        return '-';
    }
  };

  return (
    <div style={{ display: 'flex', gap: '1rem', minHeight: '60vh' }}>
      {/* Map Tree Sidebar */}
      {showMapTree && (
        <div style={{
          width: '280px', flexShrink: 0,
          background: 'white', borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          padding: '0.75rem', overflowY: 'auto', maxHeight: '70vh',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <strong style={{ fontSize: '0.9rem' }}>Network Maps</strong>
            <button onClick={() => { setShowMapTree(false); setMapIdFilter(''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: '#6b7280' }}>
              ✕
            </button>
          </div>
          {mapTree.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>No maps found</p>
          ) : (
            mapTree.map(m => <MapTreeNode key={m.id} node={m} depth={0} />)
          )}
        </div>
      )}

      {/* Main Device List */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          background: 'white', borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)', padding: '1.5rem',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h2 style={{ fontSize: '1.5rem', margin: 0 }}>Monitored Devices</h2>
              <button onClick={() => setShowMapTree(!showMapTree)}
                style={{
                  padding: '0.3rem 0.6rem', fontSize: '0.8rem',
                  background: showMapTree ? '#e0f2fe' : '#f3f4f6',
                  border: '1px solid #d1d5db', borderRadius: '4px',
                  cursor: 'pointer', color: showMapTree ? '#0369a1' : '#374151',
                }}>
                {showMapTree ? 'Hide Maps' : 'Maps ▸'}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                {total} device{total !== 1 ? 's' : ''}
                {selected.size > 0 && ` (${selected.size} selected)`}
              </span>

              {/* Column config */}
              <div style={{ position: 'relative' }} ref={colConfigRef}>
                <button onClick={() => setShowColConfig(!showColConfig)}
                  style={{
                    padding: '0.3rem 0.6rem', fontSize: '0.85rem',
                    background: '#f3f4f6', border: '1px solid #d1d5db',
                    borderRadius: '4px', cursor: 'pointer',
                  }}>
                  ⚙ Columns
                </button>
                {showColConfig && (
                  <div style={{
                    position: 'absolute', right: 0, top: '100%', marginTop: '0.25rem',
                    background: 'white', border: '1px solid #d1d5db', borderRadius: '6px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)', padding: '0.5rem',
                    zIndex: 50, minWidth: '180px',
                  }}>
                    {Object.entries(COLUMNS).map(([key, col]) => (
                      <label key={key} style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.3rem 0.5rem', cursor: 'pointer',
                        fontSize: '0.85rem', borderRadius: '3px',
                      }}>
                        <input type="checkbox" checked={visibleCols.includes(key)}
                          onChange={() => toggleCol(key)} />
                        {col.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Export */}
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button onClick={() => doExport('csv')}
                  style={{
                    padding: '0.3rem 0.6rem', fontSize: '0.8rem',
                    background: '#f0fdf4', border: '1px solid #86efac',
                    borderRadius: '4px', cursor: 'pointer', color: '#166534',
                  }}>
                  CSV
                </button>
                <button onClick={() => doExport('json')}
                  style={{
                    padding: '0.3rem 0.6rem', fontSize: '0.8rem',
                    background: '#fffbeb', border: '1px solid #fcd34d',
                    borderRadius: '4px', cursor: 'pointer', color: '#92400e',
                  }}>
                  JSON
                </button>
              </div>

              <button onClick={loadDevicesNow}
                style={{
                  padding: '0.3rem 0.6rem', fontSize: '0.8rem',
                  background: '#f3f4f6', border: '1px solid #d1d5db',
                  borderRadius: '4px', cursor: 'pointer',
                }}>
                Refresh
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
            <input type="text" placeholder="Search name, IP, MAC, vendor..."
              value={search} onChange={handleSearch}
              style={{
                flex: '1 1 200px', padding: '0.45rem 0.6rem',
                border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.85rem',
              }} />
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
              style={selectStyle}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={serviceStatusFilter} onChange={e => { setServiceStatusFilter(e.target.value); setPage(0); }}
              style={selectStyle}>
              {SERVICE_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={deviceTypeFilter} onChange={e => { setDeviceTypeFilter(e.target.value); setPage(0); }}
              style={selectStyle}>
              <option value="">All types</option>
              {deviceTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={mapIdFilter} onChange={e => { setMapIdFilter(e.target.value); setPage(0); }}
              style={{ ...selectStyle, maxWidth: '200px' }}>
              <option value="">All maps</option>
              {flatMaps.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            {hasFilters && (
              <button onClick={clearFilters}
                style={{
                  padding: '0.3rem 0.6rem', fontSize: '0.8rem',
                  background: '#fee2e2', border: '1px solid #fecaca',
                  borderRadius: '4px', cursor: 'pointer', color: '#991b1b',
                }}>
                Clear filters
              </button>
            )}
          </div>

          {/* Table */}
          {loading ? (
            <p style={{ color: '#6b7280', padding: '2rem 0', textAlign: 'center' }}>Loading devices...</p>
          ) : error ? (
            <p style={{ color: '#dc2626', padding: '2rem 0', textAlign: 'center' }}>Error: {error}</p>
          ) : devices.length === 0 ? (
            <p style={{ color: '#9ca3af', padding: '2rem 0', textAlign: 'center' }}>
              {hasFilters ? 'No devices match your filters.' : 'No devices found.'}
            </p>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                      <th style={{ ...thStyle, width: '2rem' }}>
                        <input type="checkbox" onChange={toggleSelectAll}
                          checked={selected.size === devices.length && devices.length > 0} />
                      </th>
                      {visibleCols.map(key => {
                        const col = COLUMNS[key];
                        if (!col) return null;
                        return (
                          <th key={key} style={{
                            ...thStyle, cursor: col.sortable ? 'pointer' : 'default',
                            userSelect: 'none', whiteSpace: 'nowrap',
                          }}
                            onClick={() => col.sortable && handleSort(col.sortable)}>
                            {col.label}{col.sortable ? sortIndicator(col.sortable) : ''}
                          </th>
                        );
                      })}
                      <th style={{ ...thStyle, width: '3rem' }}>Ack</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map(device => {
                      const isAcked = device.acked;
                      const baseBg = isAcked ? '#eff6ff' :
                        selected.has(device.id) ? '#f0fdf4' : 'transparent';
                      return (
                        <React.Fragment key={device.id}>
                          <tr style={{
                            borderBottom: '1px solid #e5e7eb',
                            background: baseBg,
                            cursor: 'pointer',
                          }}
                            onClick={() => setExpandedId(expandedId === device.id ? null : device.id)}>
                            <td style={tdStyle} onClick={e => e.stopPropagation()}>
                              <input type="checkbox" checked={selected.has(device.id)}
                                onChange={() => toggleSelect(device.id)} />
                            </td>
                            {visibleCols.map(key => (
                              <td key={key} style={tdStyle}>
                                {renderCell(device, key)}
                              </td>
                            ))}
                            <td style={tdStyle} onClick={e => e.stopPropagation()}>
                              <button onClick={() => handleAckDevice(device)}
                                style={{
                                  padding: '0.2rem 0.5rem', fontSize: '0.75rem',
                                  border: '1px solid #d1d5db', borderRadius: '4px',
                                  cursor: 'pointer',
                                  background: isAcked ? '#dbeafe' : '#f3f4f6',
                                  color: isAcked ? '#1e40af' : '#6b7280',
                                }}>
                                {isAcked ? 'Acked' : 'Ack'}
                              </button>
                            </td>
                          </tr>
                          {expandedId === device.id && (
                            <tr style={{ background: '#f9fafb' }}>
                              <td colSpan={visibleCols.length + 2}
                                style={{ padding: '1rem 0.75rem' }}>
                                <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
                                  <div><strong>OS:</strong> {device.osVersion || '-'}</div>
                                  <div><strong>Last Seen:</strong> {device.lastSeen ? new Date(device.lastSeen).toLocaleString() : '-'}</div>
                                  <div><strong>Map:</strong> {device.mapName || '-'}</div>
                                  <div><strong>Dude ID:</strong> {device.dudeId ?? '-'}</div>
                                  <div><strong>Position:</strong> {device.positionX != null ? `${Math.round(device.positionX)}, ${Math.round(device.positionY)}` : '-'}</div>
                                  <div><strong>Icon:</strong> {device.icon || '-'}</div>
                                  <div><strong>Ack Note:</strong> {device.ackNote || '-'}</div>
                                </div>
                                {device.notes && device.notes.length > 0 && (
                                  <div style={{ marginTop: '0.75rem' }}>
                                    <strong style={{ fontSize: '0.85rem' }}>Notes:</strong>
                                    {device.notes.map(n => (
                                      <p key={n.id} style={{ fontSize: '0.8rem', margin: '0.25rem 0', color: '#4b5563' }}>{n.text}</p>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginTop: '1rem', gap: '0.5rem',
              }}>
                <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                  Page {page + 1} of {totalPages || 1}
                </span>
                <div style={{ display: 'flex', gap: '0.15rem' }}>
                  <PageBtn onClick={() => setPage(0)} disabled={page === 0} label="«" />
                  <PageBtn onClick={() => setPage(page - 1)} disabled={page === 0} label="‹" />
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const start = Math.max(0, Math.min(page - 2, totalPages - 5));
                    const p = start + i;
                    return (
                      <PageBtn key={p} onClick={() => setPage(p)}
                        active={p === page} label={String(p + 1)} />
                    );
                  })}
                  <PageBtn onClick={() => setPage(page + 1)} disabled={page >= totalPages - 1} label="›" />
                  <PageBtn onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} label="»" />
                </div>
                <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                  {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PageBtn({ onClick, disabled, active, label }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        padding: '0.3rem 0.55rem', minWidth: '1.8rem',
        border: '1px solid #d1d5db', borderRadius: '4px',
        background: active ? '#3b82f6' : 'white',
        color: active ? 'white' : '#374151',
        fontWeight: active ? 600 : 400,
        fontSize: '0.85rem', cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
      }}>
      {label}
    </button>
  );
}

const selectStyle = {
  padding: '0.45rem 0.6rem',
  border: '1px solid #d1d5db',
  borderRadius: '4px',
  fontSize: '0.85rem',
  background: 'white',
};

const thStyle = {
  padding: '0.6rem 0.75rem',
  textAlign: 'left',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.02em',
};

const tdStyle = {
  padding: '0.5rem 0.75rem',
  fontSize: '0.85rem',
  whiteSpace: 'nowrap',
};
