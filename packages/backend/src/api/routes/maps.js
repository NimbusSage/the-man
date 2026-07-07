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

  server.get('/api/v1/maps/tree', {
    onRequest: [server.authenticate]
  }, async () => {
    const maps = await prisma.map.findMany({
      include: { _count: { select: { devices: true } } },
      orderBy: { name: 'asc' }
    });
    return buildTree(maps, null);
  });

  server.get('/api/v1/maps', {
    onRequest: [server.authenticate]
  }, async (request) => {
    const { parentId } = request.query;
    const where = {};
    if (parentId !== undefined) {
      where.parentMapId = parentId || null;
    }
    const maps = await prisma.map.findMany({
      where,
      include: { _count: { select: { devices: true } } },
      orderBy: { name: 'asc' }
    });
    return maps.map(m => ({
      id: m.id,
      name: m.name,
      parentMapId: m.parentMapId,
      deviceCount: m._count.devices
    }));
  });

  server.get('/api/v1/maps/:id', {
    onRequest: [server.authenticate]
  }, async (request, reply) => {
    const map = await prisma.map.findUnique({
      where: { id: request.params.id },
      include: {
        _count: { select: { devices: true, submaps: true } },
        submaps: { orderBy: { name: 'asc' } },
        devices: { orderBy: { name: 'asc' }, take: 200 }
      }
    });
    if (!map) return reply.code(404).send({ error: 'Map not found' });
    return map;
  });
}
