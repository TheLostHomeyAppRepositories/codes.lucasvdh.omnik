import { Device } from "homey";

export abstract class Inverter extends Device {
  /** The refresh interval in minutes */
  protected interval?: number;
  private currentInterval?: NodeJS.Timeout;

  private setIntervalMinutes(intervalMinutes: number) {
    this.currentInterval = this.homey.setInterval(
      this.checkProduction.bind(this),
      intervalMinutes * 60_000
    );
  }

  protected resetInterval(newIntervalMinutes: number) {
    if (this.currentInterval) {
      this.homey.clearInterval(this.currentInterval);
    }
    this.setIntervalMinutes(newIntervalMinutes);
  }

  async onInit(): Promise<void> {
    this.interval = this.getSetting("interval");

    if (!this.interval) {
      throw new Error("Expected interval to be set");
    }

    this.setIntervalMinutes(this.interval);

    // Force immediate production check
    this.checkProduction();
  }

  abstract checkProduction(): Promise<void> | void;

  onDeleted() {
    if (this.currentInterval) {
      this.homey.clearInterval(this.currentInterval);
    }
  }
}
