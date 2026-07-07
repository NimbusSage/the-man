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
