// packages/backend/src/services/discovery/importers/DudeImporter.js

import { createReadStream, createWriteStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import Database from 'better-sqlite3';

import { parseDudeObject } from './dude/DudeObjectParser.js';
import {
  chunk,
  decodeIpv4,
  groupByType,
  displayName,
  resolveMapHierarchy,
  resolveDevicePlacement,
  resolveLinkOtherDevice,
} from './dude/transform.js';

const CREATE_BATCH_SIZE = 2000;
const SAMPLE_BATCH_SIZE = 5000;
const UPDATE_BATCH_SIZE = 50;
const THIRTY_TWO_BITS = 32n;
const LOW_32_MASK = 0xffffffffn;

const SAMPLE_TABLES = [
  ['chart_values_raw', 'RAW'],
  ['chart_values_10min', 'TEN_MIN'],
  ['chart_values_2hour', 'TWO_HOUR'],
  ['chart_values_1day', 'ONE_DAY'],
];

/**
 * Imports a MikroTik "The Dude" SQLite database (any 6.x/7.x export,
 * including the 7.23.1 EOL release) into our own schema. See
 * packages/backend/src/services/discovery/importers/dude/ for the format
 * parser this builds on.
 */
export class DudeImporter {
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * @param {string} filePath - path to a Dude .db file (plain or gzipped)
   * @param {{ userId?: string }} [options]
   * @returns {Promise<Object>} counts + warnings for the import
   */
  async importFromFile(filePath, { userId = null } = {}) {
    const warnings = [];
    const sqlitePath = await this._ensureSqlite(filePath);
    const db = new Database(sqlitePath, { readonly: true, fileMustExist: true });

    try {
      const objects = this._parseAllObjects(db, warnings);
      const byId = new Map(objects.map((o) => [o.dudeId, o]));
      const byType = groupByType(objects);
      const nmeObjs = byType.NetworkMapElement || [];
      const nmeById = new Map(nmeObjs.map((n) => [n.dudeId, n.fields]));

      // dudeId -> our uuid, shared across all entity kinds since objs.id
      // is one global primary key regardless of object type. Preloaded
      // with anything a previous import already created so re-running an
      // import upserts (via dudeId's unique constraint) instead of
      // duplicating rows or orphaning cross-references.
      const idMap = new Map();
      await this._preloadIdMap(this.prisma.map, idMap);
      await this._preloadIdMap(this.prisma.device, idMap);
      await this._preloadIdMap(this.prisma.service, idMap);
      await this._preloadIdMap(this.prisma.link, idMap);
      await this._preloadIdMap(this.prisma.note, idMap);
      await this._preloadIdMap(this.prisma.metric, idMap, 'dudeSourceId');

      const maps = await this._importMaps(byType.Map || [], nmeObjs, byId, idMap);
      const devices = await this._importDevices(byType.Device || [], nmeObjs, byId, idMap, warnings);
      const services = await this._importServices(byType.Service || [], byId, idMap, warnings);
      const links = await this._importLinks(byType.Link || [], nmeById, byId, idMap, warnings);
      const notes = await this._importNotes(byType.Notes || [], byId, idMap);
      const metrics = await this._importMetrics(
        byType.DataSource || [],
        byType.Service || [],
        links.linkInfo,
        byId,
        idMap
      );
      const outages = await this._importOutages(db, byId, idMap);
      const metricSamples = await this._importMetricSamples(db, idMap, warnings);

      const summary = {
        devices: devices.count,
        services: services.count,
        maps: maps.count,
        links: links.count,
        notes: notes.count,
        metrics: metrics.count,
        outages,
        metricSamples,
        warnings,
      };

      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'IMPORT_DUDE',
          resourceType: 'discovery',
          details: {
            devices: summary.devices,
            services: summary.services,
            maps: summary.maps,
            links: summary.links,
            notes: summary.notes,
            metrics: summary.metrics,
            outages: summary.outages,
            metricSamples: summary.metricSamples,
            warningCount: warnings.length,
          },
        },
      });

      return summary;
    } finally {
      db.close();
    }
  }

  async _ensureSqlite(filePath) {
    const fd = await open(filePath, 'r');
    const head = Buffer.alloc(2);
    await fd.read(head, 0, 2, 0);
    await fd.close();

    const isGzipped = head[0] === 0x1f && head[1] === 0x8b;
    if (!isGzipped) return filePath;

    const tmpPath = path.join(os.tmpdir(), `dude-import-${randomUUID()}.db`);
    await pipeline(createReadStream(filePath), zlib.createGunzip(), createWriteStream(tmpPath));
    return tmpPath;
  }

  _parseAllObjects(db, warnings) {
    const stmt = db.prepare('SELECT id, obj FROM objs');
    const objects = [];
    let parseErrors = 0;

    for (const row of stmt.iterate()) {
      try {
        const parsed = parseDudeObject(row.obj);
        objects.push({ dudeId: row.id, typeName: parsed.typeName, fields: parsed.fields });
      } catch (err) {
        parseErrors++;
        if (parseErrors <= 20) {
          warnings.push(`object ${row.id} could not be parsed: ${err.message}`);
        }
      }
    }

    if (parseErrors > 20) {
      warnings.push(`${parseErrors} objects total failed to parse (only the first 20 are listed above)`);
    }
    return objects;
  }

  async _importMaps(mapObjs, nmeObjs, byId, idMap) {
    const rows = mapObjs.map((m) => {
      const id = this._getOrCreateId(idMap, m.dudeId);
      return { id, dudeId: m.dudeId, name: displayName(m.fields, `map-${m.dudeId}`) };
    });

    for (const batch of chunk(rows, CREATE_BATCH_SIZE)) {
      await this.prisma.map.createMany({ data: batch, skipDuplicates: true });
    }

    const parentOf = resolveMapHierarchy(nmeObjs, byId);
    const updates = [];
    for (const [childDudeId, parentDudeId] of parentOf) {
      const childId = idMap.get(childDudeId);
      const parentId = idMap.get(parentDudeId);
      if (childId && parentId && childId !== parentId) {
        updates.push({ where: { id: childId }, data: { parentMapId: parentId } });
      }
    }
    await this._applyUpdates(this.prisma.map, updates);

    return { count: rows.length };
  }

  async _importDevices(deviceObjs, nmeObjs, byId, idMap, warnings) {
    const placement = resolveDevicePlacement(nmeObjs);
    const rows = [];
    let missingIp = 0;

    for (const d of deviceObjs) {
      const id = this._getOrCreateId(idMap, d.dudeId);

      const ipList = d.fields.Device_IpAddress;
      const ip = Array.isArray(ipList) && ipList.length > 0 ? decodeIpv4(ipList[0]) : null;
      if (!ip) missingIp++;

      const macs = Array.isArray(d.fields.Device_MacAddress) ? d.fields.Device_MacAddress : [];
      const place = placement.get(d.dudeId);
      const mapDudeId = place && byId.get(place.mapDudeId)?.typeName === 'Map' ? place.mapDudeId : null;

      rows.push({
        id,
        dudeId: d.dudeId,
        name: displayName(d.fields, `device-${d.dudeId}`),
        ip: ip || '0.0.0.0',
        macAddress: macs[0] || null,
        deviceType: 'unknown',
        mapId: mapDudeId ? idMap.get(mapDudeId) ?? null : null,
        positionX: place?.x ?? null,
        positionY: place?.y ?? null,
        status: 'UNKNOWN',
        metadata: { dudeTypeId: d.fields.Device_TypeId ?? null },
      });
    }

    for (const batch of chunk(rows, CREATE_BATCH_SIZE)) {
      await this.prisma.device.createMany({ data: batch, skipDuplicates: true });
    }

    const updates = [];
    for (const d of deviceObjs) {
      const parents = d.fields.Device_ParentIds;
      if (!Array.isArray(parents) || parents.length === 0) continue;
      if (byId.get(parents[0])?.typeName !== 'Device') continue;
      const childId = idMap.get(d.dudeId);
      const parentId = idMap.get(parents[0]);
      if (childId && parentId && childId !== parentId) {
        updates.push({ where: { id: childId }, data: { parentId } });
      }
    }
    await this._applyUpdates(this.prisma.device, updates);

    if (missingIp > 0) {
      warnings.push(`${missingIp} devices had no IP address in Dude, defaulted to 0.0.0.0`);
    }
    return { count: rows.length };
  }

  async _importServices(serviceObjs, byId, idMap, warnings) {
    const rows = [];
    let skippedNoDevice = 0;

    for (const s of serviceObjs) {
      const deviceDudeId = s.fields.Service_DeviceID;
      const deviceId = byId.get(deviceDudeId)?.typeName === 'Device' ? idMap.get(deviceDudeId) : null;
      if (!deviceId) {
        skippedNoDevice++;
        continue;
      }

      const id = this._getOrCreateId(idMap, s.dudeId);
      rows.push({
        id,
        dudeId: s.dudeId,
        deviceId,
        name: displayName(s.fields, `service-${s.dudeId}`),
        type: 'unknown',
        config: {
          dudeProbeId: s.fields.Service_probeID ?? null,
          dudeDataSourceId: s.fields.Service_DataSourceID ?? null,
          probePort: s.fields.Service_ProbePort ?? null,
        },
        interval: s.fields.Service_ProbeInterval || 60,
        timeout: s.fields.Service_ProbeTimeout || 5,
        enabled: s.fields.Service_Enabled ?? true,
        lastResult: {
          dudeStatus: s.fields.Service_Status ?? null,
          value: s.fields.Service_Value ?? null,
          problemDescription: s.fields.Service_ProblemDescription ?? null,
        },
      });
    }

    for (const batch of chunk(rows, CREATE_BATCH_SIZE)) {
      await this.prisma.service.createMany({ data: batch, skipDuplicates: true });
    }

    if (skippedNoDevice > 0) {
      warnings.push(`${skippedNoDevice} services skipped: owning device could not be resolved`);
    }
    return { count: rows.length };
  }

  async _importLinks(linkObjs, nmeById, byId, idMap, warnings) {
    const rows = [];
    const linkInfo = [];
    let skipped = 0;

    for (const l of linkObjs) {
      const mapDudeId = l.fields.Link_NetMapID;
      const mapId = byId.get(mapDudeId)?.typeName === 'Map' ? idMap.get(mapDudeId) : null;
      const masterDudeId = l.fields.Link_MasterDevice;
      const sourceDeviceId =
        byId.get(masterDudeId)?.typeName === 'Device' ? idMap.get(masterDudeId) : null;
      const otherDudeId = resolveLinkOtherDevice(l, nmeById, byId);
      const targetDeviceId = otherDudeId ? idMap.get(otherDudeId) : null;

      if (!mapId || !sourceDeviceId || !targetDeviceId) {
        skipped++;
        continue;
      }

      const id = this._getOrCreateId(idMap, l.dudeId);
      rows.push({
        id,
        dudeId: l.dudeId,
        mapId,
        sourceDeviceId,
        targetDeviceId,
        linkType: 'unknown',
        label: displayName(l.fields, null),
      });
      linkInfo.push({
        sourceDeviceId,
        dudeTxDataSourceId: l.fields.Link_TxDataSourceID,
        dudeRxDataSourceId: l.fields.Link_RxDataSourceID,
      });
    }

    for (const batch of chunk(rows, CREATE_BATCH_SIZE)) {
      await this.prisma.link.createMany({ data: batch, skipDuplicates: true });
    }

    if (skipped > 0) {
      warnings.push(
        `${skipped} links skipped: their map and both endpoint devices could not all be resolved ` +
          '(common causes: the link connects to a submap/network cloud rather than a device, or ' +
          'one end references a device Dude has since deleted)'
      );
    }
    return { count: rows.length, linkInfo };
  }

  async _importNotes(noteObjs, byId, idMap) {
    const rows = noteObjs.map((n) => {
      const id = this._getOrCreateId(idMap, n.dudeId);
      const target = byId.get(n.fields.Note_ObjID);
      const deviceId = target?.typeName === 'Device' ? idMap.get(n.fields.Note_ObjID) ?? null : null;
      return {
        id,
        dudeId: n.dudeId,
        deviceId,
        text: displayName(n.fields, ''),
      };
    });

    for (const batch of chunk(rows, CREATE_BATCH_SIZE)) {
      await this.prisma.note.createMany({ data: batch, skipDuplicates: true });
    }
    return { count: rows.length };
  }

  async _importMetrics(dataSourceObjs, serviceObjs, linkInfo, byId, idMap) {
    const ownerByDataSourceDudeId = new Map();

    for (const s of serviceObjs) {
      const dsDudeId = s.fields.Service_DataSourceID;
      if (dsDudeId === undefined || dsDudeId === -1) continue;
      const serviceId = idMap.get(s.dudeId);
      if (!serviceId) continue;
      const deviceDudeId = s.fields.Service_DeviceID;
      const deviceId = byId.get(deviceDudeId)?.typeName === 'Device' ? idMap.get(deviceDudeId) ?? null : null;
      ownerByDataSourceDudeId.set(dsDudeId, { deviceId, serviceId });
    }

    for (const link of linkInfo) {
      for (const dsDudeId of [link.dudeTxDataSourceId, link.dudeRxDataSourceId]) {
        if (dsDudeId === undefined || dsDudeId === -1) continue;
        if (!ownerByDataSourceDudeId.has(dsDudeId)) {
          ownerByDataSourceDudeId.set(dsDudeId, { deviceId: link.sourceDeviceId, serviceId: null });
        }
      }
    }

    const rows = dataSourceObjs.map((ds) => {
      const id = this._getOrCreateId(idMap, ds.dudeId);
      const owner = ownerByDataSourceDudeId.get(ds.dudeId) || {};
      return {
        id,
        dudeSourceId: ds.dudeId,
        deviceId: owner.deviceId ?? null,
        serviceId: owner.serviceId ?? null,
        name: displayName(ds.fields, `metric-${ds.dudeId}`),
        unit: ds.fields.DataSource_Unit || null,
      };
    });

    for (const batch of chunk(rows, CREATE_BATCH_SIZE)) {
      await this.prisma.metric.createMany({ data: batch, skipDuplicates: true });
    }
    return { count: rows.length };
  }

  async _importOutages(db, byId, idMap) {
    const stmt = db.prepare('SELECT serviceID, deviceID, mapID, time, status, duration FROM outages');
    let buffer = [];
    let count = 0;

    const resolve = (dudeId, expectedType) =>
      byId.get(dudeId)?.typeName === expectedType ? idMap.get(dudeId) ?? null : null;

    for (const row of stmt.iterate()) {
      buffer.push({
        deviceId: resolve(row.deviceID, 'Device'),
        serviceId: resolve(row.serviceID, 'Service'),
        mapId: resolve(row.mapID, 'Map'),
        time: new Date(row.time * 1000),
        status: row.status,
        durationSeconds: row.duration,
      });
      if (buffer.length >= CREATE_BATCH_SIZE) {
        await this.prisma.outage.createMany({ data: buffer });
        count += buffer.length;
        buffer = [];
      }
    }
    if (buffer.length > 0) {
      await this.prisma.outage.createMany({ data: buffer });
      count += buffer.length;
    }
    return count;
  }

  async _importMetricSamples(db, idMap, warnings) {
    let total = 0;
    let skipped = 0;

    for (const [table, resolution] of SAMPLE_TABLES) {
      const stmt = db.prepare(`SELECT sourceIDandTime, value FROM ${table}`);
      stmt.safeIntegers(true); // sourceIDandTime can exceed Number.MAX_SAFE_INTEGER
      let buffer = [];

      for (const row of stmt.iterate()) {
        if (row.value === null || row.value === undefined) {
          skipped++;
          continue;
        }
        const key = row.sourceIDandTime;
        const sourceId = Number(key >> THIRTY_TWO_BITS);
        const unixTime = Number(key & LOW_32_MASK);
        const metricId = idMap.get(sourceId);
        if (!metricId) {
          skipped++;
          continue;
        }

        buffer.push({ metricId, time: new Date(unixTime * 1000), resolution, value: Number(row.value) });
        if (buffer.length >= SAMPLE_BATCH_SIZE) {
          await this.prisma.metricSample.createMany({ data: buffer });
          total += buffer.length;
          buffer = [];
        }
      }
      if (buffer.length > 0) {
        await this.prisma.metricSample.createMany({ data: buffer });
        total += buffer.length;
      }
    }

    if (skipped > 0) {
      warnings.push(`${skipped} metric samples skipped (null value or unresolved data source)`);
    }
    return total;
  }

  _getOrCreateId(idMap, dudeId) {
    const existing = idMap.get(dudeId);
    if (existing) return existing;
    const id = randomUUID();
    idMap.set(dudeId, id);
    return id;
  }

  async _preloadIdMap(modelDelegate, idMap, dudeIdField = 'dudeId') {
    const existing = await modelDelegate.findMany({
      where: { [dudeIdField]: { not: null } },
      select: { id: true, [dudeIdField]: true },
    });
    for (const row of existing) {
      idMap.set(row[dudeIdField], row.id);
    }
  }

  async _applyUpdates(modelDelegate, updates) {
    for (const batch of chunk(updates, UPDATE_BATCH_SIZE)) {
      await Promise.all(batch.map((update) => modelDelegate.update(update)));
    }
  }
}

export default DudeImporter;
