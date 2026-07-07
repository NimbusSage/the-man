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
    try {
      const service = await prisma.service.update({
        where: { id: request.params.id },
        data: { name, type, config, interval, timeout, enabled },
      });
      return service;
    } catch {
      return reply.code(404).send({ error: 'Service not found' });
    }
  });

  server.delete('/api/v1/services/:id', { onRequest: [server.authenticate] }, async (request, reply) => {
    try {
      await prisma.service.delete({ where: { id: request.params.id } });
      return { success: true };
    } catch {
      return reply.code(404).send({ error: 'Service not found' });
    }
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
