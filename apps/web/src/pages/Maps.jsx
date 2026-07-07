import React, { useEffect, useState, useCallback } from 'react';
import { maps as mapsApi, devices as devicesApi, services as servicesApi } from '../services/api';
import NetworkMap from '../components/maps/NetworkMap';
import ContextMenu from '../components/maps/ContextMenu';
import DeviceProperties from '../components/maps/DeviceProperties';
import MapToolbar from '../components/maps/MapToolbar';

export default function Maps() {
  const [mapTree, setMapTree] = useState([]);
  const [currentMap, setCurrentMap] = useState(null);
  const [devices, setDevices] = useState([]);
  const [links, setLinks] = useState([]);
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [ctxMenu, setCtxMenu] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [selectedDeviceServices, setSelectedDeviceServices] = useState([]);

  useEffect(() => {
    mapsApi.tree().then(setMapTree).catch(console.error);
  }, []);

  useEffect(() => {
    if (currentMap) {
      mapsApi.get(currentMap.id).then(m => {
        setDevices(m.devices || []);
        setLinks(m.links || []);
      }).catch(console.error);
    }
  }, [currentMap]);

  const navigateToMap = useCallback((map, trail = []) => {
    setCurrentMap(map);
    setBreadcrumb([...trail, map]);
    setSelectedDevice(null);
  }, []);

  useEffect(() => {
    if (mapTree.length > 0 && !currentMap) {
      const loadFirst = async () => {
        const first = mapTree[0];
        const m = await mapsApi.get(first.id);
        navigateToMap(m, [m]);
      };
      loadFirst();
    }
  }, [mapTree, currentMap, navigateToMap]);

  const handleDeviceClick = useCallback(async (d) => {
    setSelectedDevice(d);
    try {
      const svcs = await servicesApi.list({ deviceId: d.id });
      setSelectedDeviceServices(svcs);
    } catch {
      setSelectedDeviceServices([]);
    }
  }, []);

  const handleDeviceContextMenu = useCallback((event, d) => {
    setCtxMenu({
      x: event.clientX, y: event.clientY,
      items: [
        { label: 'Ping', icon: '🔍', action: () => handleDeviceClick(d) },
        { label: 'Telnet', icon: '💻', action: () => {}, disabled: true },
        { label: 'Services', icon: '⚙️', action: () => handleDeviceClick(d) },
        { label: 'Properties', icon: 'ℹ️', action: () => handleDeviceClick(d) },
        { label: '', separator: true },
        { label: 'Acknowledge', icon: '✓', action: () => devicesApi.ack(d.id, { acked: true }) },
        { label: 'Delete', icon: '🗑', action: () => devicesApi.delete(d.id).then(() => {
          setDevices(prev => prev.filter(dv => dv.id !== d.id));
        }) },
      ],
    });
  }, [handleDeviceClick]);

  const handleCanvasContextMenu = useCallback((event) => {
    setCtxMenu({
      x: event.clientX, y: event.clientY,
      items: [
        { label: 'Add Device', icon: '+', action: () => {
          const name = prompt('Device name:');
          if (!name) return;
          devicesApi.create({ name, mapId: currentMap.id }).then(d => {
            setDevices(prev => [...prev, d]);
          });
        }},
        { label: 'Add Submap', icon: '+', action: () => {
          const name = prompt('Submap name:');
          if (!name) return;
          mapsApi.create({ name, parentMapId: currentMap.id }).then(() => {
            mapsApi.tree().then(setMapTree);
          });
        }},
        { label: '', separator: true },
        { label: 'Zoom In', icon: '🔍', action: () => {} },
        { label: 'Zoom Out', icon: '🔍', action: () => {} },
        { label: 'Reset View', icon: '⟲', action: () => {} },
      ],
    });
  }, [currentMap]);

  const handleLinkContextMenu = useCallback((event, link) => {
    setCtxMenu({
      x: event.clientX, y: event.clientY,
      items: [
        { label: 'Properties', icon: 'ℹ️', action: () => alert(`Link: ${link.id}\nBandwidth: ${link.bandwidthMbps || link.bandwidth_mbps || 'N/A'} Mbps`) },
        { label: '', separator: true },
        { label: 'Delete', icon: '🗑', action: () => {} },
      ],
    });
  }, []);

  const handleDeviceMove = useCallback((id, x, y) => {
    if (!currentMap) return;
    mapsApi.updateLayout(currentMap.id, [{ deviceId: id, x, y }]).catch(console.error);
  }, [currentMap]);

  const handleZoomIn = useCallback(() => {
    const svg = document.querySelector('#network-map-svg');
    if (svg) {
      const zoom = d3ZoomFromSvg(svg);
      if (zoom) zoom.scaleBy(svg.__zoom?.k * 1.3 || 1.3);
    }
  }, []);

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 100px)', fontFamily: 'Segoe UI, sans-serif', color: '#e2e8f0' }}>
      <div style={{ width: '240px', background: '#1a1a2e', borderRight: '1px solid #333', overflowY: 'auto', padding: '12px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 12px', color: '#999', textTransform: 'uppercase', letterSpacing: '1px' }}>Maps</h3>
        <MapTreeNode node={mapTree} currentId={currentMap?.id} onClick={(node) => navigateToMap(node, [node])} />
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        {breadcrumb.length > 0 && (
          <div style={{ position: 'absolute', top: 12, left: 160, zIndex: 10, display: 'flex', gap: '4px', fontSize: '12px', color: '#888' }}>
            {breadcrumb.map((m, i) => (
              <span key={m.id}>
                {i > 0 && <span style={{ margin: '0 4px' }}>&gt;</span>}
                <span style={{ cursor: 'pointer', color: i === breadcrumb.length - 1 ? '#e2e8f0' : '#60a5fa' }}
                  onClick={() => navigateToMap(m, breadcrumb.slice(0, i + 1))}>{m.name}</span>
              </span>
            ))}
          </div>
        )}
        <MapToolbar
          onZoomIn={handleZoomIn}
          onZoomOut={useCallback(() => {}, [])}
          onResetView={useCallback(() => {}, [])}
          onAddDevice={() => {
            const name = prompt('Device name:');
            if (!name || !currentMap) return;
            devicesApi.create({ name, mapId: currentMap.id }).then(d => setDevices(prev => [...prev, d]));
          }}
          onAddSubmap={() => {
            const name = prompt('Submap name:');
            if (!name || !currentMap) return;
            mapsApi.create({ name, parentMapId: currentMap.id }).then(() => mapsApi.tree().then(setMapTree));
          }}
        />
        <NetworkMap
          map={currentMap}
          devices={devices}
          links={links}
          onDeviceClick={handleDeviceClick}
          onDeviceContextMenu={handleDeviceContextMenu}
          onCanvasContextMenu={handleCanvasContextMenu}
          onLinkContextMenu={handleLinkContextMenu}
          onDeviceMove={handleDeviceMove}
          selectedDevice={selectedDevice?.id}
        />
      </div>
      {selectedDevice && (
        <DeviceProperties device={selectedDevice} services={selectedDeviceServices} onClose={() => setSelectedDevice(null)} />
      )}
      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />
      )}
    </div>
  );
}

function MapTreeNode({ node, currentId, depth = 0 }) {
  if (!node) return null;
  if (Array.isArray(node)) {
    return (
      <div>
        {node.map(n => <MapTreeNode key={n.id} node={n} currentId={currentId} depth={depth} />)}
      </div>
    );
  }
  const isCurrent = node.id === currentId;
  return (
    <div>
      <div onClick={() => node.onClick ? node.onClick(node) : {}}
        style={{
          padding: '6px 8px 6px ' + (depth * 16 + 8) + 'px', cursor: 'pointer', borderRadius: '4px',
          background: isCurrent ? '#2d5270' : 'transparent', fontSize: '13px',
          color: isCurrent ? '#fff' : '#ccc', marginBottom: '2px',
        }}
        onMouseEnter={e => { if (!isCurrent) e.target.style.background = '#2a2a3e'; }}
        onMouseLeave={e => { if (!isCurrent) e.target.style.background = 'transparent'; }}>
        {node.name}
        {node.deviceCount > 0 && <span style={{ color: '#666', marginLeft: '6px', fontSize: '11px' }}>({node.deviceCount})</span>}
      </div>
      {node.submaps && node.submaps.map(sm => (
        <MapTreeNode key={sm.id} node={sm} currentId={currentId} depth={depth + 1} />
      ))}
    </div>
  );
}
