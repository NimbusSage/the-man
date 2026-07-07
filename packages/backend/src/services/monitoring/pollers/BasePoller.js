export class BasePoller {
  async poll(device, service) {
    throw new Error(`${this.getType()}: poll() not implemented`);
  }

  validateConfig(config) {
    throw new Error(`${this.getType()}: validateConfig() not implemented`);
  }

  getDefaultConfig() {
    throw new Error(`${this.getType()}: getDefaultConfig() not implemented`);
  }

  getType() {
    throw new Error(`${this.getType()}: getType() not implemented`);
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
