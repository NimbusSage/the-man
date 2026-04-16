import { EventEmitter } from 'events';

export class AlertingService extends EventEmitter {
  constructor(prisma, redis) {
    super();
    this.prisma = prisma;
    this.redis = redis;
    console.log('✓ AlertingService initialized');
  }
}
