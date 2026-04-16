import { EventEmitter } from 'events';

export class DiscoveryService extends EventEmitter {
  constructor() {
    super();
    console.log('✓ DiscoveryService initialized');
  }
}
