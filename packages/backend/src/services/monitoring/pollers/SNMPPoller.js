import snmp from 'net-snmp';
import { BasePoller } from './BasePoller.js';
import { SNMP_OIDS } from '@theman/shared/src/constants.js';

export class SNMPPoller extends BasePoller {
  createSession(device) {
    const community = device.metadata?.snmpCommunity || 'public';
    const version = device.metadata?.snmpVersion || snmp.Version2c;
    return snmp.createSession(device.ip, community, { version, timeout: 5000, retries: 1 });
  }

  async poll(device, service) {
    const config = service.config || {};
    const ifIndex = config.ifIndex;
    if (ifIndex != null) {
      return await this.pollInterface(device, ifIndex);
    }
    if (config.oids?.length) {
      return await this.pollCustomOIDs(device, config.oids);
    }
    throw new Error('SNMP service has no ifIndex or custom OIDs configured');
  }

  pollInterface(device, ifIndex) {
    const session = this.createSession(device);
    const startTime = Date.now();
    const oids = [
      `${SNMP_OIDS.ifDescr}.${ifIndex}`,
      `${SNMP_OIDS.ifOperStatus}.${ifIndex}`,
      `${SNMP_OIDS.ifInOctets}.${ifIndex}`,
      `${SNMP_OIDS.ifOutOctets}.${ifIndex}`,
      `${SNMP_OIDS.ifInErrors}.${ifIndex}`,
      `${SNMP_OIDS.ifOutErrors}.${ifIndex}`,
    ];
    return new Promise((resolve) => {
      session.get(oids, (err, data) => {
        session.close();
        if (err) {
          return resolve({
            success: false, status: 'critical', error: err.message,
            timestamp: new Date(), duration: Date.now() - startTime, metrics: [],
          });
        }
        const result = {};
        for (const vb of data) {
          if (snmp.isVarbindError(vb)) continue;
          result[vb.oid] = vb.value;
        }
        const operStatus = result[`${SNMP_OIDS.ifOperStatus}.${ifIndex}`];
        const isUp = operStatus === 1;
        const metrics = [
          { name: 'ifInOctets', value: result[`${SNMP_OIDS.ifInOctets}.${ifIndex}`] || 0, unit: 'bytes' },
          { name: 'ifOutOctets', value: result[`${SNMP_OIDS.ifOutOctets}.${ifIndex}`] || 0, unit: 'bytes' },
          { name: 'ifInErrors', value: result[`${SNMP_OIDS.ifInErrors}.${ifIndex}`] || 0, unit: 'count' },
          { name: 'ifOutErrors', value: result[`${SNMP_OIDS.ifOutErrors}.${ifIndex}`] || 0, unit: 'count' },
          { name: 'ifOperStatus', value: isUp ? 1 : 0, unit: 'bool' },
        ];
        resolve({
          success: isUp, status: isUp ? 'ok' : 'critical',
          timestamp: new Date(), duration: Date.now() - startTime, metrics,
        });
      });
    });
  }

  pollCustomOIDs(device, oids) {
    const session = this.createSession(device);
    const startTime = Date.now();
    const oidList = oids.map(o => o.oid || o);
    return new Promise((resolve) => {
      session.get(oidList, (err, data) => {
        session.close();
        if (err) {
          return resolve({
            success: false, status: 'critical', error: err.message,
            timestamp: new Date(), duration: Date.now() - startTime, metrics: [],
          });
        }
        const metrics = [];
        for (const vb of data) {
          if (snmp.isVarbindError(vb)) continue;
          metrics.push({
            name: oids.find(o => o.oid === vb.oid || o === vb.oid)?.name || vb.oid,
            value: vb.value, unit: 'count',
          });
        }
        resolve({
          success: true, status: 'ok',
          timestamp: new Date(), duration: Date.now() - startTime, metrics,
        });
      });
    });
  }

  discoverInterfaces(device, prisma) {
    const session = this.createSession(device);
    return new Promise((resolve, reject) => {
      session.walk(SNMP_OIDS.ifDescr, async (err, data) => {
        session.close();
        if (err) return reject(err);
        const interfaces = [];
        for (const vb of data) {
          if (snmp.isVarbindError(vb)) continue;
          const ifIndex = parseInt(vb.oid.split('.').pop(), 10);
          const ifDescr = vb.value.toString();
          interfaces.push({ ifIndex, ifDescr });
          const exists = await prisma.service.findFirst({
            where: { deviceId: device.id, type: `snmp-if-${ifIndex}` },
          });
          if (!exists) {
            await prisma.service.create({
              data: {
                deviceId: device.id, name: ifDescr,
                type: `snmp-if-${ifIndex}`,
                config: { ifIndex, oids: [] },
                interval: 60, timeout: 10, enabled: true,
              },
            });
          }
        }
        resolve(interfaces);
      });
    });
  }

  validateConfig(config) {
    if (!config.ifIndex && !config.oids) throw new Error('SNMP config needs ifIndex or oids');
    return true;
  }

  getDefaultConfig() {
    return { ifIndex: null, oids: [] };
  }

  getType() { return 'snmp'; }
  getName() { return 'SNMP'; }
  getDescription() { return 'SNMP interface and custom OID polling'; }
}

export default SNMPPoller;
