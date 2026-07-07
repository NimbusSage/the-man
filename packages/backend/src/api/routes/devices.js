import { Prisma } from '@prisma/client';

const ORDER_MAP = {
  name: 'd.name',
  ip: 'd.ip',
  macAddress: 'd.mac_address',
  deviceType: 'd.device_type',
  status: 'd.status',
  vendor: 'd.vendor',
  model: 'd.model',
  osVersion: 'd.os_version',
  lastSeen: 'd.last_seen',
  mapName: 'm.name',
  serviceCount: 'service_count',
  servicesCritical: 'services_critical',
};

const SELECT_COLS = `
  d.id, d.name, d.ip,
  d.mac_address AS "macAddress",
  d.device_type AS "deviceType",
  d.vendor, d.model,
  d.os_version AS "osVersion",
  d.parent_id AS "parentId",
  d.map_id AS "mapId",
  d.position_x AS "positionX",
  d.position_y AS "positionY",
  d.icon, d.status,
  d.acked, d.acked_at AS "ackedAt", d.acked_by AS "ackedBy", d.ack_note AS "ackNote",
  d.last_seen AS "lastSeen",
  d.metadata, d.dude_id AS "dudeId",
  d.created_at AS "createdAt", d.updated_at AS "updatedAt",
  m.name AS "mapName",
  COUNT(s.id)::int AS "serviceCount",
  COUNT(s.id) FILTER (WHERE s.status = 'CRITICAL')::int AS "servicesCritical",
  COUNT(s.id) FILTER (WHERE s.status = 'WARNING')::int AS "servicesWarning",
  COUNT(s.id) FILTER (WHERE s.status = 'OK')::int AS "servicesOk",
  (SELECT COUNT(*)::int FROM notes n WHERE n.device_id = d.id) AS "noteCount",
  (SELECT LEFT(n.text, 120) FROM notes n WHERE n.device_id = d.id ORDER BY n.created_at DESC LIMIT 1) AS "notePreview"
`;

function buildFilters(params) {
  const clauses = ['1=1'];
  const vals = [];
  let idx = 1;

  const { status, search, mapId, deviceType, serviceStatus, acked } = params;

  if (status) {
    clauses.push(`d.status = $${idx++}`);
    vals.push(status.toUpperCase());
  }

  if (search) {
    const term = `%${search}%`;
    clauses.push(`(
      d.name ILIKE $${idx} OR d.ip LIKE $${idx} OR
      d.mac_address ILIKE $${idx} OR d.vendor ILIKE $${idx} OR
      d.model ILIKE $${idx} OR d.device_type ILIKE $${idx}
    )`);
    vals.push(term);
    idx++;
  }

  if (mapId) {
    clauses.push(`d.map_id = $${idx++}`);
    vals.push(mapId);
  }

  if (deviceType) {
    clauses.push(`d.device_type = $${idx++}`);
    vals.push(deviceType);
  }

  if (acked === 'true' || acked === '1') {
    clauses.push('d.acked = true');
  } else if (acked === 'false' || acked === '0') {
    clauses.push('d.acked = false');
  }

  return { whereSQL: clauses.join(' AND '), vals };
}

function buildHaving(serviceStatus) {
  if (!serviceStatus || serviceStatus === 'any') return { havingSQL: '1=1', havingVals: [] };

  const havingMap = {
    up: `COUNT(s.id) > 0 AND COUNT(s.id) FILTER (WHERE s.status != 'OK') = 0`,
    down: `COUNT(s.id) > 0 AND COUNT(s.id) FILTER (WHERE s.status = 'OK') = 0 AND COUNT(s.id) FILTER (WHERE s.status = 'CRITICAL') > 0`,
    partial: `COUNT(s.id) FILTER (WHERE s.status = 'CRITICAL') > 0 AND COUNT(s.id) FILTER (WHERE s.status = 'OK') > 0`,
    unknown: `COUNT(s.id) = 0`,
    acked: `bool_or(d.acked) = true`,
  };

  return { havingSQL: havingMap[serviceStatus] || '1=1', havingVals: [] };
}

function buildOrder(sortBy, sortOrder) {
  const col = ORDER_MAP[sortBy];
  if (!col) return 'd.name ASC';
  const dir = sortOrder === 'desc' ? 'DESC' : 'ASC';
  return `${col} ${dir}`;
}

export async function deviceRoutes(server) {
  const prisma = server.prisma;

  server.get('/api/v1/devices', {
    onRequest: [server.authenticate]
  }, async (request, reply) => {
    const {
      status, search, mapId, deviceType, serviceStatus, acked,
      sortBy = 'name', sortOrder = 'asc',
      limit = 50, offset = 0,
      export: exportFmt
    } = request.query;

    const intLimit = Math.min(parseInt(limit) || 50, 5000);
    const intOffset = parseInt(offset) || 0;

    const { whereSQL, vals } = buildFilters({ status, search, mapId, deviceType, serviceStatus, acked });
    const { havingSQL } = buildHaving(serviceStatus);
    const orderSQL = buildOrder(sortBy, sortOrder);

    const isExport = exportFmt === 'csv' || exportFmt === 'json';

    let sql, countSQL, countParams;

    if (isExport) {
      sql = `
        SELECT ${SELECT_COLS}
        FROM devices d
        LEFT JOIN maps m ON m.id = d.map_id
        LEFT JOIN services s ON s.device_id = d.id AND s.enabled = true
        WHERE ${whereSQL}
        GROUP BY d.id, m.name
        HAVING ${havingSQL}
        ORDER BY ${orderSQL}
      `;
    } else {
      sql = `
        SELECT ${SELECT_COLS}
        FROM devices d
        LEFT JOIN maps m ON m.id = d.map_id
        LEFT JOIN services s ON s.device_id = d.id AND s.enabled = true
        WHERE ${whereSQL}
        GROUP BY d.id, m.name
        HAVING ${havingSQL}
        ORDER BY ${orderSQL}
        LIMIT ${intLimit} OFFSET ${intOffset}
      `;

      countSQL = `
        SELECT COUNT(*)::int AS total FROM (
          SELECT d.id
          FROM devices d
          LEFT JOIN services s ON s.device_id = d.id AND s.enabled = true
          WHERE ${whereSQL}
          GROUP BY d.id
          HAVING ${havingSQL}
        ) sub
      `;
    }

    try {
      if (isExport) {
        const rows = await prisma.$queryRawUnsafe(sql, ...vals);

        if (exportFmt === 'json') {
          reply.header('Content-Type', 'application/json');
          reply.header('Content-Disposition', 'attachment; filename="devices.json"');
          return rows;
        }

        if (!rows.length) {
          reply.header('Content-Type', 'text/csv');
          reply.header('Content-Disposition', 'attachment; filename="devices.csv"');
          return 'name,ip,macAddress,deviceType,vendor,model,status,mapName,serviceCount,servicesCritical\n';
        }

        const csvHeaders = Object.keys(rows[0]).join(',');
        const csvRows = rows.map(r =>
          Object.values(r).map(v =>
            v === null || v === undefined ? '' :
            typeof v === 'string' && (v.includes(',') || v.includes('"') || v.includes('\n'))
              ? `"${v.replace(/"/g, '""')}"` : String(v)
          ).join(',')
        );
        const csv = [csvHeaders, ...csvRows].join('\n');

        reply.header('Content-Type', 'text/csv');
        reply.header('Content-Disposition', 'attachment; filename="devices.csv"');
        return csv;
      }

      const [rows, countResult] = await Promise.all([
        prisma.$queryRawUnsafe(sql, ...vals),
        prisma.$queryRawUnsafe(countSQL, ...vals)
      ]);

      const total = countResult[0]?.total ?? 0;

      return {
        devices: rows,
        total,
        limit: intLimit,
        offset: intOffset
      };
    } catch (err) {
      request.log.error(err, 'Device list query failed');
      throw err;
    }
  });

  server.get('/api/v1/devices/types', {
    onRequest: [server.authenticate]
  }, async () => {
    const rows = await prisma.$queryRaw`
      SELECT DISTINCT device_type AS "deviceType" FROM devices ORDER BY "deviceType"
    `;
    return rows.map(r => r.deviceType);
  });

  server.get('/api/v1/devices/:id', {
    onRequest: [server.authenticate]
  }, async (request, reply) => {
    const device = await prisma.device.findUnique({
      where: { id: request.params.id },
      include: {
        map: true,
        services: true,
        notes: { orderBy: { createdAt: 'desc' }, take: 20 },
        alerts: {
          where: { status: 'ACTIVE' },
          take: 10,
          orderBy: { triggeredAt: 'desc' }
        }
      }
    });

    if (!device) return reply.code(404).send({ error: 'Device not found' });

    return device;
  });

  server.patch('/api/v1/devices/:id/ack', {
    onRequest: [server.authenticate]
  }, async (request, reply) => {
    const { acked, note } = request.body;

    const data = {
      acked: !!acked,
      ackedAt: acked ? new Date() : null,
      ackedBy: acked ? request.user?.id : null,
      ackNote: acked ? (note || null) : null,
    };

    const device = await prisma.device.update({
      where: { id: request.params.id },
      data
    });

    await prisma.auditLog.create({
      data: {
        userId: request.user?.id,
        action: acked ? 'ACK_DEVICE' : 'UNACK_DEVICE',
        resourceType: 'device',
        resourceId: device.id,
        details: { acked, note }
      }
    });

    return device;
  });

  server.post('/api/v1/devices', {
    onRequest: [server.authenticate]
  }, async (request, reply) => {
    const { name, ip, device_type, vendor, model } = request.body;

    if (!name || !ip) return reply.code(400).send({ error: 'Name and IP required' });

    const device = await prisma.device.create({
      data: {
        name,
        ip,
        deviceType: device_type || 'unknown',
        vendor,
        model,
        status: 'UNKNOWN'
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: request.user.id,
        action: 'CREATE_DEVICE',
        resourceType: 'device',
        resourceId: device.id,
        details: { name, ip }
      }
    });

    return device;
  });

  server.put('/api/v1/devices/:id', {
    onRequest: [server.authenticate]
  }, async (request, reply) => {
    const updates = request.body;
    delete updates.id;

    const device = await prisma.device.update({
      where: { id: request.params.id },
      data: updates
    });

    return device;
  });

  server.delete('/api/v1/devices/:id', {
    onRequest: [server.authenticate]
  }, async (request) => {
    await prisma.device.delete({
      where: { id: request.params.id }
    });
    return { success: true };
  });
}
