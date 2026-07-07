export class BasePoller {
  async poll(device, service) {
    throw new Error('poll() not implemented');
  }

  validateConfig(config) {
    throw new Error('validateConfig() not implemented');
  }

  getDefaultConfig() {
    throw new Error('getDefaultConfig() not implemented');
  }

  getType() {
    throw new Error('getType() not implemented');
  }

  getName() {
    return this.getType();
  }

  getDescription() {
    return '';
  }

  shouldAlert(result, lastResult) {
    return false;
  }
}
