// packages/backend/src/services/monitoring/pollers/PingPoller.js

import ping from 'ping';

/**
 * @typedef {Object} PingConfig
 * @property {number} [count=1] - Number of ping attempts
 * @property {number} [timeout=3000] - Timeout in milliseconds
 * @property {number} [deadline=5] - Total execution deadline
 * @property {number} [warningThreshold] - Latency warning threshold (ms)
 * @property {number} [criticalThreshold] - Latency critical threshold (ms)
 */

/**
 * @typedef {Object} PollResult
 * @property {boolean} success - Whether the poll succeeded
 * @property {string} status - Status: ok, warning, critical
 * @property {number} latency - Latency in milliseconds (-1 if unreachable)
 * @property {number} packetLoss - Packet loss percentage
 * @property {Date} timestamp - Poll timestamp
 * @property {number} duration - Poll duration in milliseconds
 * @property {string} [message] - Human-readable message
 * @property {string} [error] - Error message if failed
 * @property {Array} metrics - Array of metric objects
 */

/**
 * ICMP Ping Poller
 * Monitors device reachability and latency via ICMP echo requests
 */
export class PingPoller {
  /**
   * Poll a device using ICMP ping
   * @param {Object} device - Device object with IP address
   * @param {Object} service - Service configuration
   * @returns {Promise<PollResult>}
   */
  async poll(device, service) {
    const config = service.config || {};
    const startTime = Date.now();

    try {
      const result = await ping.promise.probe(device.ip, {
        timeout: (config.timeout || 3000) / 1000, // Convert to seconds
        min_reply: config.count || 1,
        deadline: config.deadline || 5,
        extra: ['-i', '0.2'], // 200ms interval between pings
      });

      const latency = result.alive ? parseFloat(result.time) : -1;
      const isUp = result.alive;

      // Determine status based on thresholds
      let status = 'ok';
      if (!isUp) {
        status = 'critical';
      } else if (config.criticalThreshold && latency > config.criticalThreshold) {
        status = 'critical';
      } else if (config.warningThreshold && latency > config.warningThreshold) {
        status = 'warning';
      }

      return {
        success: isUp,
        status,
        latency,
        packetLoss: result.alive ? 0 : 100,
        timestamp: new Date(),
        duration: Date.now() - startTime,
        message: isUp 
          ? `Host is reachable (${latency.toFixed(2)}ms)` 
          : 'Host unreachable',
        metrics: [
          {
            name: 'latency',
            value: latency,
            unit: 'ms'
          },
          {
            name: 'packet_loss',
            value: result.alive ? 0 : 100,
            unit: '%'
          },
          {
            name: 'uptime',
            value: result.alive ? 1 : 0,
            unit: 'bool'
          }
        ]
      };
    } catch (error) {
      return {
        success: false,
        status: 'critical',
        latency: -1,
        packetLoss: 100,
        timestamp: new Date(),
        duration: Date.now() - startTime,
        error: error.message,
        message: `Ping failed: ${error.message}`,
        metrics: [
          {
            name: 'latency',
            value: -1,
            unit: 'ms'
          },
          {
            name: 'packet_loss',
            value: 100,
            unit: '%'
          },
          {
            name: 'uptime',
            value: 0,
            unit: 'bool'
          }
        ]
      };
    }
  }

  /**
   * Validate ping service configuration
   * @param {PingConfig} config - Configuration to validate
   * @returns {boolean}
   * @throws {Error} If configuration is invalid
   */
  validateConfig(config) {
    if (config.timeout && (config.timeout < 100 || config.timeout > 30000)) {
      throw new Error('Timeout must be between 100ms and 30s');
    }
    if (config.count && (config.count < 1 || config.count > 10)) {
      throw new Error('Count must be between 1 and 10');
    }
    if (config.warningThreshold && config.warningThreshold < 0) {
      throw new Error('Warning threshold must be positive');
    }
    if (config.criticalThreshold && config.criticalThreshold < 0) {
      throw new Error('Critical threshold must be positive');
    }
    if (config.warningThreshold && config.criticalThreshold &&
        config.warningThreshold >= config.criticalThreshold) {
      throw new Error('Warning threshold must be less than critical threshold');
    }
    return true;
  }

  /**
   * Get default configuration for ping service
   * @returns {PingConfig}
   */
  getDefaultConfig() {
    return {
      count: 1,
      timeout: 3000,
      deadline: 5,
      warningThreshold: 200,
      criticalThreshold: 500
    };
  }

  /**
   * Check if result should trigger alert
   * @param {PollResult} result - Current poll result
   * @param {PollResult} [lastResult] - Previous poll result
   * @returns {boolean}
   */
  shouldAlert(result, lastResult) {
    // Always alert on first critical state
    if (!lastResult && result.status === 'critical') {
      return true;
    }

    if (!lastResult) {
      return false;
    }

    // Alert on status change to warning/critical
    if (result.status !== 'ok' && lastResult.status === 'ok') {
      return true;
    }

    // Alert on continued critical state (every poll)
    if (result.status === 'critical' && lastResult.status === 'critical') {
      return true;
    }

    // Alert on recovery (critical/warning -> ok)
    if (result.status === 'ok' && lastResult.status !== 'ok') {
      return true;
    }

    return false;
  }

  /**
   * Calculate uptime percentage from results
   * @param {PollResult[]} results - Array of poll results
   * @param {number} [periodHours=24] - Period to calculate over
   * @returns {number} Uptime percentage (0-100)
   */
  calculateUptime(results, periodHours = 24) {
    if (!results || results.length === 0) {
      return 0;
    }
    
    // Filter to specified time period
    const cutoffTime = new Date(Date.now() - periodHours * 60 * 60 * 1000);
    const periodResults = results.filter(r => 
      new Date(r.timestamp) >= cutoffTime
    );

    if (periodResults.length === 0) {
      return 0;
    }
    
    const successCount = periodResults.filter(r => r.success).length;
    return (successCount / periodResults.length) * 100;
  }

  /**
   * Calculate average latency from results
   * @param {PollResult[]} results - Array of poll results
   * @returns {number} Average latency in milliseconds
   */
  calculateAverageLatency(results) {
    if (!results || results.length === 0) {
      return 0;
    }

    const validResults = results.filter(r => r.success && r.latency > 0);
    if (validResults.length === 0) {
      return 0;
    }

    const sum = validResults.reduce((acc, r) => acc + r.latency, 0);
    return sum / validResults.length;
  }

  /**
   * Get service type identifier
   * @returns {string}
   */
  getType() {
    return 'ping';
  }

  /**
   * Get human-readable service name
   * @returns {string}
   */
  getName() {
    return 'ICMP Ping';
  }

  /**
   * Get service description
   * @returns {string}
   */
  getDescription() {
    return 'Monitor device reachability and network latency using ICMP echo requests';
  }
}

export default PingPoller;
