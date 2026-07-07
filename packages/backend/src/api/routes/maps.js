export async function mapRoutes(server) {
  const prisma = server.prisma;

  function buildTree(maps, parentId = null) {
    return maps
      .filter(m => (m.parentMapId === null ? null : m.parentMapId) === parentId)
      .map(m => ({
        id: m.id,
        name: m.name,
        parentMapId: m.parentMapId,
        deviceCount: m._count?.devices ?? 0,
        submaps: buildTree(maps, m.id)
      }));
  }

  server.get('/api/v1/maps/tree', { onRequest: [server.authenticate] }, async () => {
    const maps = await prisma.map.findMany({
      include: { _count: { select: { devices: true } } },
      orderBy: { name: 'asc' }
    });
    return buildTree(maps, null);
  });

  server.get('/api/v1/maps', { onRequest: [server.authenticate] }, async (request) => {
    const { parentId } = request.query;
    const where = {};
    if (parentId !== undefined) where.parentMapId = parentId || null;
    const maps = await prisma.map.findMany({
      where, include: { _count: { select: { devices: true } } }, orderBy: { name: 'asc' }
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
    try {
      const map = await prisma.map.update({
        where: { id: request.params.id },
        data: { name, parentMapId, backgroundImage, layoutType, viewport },
      });
      return map;
    } catch {
      return reply.code(404).send({ error: 'Map not found' });
    }
  });

  server.delete('/api/v1/maps/:id', { onRequest: [server.authenticate] }, async (request, reply) => {
    try {
      await prisma.map.delete({ where: { id: request.params.id } });
      return { success: true };
    } catch {
      return reply.code(404).send({ error: 'Map not found' });
    }
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
    const device = await prisma.device.findUnique({ where: { id: request.params.id } });
    if (!device) return reply.code(404).send({ error: 'Device not found' });
    const { SNMPPoller } = await import('../../services/monitoring/pollers/SNMPPoller.js');
    const poller = new SNMPPoller();
    try {
      const interfaces = await poller.discoverInterfaces(device, prisma);
      return { interfaces, count: interfaces.length };
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });
}
