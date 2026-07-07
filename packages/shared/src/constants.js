export const THEME_DUDE_CLASSIC = {
  canvas: { bg: '#1a1a2e', grid: '#16213e', gridSize: 50 },
  device: {
    up: '#22c55e', down: '#ef4444', warning: '#f59e0b', unknown: '#6b7280',
    stroke: '#ffffff', strokeWidth: 2, label: '#e2e8f0', ip: '#94a3b8',
  },
  link: {
    lowUtil: '#22c55e', midUtil: '#f59e0b', highUtil: '#ef4444',
    defaultWidth: 2, bg: '#334155',
  },
  contextMenu: {
    bg: '#2d2d2d', hover: '#094771', text: '#e2e8f0',
    border: '#404040', separator: '#404040',
  },
};

export const SNMP_OIDS = {
  ifDescr: '1.3.6.1.2.1.2.2.1.2',
  ifType: '1.3.6.1.2.1.2.2.1.3',
  ifSpeed: '1.3.6.1.2.1.2.2.1.5',
  ifAdminStatus: '1.3.6.1.2.1.2.2.1.7',
  ifOperStatus: '1.3.6.1.2.1.2.2.1.8',
  ifInOctets: '1.3.6.1.2.1.2.2.1.10',
  ifOutOctets: '1.3.6.1.2.1.2.2.1.16',
  ifInErrors: '1.3.6.1.2.1.2.2.1.14',
  ifOutErrors: '1.3.6.1.2.1.2.2.1.20',
  ifHCInOctets: '1.3.6.1.2.1.31.1.1.1.6',
  ifHCOutOctets: '1.3.6.1.2.1.31.1.1.1.10',
};

export const DEVICE_SHAPES = {
  router: 'diamond',
  switch: 'roundedRect',
  server: 'square',
  workstation: 'circle',
  access_point: 'circle',
  firewall: 'hexagon',
  unknown: 'circle',
};

export const STATUS_COLORS = {
  UP: '#22c55e',
  DOWN: '#ef4444',
  WARNING: '#f59e0b',
  UNKNOWN: '#6b7280',
};

export const APP_NAME = 'The MAN';
