import Redis from 'ioredis';
import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import '../services/monitoring/PollerRegistry.js';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});
const prisma = new PrismaClient();

const worker = new Worker('theman-polling', async (job) => {
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
