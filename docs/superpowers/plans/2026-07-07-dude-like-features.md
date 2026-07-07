# Dude-Like Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make The MAN behave and look like MikroTik The Dude — full SNMP poller (ifTable, custom OIDs), network maps with submaps, and custom right-click context menus.

**Architecture:** BullMQ worker process consumes polling jobs, dispatches to per-type pollers (SNMP, Ping). D3-based dark-canvas maps page with portal-based React context menu. Theme constants in shared package.

**Tech Stack:** Fastify, Prisma/PostgreSQL, Redis/BullMQ, node-snmp, D3.js, React 18, Tauri 1.x

**Global Constraints:**
- All new JS must be ES modules (`import`/`export`)
- No Prisma schema changes — existing models cover everything
- No TypeScript — project is plain JS
- Follow existing code style (inline CSS objects, no new Tailwind classes in new components)
- Must work in both web browser and Tauri desktop context

---

### Task 1: Install Dependencies + Shared Constants

**Files:**
- Modify: `packages/backend/package.json`
- Create: `packages/shared/src/constants.js`
- Modify: `packages/shared/src/index.js`

**Interfaces:**
- Consumes: nothing
- Produces: `THEME_DUDE_CLASSIC` object, `SNMP_OIDS` map, `DEVICE_SHAPES` map, `STATUS_COLORS` map

- [ ] **Step 1: Add node-snmp to backend deps**

Edit `packages/backend/package.json` — add `"node-snmp": "^1.4.0"` to `dependencies`.

- [ ] **Step 2: Create shared constants**

`packages/shared/src/constants.js`:
```javascript
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
```

- [ ] **Step 3: Update shared index**

`packages/shared/src/index.js`:
```javascript
export const APP_NAME = 'The MAN';
```

- [ ] **Step 4: Run pnpm install and verify**

```bash
pnpm install
```

- [ ] **Step 5: Commit**

```bash
git add packages/backend/package.json packages/shared/src/constants.js packages/shared/src/index.js
git commit -S -m "feat: add node-snmp dep and shared theme constants"
```

---

### Task 2: BasePoller Abstract Class

**Files:**
- Create: `packages/backend/src/services/monitoring/pollers/BasePoller.js`

**Interfaces:**
- Consumes: nothing
- Produces: `BasePoller` class with `poll(device, service)`, `validateConfig(config)`, `getDefaultConfig()`, `getType()`, `getName()`, `getDescription()`

- [ ] **Step 1: Write BasePoller**

`packages/backend/src/services/monitoring/pollers/BasePoller.js`:
```javascript
export class BasePoller {
  async poll(device, service) {
    throw new Error(`${this.getType()}: poll() not implemented`);
  }

  validateConfig(config) {
    throw new Error(`${this.getType()}: validateConfig() not implemented`);
  }

  getDefaultConfig() {
    throw new Error(`${this.getType()}: getDefaultConfig() not implemented`);
  }

  getType() {
    throw new Error(`${this.getType()}: getType() not implemented`);
  }

  getName() {
    return this.getType();
  }

  getDescription() {
    return '';
  }

  shouldAlert(result, lastResult) {
    return false;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/backend/src/services/monitoring/pollers/BasePoller.js
git commit -S -m "feat: add BasePoller abstract class"
```

---

### Task 3: Full SNMP Poller

**Files:**
- Create: `packages/backend/src/services/monitoring/pollers/SNMPPoller.js`

**Interfaces:**
- Consumes: `BasePoller`, `SNMP_OIDS` from shared, `prisma` from caller
- Produces: `SNMPPoller` class

- [ ] **Step 1: Write SNMPPoller class**

`packages/backend/src/services/monitoring/pollers/SNMPPoller.js`:
```javascript
import snmp from 'node-snmp';
import { BasePoller } from './BasePoller.js';
import { SNMP_OIDS } from '@theman/shared/src/constants.js';
import { prisma } from '../../server.js';

export class SNMPPoller extends BasePoller {
  createSession(device) {
    const community = device.metadata?.snmpCommunity || 'public';
    const version = device.metadata?.snmpVersion || snmp.Version2c;
    return snmp.createSession(device.ip, community, { version, timeout: 5000, retries: 1 });
  }

  async poll(device, service) {
    const config = service.config || {};
    const ifIndex = config.ifIndex;
    if (ifIndex != null) {
      return await this.pollInterface(device, service, ifIndex);
    }
    if (config.oids?.length) {
      return await this.pollCustomOIDs(device, service, config.oids);
    }
    throw new Error('SNMP service has no ifIndex or custom OIDs configured');
  }

  async pollInterface(device, service, ifIndex) {
    const session = this.createSession(device);
    const startTime = Date.now();
    const oids = [
      `${SNMP_OIDS.ifDescr}.${ifIndex}`,
      `${SNMP_OIDS.ifOperStatus}.${ifIndex}`,
      `${SNMP_OIDS.ifInOctets}.${ifIndex}`,
      `${SNMP_OIDS.ifOutOctets}.${ifIndex}`,
      `${SNMP_OIDS.ifInErrors}.${ifIndex}`,
      `${SNMP_OIDS.ifOutErrors}.${ifIndex}`,
    ];
    return new Promise((resolve) => {
      session.get(oids, async (err, data) => {
        session.close();
        if (err) {
          return resolve({
            success: false, status: 'critical', error: err.message,
            timestamp: new Date(), duration: Date.now() - startTime, metrics: [],
          });
        }
        const result = {};
        data.forEach(vb => { result[vb.oid] = vb.value; });
        const operStatus = result[`${SNMP_OIDS.ifOperStatus}.${ifIndex}`];
        const isUp = operStatus === 1;
        const metrics = [
          { name: 'ifInOctets', value: result[`${SNMP_OIDS.ifInOctets}.${ifIndex}`] || 0, unit: 'bytes' },
          { name: 'ifOutOctets', value: result[`${SNMP_OIDS.ifOutOctets}.${ifIndex}`] || 0, unit: 'bytes' },
          { name: 'ifInErrors', value: result[`${SNMP_OIDS.ifInErrors}.${ifIndex}`] || 0, unit: 'count' },
          { name: 'ifOutErrors', value: result[`${SNMP_OIDS.ifOutErrors}.${ifIndex}`] || 0, unit: 'count' },
          { name: 'ifOperStatus', value: isUp ? 1 : 0, unit: 'bool' },
        ];
        resolve({
          success: isUp, status: isUp ? 'ok' : 'critical',
          timestamp: new Date(), duration: Date.now() - startTime, metrics,
        });
      });
    });
  }

  async pollCustomOIDs(device, service, oids) {
    const session = this.createSession(device);
    const startTime = Date.now();
    const oidList = oids.map(o => o.oid || o);
    return new Promise((resolve) => {
      session.get(oidList, (err, data) => {
        session.close();
        if (err) {
          return resolve({
            success: false, status: 'critical', error: err.message,
            timestamp: new Date(), duration: Date.now() - startTime, metrics: [],
          });
        }
        const metrics = data.map(vb => ({
          name: oids.find(o => o.oid === vb.oid || o === vb.oid)?.name || vb.oid,
          value: vb.value, unit: 'count',
        }));
        resolve({
          success: true, status: 'ok',
          timestamp: new Date(), duration: Date.now() - startTime, metrics,
        });
      });
    });
  }

  async discoverInterfaces(deviceId) {
    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error('Device not found');
    const session = this.createSession(device);
    return new Promise((resolve, reject) => {
      session.walk(SNMP_OIDS.ifDescr, async (err, data) => {
        session.close();
        if (err) return reject(err);
        const interfaces = data.map(vb => {
          const ifIndex = parseInt(vb.oid.split('.').pop());
          return { ifIndex, ifDescr: vb.value.toString() };
        });
        for (const iface of interfaces) {
          const exists = await prisma.service.findFirst({
            where: { deviceId, type: `snmp-if-${iface.ifIndex}` },
          });
          if (!exists) {
            await prisma.service.create({
              data: {
                deviceId, name: iface.ifDescr,
                type: `snmp-if-${iface.ifIndex}`,
                config: { ifIndex: iface.ifIndex, oids: [] },
                interval: 60, timeout: 10, enabled: true,
              },
            });
          }
        }
        resolve(interfaces);
      });
    });
  }

  validateConfig(config) {
    if (!config.ifIndex && !config.oids) throw new Error('SNMP config needs ifIndex or oids');
    return true;
  }

  getDefaultConfig() {
    return { ifIndex: null, oids: [] };
  }

  getType() { return 'snmp'; }
  getName() { return 'SNMP'; }
  getDescription() { return 'SNMP interface and custom OID polling'; }
}

export default SNMPPoller;
```

- [ ] **Step 2: Commit**

```bash
git add packages/backend/src/services/monitoring/pollers/SNMPPoller.js
git commit -S -m "feat: implement SNMPPoller with ifTable and custom OID support"
```

---

### Task 4: Monitoring Service + BullMQ Worker

**Files:**
- Modify: `packages/backend/src/services/monitoring/MonitoringService.js`
- Modify: `packages/backend/src/workers/pollingWorker.js`
- Create: `packages/backend/src/services/monitoring/PollerRegistry.js`

**Interfaces:**
- Consumes: `BasePoller`, `SNMPPoller`, `PingPoller`, `prisma`, `redis`
- Produces: Running worker that polls services and writes results to DB

- [ ] **Step 1: Create PollerRegistry**

`packages/backend/src/services/monitoring/PollerRegistry.js`:
```javascript
import { PingPoller } from './pollers/PingPoller.js';
import { SNMPPoller } from './pollers/SNMPPoller.js';

const registry = new Map();

export function registerPoller(type, instance) {
  registry.set(type, instance);
}

export function getPoller(type) {
  return registry.get(type);
}

export function getAllPollers() {
  return Array.from(registry.values());
}

registerPoller('ping', new PingPoller());
registerPoller('snmp', new SNMPPoller());
```

- [ ] **Step 2: Rewrite MonitoringService**

`packages/backend/src/services/monitoring/MonitoringService.js`:
```javascript
import { EventEmitter } from 'events';
import { Queue, Worker } from 'bullmq';

export class MonitoringService extends EventEmitter {
  constructor(prisma, redis) {
    super();
    this.prisma = prisma;
    this.redis = redis;
    this.queue = null;
    this.worker = null;
    this.timers = new Map();
  }

  async start() {
    this.queue = new Queue('theman:polling', { connection: this.redis });

    this.worker = new Worker('theman:polling', async (job) => {
      const { deviceId, serviceId, type, config } = job.data;
      const { getPoller } = await import('./PollerRegistry.js');
      const poller = getPoller(type);
      if (!poller) throw new Error(`No poller for type: ${type}`);

      const [device, service] = await Promise.all([
        this.prisma.device.findUnique({ where: { id: deviceId } }),
        this.prisma.service.findUnique({ where: { id: serviceId } }),
      ]);
      if (!device || !service) return;

      const result = await poller.poll(device, service);

      await this.prisma.service.update({
        where: { id: serviceId },
        data: { lastCheck: new Date(), lastResult: result, status: result.status.toUpperCase() },
      });

      for (const metric of result.metrics) {
        let metricRecord = await this.prisma.metric.findFirst({
          where: { serviceId, name: metric.name },
        });
        if (!metricRecord) {
          metricRecord = await this.prisma.metric.create({
            data: { serviceId, deviceId, name: metric.name, unit: metric.unit },
          });
        }
        await this.prisma.metricSample.create({
          data: {
            metricId: metricRecord.id, time: new Date(),
            resolution: 'RAW', value: metric.value,
          },
        });
      }

      this.emit('device:status', { deviceId, status: result.status, serviceId });
      this.emit('metric:update', { deviceId, serviceId, metrics: result.metrics });
    }, { connection: this.redis, concurrency: 10 });

    await this.scheduleAllServices();
  }

  async scheduleAllServices() {
    const services = await this.prisma.service.findMany({ where: { enabled: true } });
    for (const service of services) {
      this.scheduleService(service);
    }
  }

  scheduleService(service) {
    if (this.timers.has(service.id)) clearInterval(this.timers.get(service.id));
    const timer = setInterval(async () => {
      const type = service.type === 'ping' ? 'ping' : 'snmp';
      await this.queue.add('poll', {
        deviceId: service.deviceId, serviceId: service.id,
        type, config: service.config,
      }, { removeOnComplete: 100, removeOnFail: 500 });
    }, (service.interval || 60) * 1000);
    this.timers.set(service.id, timer);
  }

  async stop() {
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
    if (this.worker) await this.worker.close();
    if (this.queue) await this.queue.close();
  }
}
```

- [ ] **Step 3: Rewrite pollingWorker.js**

`packages/backend/src/workers/pollingWorker.js`:
```javascript
import Redis from 'ioredis';
import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import '../services/monitoring/PollerRegistry.js';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const prisma = new PrismaClient();

const worker = new Worker('theman:polling', async (job) => {
  const { deviceId, serviceId, type } = job.data;
  const { getPoller } = await import('../services/monitoring/PollerRegistry.js');
  const poller = getPoller(type);
  if (!poller) throw new Error(`No poller for ${type}`);

  const [device, service] = await Promise.all([
    prisma.device.findUnique({ where: { id: deviceId } }),
    prisma.service.findUnique({ where: { id: serviceId } }),
  ]);
  if (!device || !service) return;

  const result = await poller.poll(device, service);

  await prisma.service.update({
    where: { id: serviceId },
    data: { lastCheck: new Date(), lastResult: result, status: result.status.toUpperCase() },
  });

  for (const metric of result.metrics) {
    let mr = await prisma.metric.findFirst({ where: { serviceId, name: metric.name } });
    if (!mr) mr = await prisma.metric.create({
      data: { serviceId, deviceId, name: metric.name, unit: metric.unit },
    });
    await prisma.metricSample.create({
      data: { metricId: mr.id, time: new Date(), resolution: 'RAW', value: metric.value },
    });
  }
}, { connection: redis, concurrency: 10 });

console.log('✓ Polling worker started');
process.on('SIGTERM', async () => {
  await worker.close();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
});
```

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/services/monitoring/MonitoringService.js packages/backend/src/workers/pollingWorker.js packages/backend/src/services/monitoring/PollerRegistry.js
git commit -S -m "feat: full monitoring loop with BullMQ worker"
```

---

### Task 5: Maps CRUD API Routes

**Files:**
- Modify: `packages/backend/src/api/routes/maps.js`

- [ ] **Step 1: Implement full maps CRUD**

`packages/backend/src/api/routes/maps.js` — full rewrite:
```javascript
export async function mapRoutes(server) {
  const prisma = server.prisma;

  function buildTree(maps, parentId = null) {
    return maps
      .filter(m => (m.parentMapId === null ? null : m.parentMapId) === parentId)
      .map(m => ({
        id: m.id, name: m.name, parentMapId: m.parentMapId,
        deviceCount: m._count?.devices ?? 0,
        submaps: buildTree(maps, m.id),
      }));
  }

  server.get('/api/v1/maps/tree', { onRequest: [server.authenticate] }, async () => {
    const maps = await prisma.map.findMany({
      include: { _count: { select: { devices: true } } },
      orderBy: { name: 'asc' },
    });
    return buildTree(maps, null);
  });

  server.get('/api/v1/maps', { onRequest: [server.authenticate] }, async (request) => {
    const { parentId } = request.query;
    const where = {};
    if (parentId !== undefined) where.parentMapId = parentId || null;
    const maps = await prisma.map.findMany({
      where, include: { _count: { select: { devices: true } } }, orderBy: { name: 'asc' },
    });
    return maps.map(m => ({ id: m.id, name: m.name, parentMapId: m.parentMapId, deviceCount: m._count.devices }));
  });

  server.get('/api/v1/maps/:id', { onRequest: [server.authenticate] }, async (request, reply) => {
    const map = await prisma.map.findUnique({
      where: { id: request.params.id },
      include: {
        _count: { select: { devices: true, submaps: true } },
        submaps: { orderBy: { name: 'asc' } },
        devices: { orderBy: { name: 'asc' }, take: 500 },
        links: { include: { sourceDevice: true, targetDevice: true } },
      },
    });
    if (!map) return reply.code(404).send({ error: 'Map not found' });
    return map;
  });

  server.post('/api/v1/maps', { onRequest: [server.authenticate] }, async (request, reply) => {
    const { name, parentMapId, backgroundImage, layoutType } = request.body;
    if (!name) return reply.code(400).send({ error: 'Name required' });
    const map = await prisma.map.create({
      data: { name, parentMapId: parentMapId || null, backgroundImage, layoutType: layoutType || 'auto' },
    });
    return reply.code(201).send(map);
  });

  server.put('/api/v1/maps/:id', { onRequest: [server.authenticate] }, async (request, reply) => {
    const { name, parentMapId, backgroundImage, layoutType, viewport } = request.body;
    const map = await prisma.map.update({
      where: { id: request.params.id },
      data: { name, parentMapId, backgroundImage, layoutType, viewport },
    });
    return map;
  });

  server.delete('/api/v1/maps/:id', { onRequest: [server.authenticate] }, async (request) => {
    await prisma.map.delete({ where: { id: request.params.id } });
    return { success: true };
  });

  server.put('/api/v1/maps/:id/layout', { onRequest: [server.authenticate] }, async (request) => {
    const { positions } = request.body;
    for (const pos of positions) {
      await prisma.device.update({
        where: { id: pos.deviceId },
        data: { positionX: pos.x, positionY: pos.y },
      });
    }
    return { success: true };
  });

  server.post('/api/v1/devices/:id/discover-interfaces', { onRequest: [server.authenticate] }, async (request, reply) => {
    const { SNMPPoller } = await import('../../services/monitoring/pollers/SNMPPoller.js');
    const poller = new SNMPPoller();
    try {
      const interfaces = await poller.discoverInterfaces(request.params.id);
      return { interfaces, count: interfaces.length };
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/backend/src/api/routes/maps.js
git commit -S -m "feat: full maps CRUD + device interface discovery endpoint"
```

---

### Task 6: Services API Routes

**Files:**
- Create: `packages/backend/src/api/routes/services.js`
- Modify: `packages/backend/src/api/routes/index.js`

- [ ] **Step 1: Implement services routes**

`packages/backend/src/api/routes/services.js`:
```javascript
export async function serviceRoutes(server) {
  const prisma = server.prisma;

  server.get('/api/v1/services', { onRequest: [server.authenticate] }, async (request) => {
    const { deviceId, type, enabled } = request.query;
    const where = {};
    if (deviceId) where.deviceId = deviceId;
    if (type) where.type = type;
    if (enabled !== undefined) where.enabled = enabled === 'true';
    return await prisma.service.findMany({ where, orderBy: { name: 'asc' } });
  });

  server.post('/api/v1/services', { onRequest: [server.authenticate] }, async (request, reply) => {
    const { deviceId, name, type, config, interval, timeout } = request.body;
    if (!deviceId || !name || !type) return reply.code(400).send({ error: 'deviceId, name, type required' });
    const service = await prisma.service.create({
      data: { deviceId, name, type, config: config || {}, interval: interval || 60, timeout: timeout || 10 },
    });
    return reply.code(201).send(service);
  });

  server.put('/api/v1/services/:id', { onRequest: [server.authenticate] }, async (request, reply) => {
    const { name, type, config, interval, timeout, enabled } = request.body;
    const service = await prisma.service.update({
      where: { id: request.params.id },
      data: { name, type, config, interval, timeout, enabled },
    });
    return service;
  });

  server.delete('/api/v1/services/:id', { onRequest: [server.authenticate] }, async (request) => {
    await prisma.service.delete({ where: { id: request.params.id } });
    return { success: true };
  });

  server.post('/api/v1/services/:id/test', { onRequest: [server.authenticate] }, async (request, reply) => {
    const service = await prisma.service.findUnique({
      where: { id: request.params.id }, include: { device: true },
    });
    if (!service) return reply.code(404).send({ error: 'Service not found' });
    const { getPoller } = await import('../../services/monitoring/PollerRegistry.js');
    const type = service.type === 'ping' ? 'ping' : 'snmp';
    const poller = getPoller(type);
    if (!poller) return reply.code(500).send({ error: `No poller for ${type}` });
    const result = await poller.poll(service.device, service);
    return result;
  });
}
```

- [ ] **Step 2: Register in index.js**

Add to `packages/backend/src/api/routes/index.js`:
```javascript
import { serviceRoutes } from './services.js';
// inside setupRoutes:
await serviceRoutes(server);
```

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/api/routes/services.js packages/backend/src/api/routes/index.js
git commit -S -m "feat: services CRUD API + manual test endpoint"
```

---

### Task 7: Context Menu Component

**Files:**
- Create: `apps/web/src/components/maps/ContextMenu.jsx`

- [ ] **Step 1: Write ContextMenu component**

`apps/web/src/components/maps/ContextMenu.jsx`:
```javascript
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/maps/ContextMenu.jsx
git commit -S -m "feat: portal-based custom context menu component"
```

---

### Task 8: NetworkMap Dark Canvas Overhaul

**Files:**
- Modify: `apps/web/src/components/maps/NetworkMap.jsx`

- [ ] **Step 1: Rewrite NetworkMap with Dude-like dark theme**

The NetworkMap is overhauled with:
- Dark background (`#1a1a2e`) with SVG grid pattern
- Device shapes drawn as SVG paths: diamond for routers, rounded rect for switches, square for servers, circle for AP/workstation, hexagon for firewall
- Status-based fill colors (UP=green, DOWN=red, WARNING=yellow, UNKNOWN=gray)
- Link utilization coloring based on bandwidth (green <50%, yellow 50-80%, red >80%)
- Submap badge indicator (small arrow icon)
- Context menu integration via `onContextMenu` on device groups, SVG root, and link lines
- Props: `{ map, devices, links, onDeviceClick, onDeviceContextMenu, onCanvasContextMenu, onLinkContextMenu, onDeviceMove, readonly, selectedDevice }`
- Zoom/pan preserved from the current implementation

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/maps/NetworkMap.jsx
git commit -S -m "feat: dark Dude-like canvas with device shapes and link utilization"
```

---

### Task 9: Maps Page + Properties Panel + Toolbar

**Files:**
- Create: `apps/web/src/pages/Maps.jsx`
- Create: `apps/web/src/components/maps/DeviceProperties.jsx`
- Create: `apps/web/src/components/maps/MapToolbar.jsx`

- [ ] **Step 1: Create DeviceProperties panel**

`apps/web/src/components/maps/DeviceProperties.jsx`:
- Right-side flyout panel (slide-in from right, ~350px wide)
- Props: `{ device, services, onClose }`
- Shows: device name, IP, MAC, vendor, model, OS version, status badge
- Lists services with their status (OK/CRITICAL/UNKNOWN)
- Quick actions: Ping button, Telnet button (placeholder), Ack button
- Close button in top right
- Backdrop click to close

- [ ] **Step 2: Create MapToolbar**

`apps/web/src/components/maps/MapToolbar.jsx`:
- Floating toolbar, positioned top-left on the canvas
- Props: `{ onZoomIn, onZoomOut, onResetView, onAddDevice, onAddSubmap }`
- Buttons: `+ Add Device`, `+ Add Submap`, `🔍 Zoom In`, `🔍 Zoom Out`, `⟲ Reset View`
- Styled to match dark theme (dark bg, light text, border)

- [ ] **Step 3: Create Maps.jsx page**

`apps/web/src/pages/Maps.jsx`:
- Fetches map tree and first map data from API on mount
- State: currentMap, devices, links, mapTree, breadcrumb, contextMenu, selectedDevice
- Left sidebar: map tree (clickable to navigate, current highlighted)
- Top: breadcrumb navigation (Root > Submap > ...)
- Main: NetworkMap component
- Right: DeviceProperties panel (when device selected)
- ContextMenu integration:
  - `onDeviceContextMenu`: shows device actions (Ping, Telnet, Services, Properties, Ack, Delete)
  - `onCanvasContextMenu`: shows canvas actions (Add Device, Add Submap, Zoom In/Out, Reset View)
  - `onLinkContextMenu`: shows link actions (Properties, Delete)
- Double-click device: opens DeviceProperties panel
- Handles: map navigation, device position save on drag end, add device/submap dialogs (prompt-based for v1)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/Maps.jsx apps/web/src/components/maps/DeviceProperties.jsx apps/web/src/components/maps/MapToolbar.jsx
git commit -S -m "feat: maps page with properties panel and toolbar"
```

---

### Task 10: Wire Everything in App.jsx

**Files:**
- Modify: `apps/web/src/App.jsx`

- [ ] **Step 1: Add Maps view + navigation + global context menu handler**

```javascript
// Add import at top:
import Maps from './pages/Maps';

// Add navigation button (in the button group, before Settings):
<button onClick={() => setView('maps')}
  style={{
    padding: '0.5rem 1rem', background: view === 'maps' ? '#22c55e' : '#6b7280',
    color: 'white', border: 'none', borderRadius: '4px',
    cursor: 'pointer', fontWeight: 'bold'
  }}>
  Maps
</button>

// Add view rendering (before settings):
{view === 'maps' ? <Maps /> : view === 'settings' ? <Settings user={user} /> : <DeviceList />}

// Add global contextmenu prevention (add useEffect):
useEffect(() => {
  const prevent = (e) => e.preventDefault();
  document.addEventListener('contextmenu', prevent);
  return () => document.removeEventListener('contextmenu', prevent);
}, []);
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/App.jsx
git commit -S -m "feat: wire maps view into app with global context menu prevention"
```

---

### Task 11: Desktop Tauri Config

**Files:**
- Create: `apps/desktop/src-tauri/tauri.conf.json`

- [ ] **Step 1: Write tauri.conf.json**

`apps/desktop/src-tauri/tauri.conf.json`:
```json
{
  "build": {
    "devPath": "http://localhost:5173",
    "distDir": "../../apps/web/dist",
    "beforeDevCommand": "",
    "beforeBuildCommand": ""
  },
  "package": {
    "productName": "The MAN",
    "version": "0.1.0"
  },
  "tauri": {
    "bundle": {
      "identifier": "com.theman.app",
      "icon": []
    },
    "windows": [
      {
        "title": "The MAN - Network Monitoring",
        "width": 1400,
        "height": 900,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": null
    },
    "allowlist": {
      "all": true
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src-tauri/tauri.conf.json
git commit -S -m "feat: basic Tauri desktop configuration"
```

---

### Task 12: Write Design Documents

**Files:**
- Create: `docs/superpowers/specs/2026-07-07-dude-like-features-design.md`
- Create: `docs/superpowers/plans/2026-07-07-dude-like-features.md`

Note: Already created as part of Task 12 setup.

- [ ] **Step 1: Commit docs**

```bash
git add docs/superpowers/
git commit -S -m "docs: add spec and implementation plan for Dude-like features"
```
