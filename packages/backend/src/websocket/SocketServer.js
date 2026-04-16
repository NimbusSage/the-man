export class SocketServer {
  constructor(fastify) {
    this.fastify = fastify;
    console.log('✓ SocketServer initialized');
  }

  broadcastAlert(alert) {
    console.log('Alert broadcast:', alert);
  }

  broadcastDeviceStatus(data) {
    console.log('Device status broadcast:', data);
  }

  broadcastMetric(data) {
    console.log('Metric broadcast:', data);
  }
}
