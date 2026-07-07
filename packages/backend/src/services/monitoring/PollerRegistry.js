import { PingPoller } from './pollers/PingPoller.js';
import { SNMPPoller } from './pollers/SNMPPoller.js';

const registry = new Map();

export function registerPoller(type, instance) {
  registry.set(type, instance);
}

export function getPoller(type) {
  return registry.get(type);
}

export function getAllPollers() {
  return Array.from(registry.values());
}

registerPoller('ping', new PingPoller());
registerPoller('snmp', new SNMPPoller());
