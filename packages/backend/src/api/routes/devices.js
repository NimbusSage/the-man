// packages/backend/src/api/routes/devices.js

export async function deviceRoutes(server) {
  const prisma = server.prisma;

  // List all devices
  server.get('/api/v1/devices', {
    onRequest: [server.authenticate]
  }, async (request) => {
    const {
      status,
      search,
      limit = 100,
      offset = 0,
      sortBy = 'name',
      sortOrder = 'asc'
    } = request.query;

    const where = {};
    if (status) where.status = status.toUpperCase();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { ip: { contains: search } },
        { macAddress: { contains: search, mode: 'insensitive' } },
        { vendor: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
        { deviceType: { contains: search, mode: 'insensitive' } }
      ];
    }

    const orderMap = {
      name: 'name',
      ip: 'ip',
      macAddress: 'macAddress',
      deviceType: 'deviceType',
      status: 'status',
      vendor: 'vendor',
      model: 'model',
      osVersion: 'osVersion',
      lastSeen: 'lastSeen'
    };

    const orderBy = orderMap[sortBy] || 'name';
    const orderDirection = sortOrder === 'desc' ? 'desc' : 'asc';

    const [devices, total] = await Promise.all([
      prisma.device.findMany({
        where,
        take: parseInt(limit),
        skip: parseInt(offset),
        orderBy: { [orderBy]: orderDirection }
      }),
      prisma.device.count({ where })
    ]);

    return { devices, total, limit: parseInt(limit), offset: parseInt(offset) };
  });

  // Get single device
  server.get('/api/v1/devices/:id', {
    onRequest: [server.authenticate]
  }, async (request) => {
    const device = await prisma.device.findUnique({
      where: { id: request.params.id },
      include: {
        services: true,
        alerts: {
          where: { status: 'ACTIVE' },
          take: 10,
          orderBy: { triggeredAt: 'desc' }
        }
      }
    });

    if (!device) {
      return reply.code(404).send({ error: 'Device not found' });
    }

    return device;
  });

  // Create device
  server.post('/api/v1/devices', {
    onRequest: [server.authenticate]
  }, async (request, reply) => {
    const { name, ip, device_type, vendor, model } = request.body;

    if (!name || !ip) {
      return reply.code(400).send({ error: 'Name and IP required' });
    }

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

    // Log creation
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

  // Update device
  server.put('/api/v1/devices/:id', {
    onRequest: [server.authenticate]
  }, async (request, reply) => {
    const updates = request.body;
    delete updates.id; // Prevent ID change

    const device = await prisma.device.update({
      where: { id: request.params.id },
      data: updates
    });

    return device;
  });

  // Delete device
  server.delete('/api/v1/devices/:id', {
    onRequest: [server.authenticate]
  }, async (request) => {
    await prisma.device.delete({
      where: { id: request.params.id }
    });

    return { success: true };
  });
}
