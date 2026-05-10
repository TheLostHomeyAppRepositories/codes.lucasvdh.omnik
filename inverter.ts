import { Device } from "homey";

/**
 * Base class for inverter devices that need to poll their hardware on a fixed
 * interval. Uses a recursive-setTimeout pattern instead of `setInterval` so:
 *   - Polls cannot overlap (next is only scheduled after the previous resolves)
 *   - There's no clock drift if a poll takes longer than expected
 *   - Cleanup is explicit on `onUninit` and `onDeleted`
 *   - A long-running `checkProduction` doesn't queue up a backlog of ticks
 */
export abstract class Inverter extends Device {
  /** The refresh interval in minutes. Set during onInit from settings. */
  protected interval?: number;

  private timer?: NodeJS.Timeout;
  private polling = false;
  private stopped = false;

  async onInit(): Promise<void> {
    this.interval = this.getSetting("interval");
    if (!this.interval) {
      throw new Error("Expected interval to be set");
    }
    // Run the first poll immediately; subsequent polls schedule themselves
    // after completion via the tick() loop.
    this.tick();
  }

  abstract checkProduction(): Promise<void> | void;

  /** Apply a new polling interval (minutes). Reschedules the next tick. */
  protected resetInterval(newIntervalMinutes: number): void {
    this.interval = newIntervalMinutes;
    this.cancelTimer();
    if (!this.polling) {
      this.scheduleNext();
    }
    // If a poll is in flight, scheduleNext() will run from the finally block
    // of tick() and pick up the new interval automatically.
  }

  async onUninit(): Promise<void> {
    this.stop();
  }

  onDeleted(): void {
    this.stop();
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;

    if (this.polling) {
      // Defensive: tick() is normally only called from scheduleNext() after a
      // previous run completed. A double-fire shouldn't happen, but if it
      // does (e.g. resetInterval racing with a still-running poll), skip.
      this.log("Skipping tick: previous check still running");
      return;
    }

    this.polling = true;
    try {
      await this.checkProduction();
    } catch (err) {
      // checkProduction is expected to handle its own errors and call
      // setUnavailable/setAvailable as needed. This catch is the last line of
      // defense so an unhandled rejection here can never kill the loop.
      this.error("checkProduction threw uncaught", err);
    } finally {
      this.polling = false;
      this.scheduleNext();
    }
  }

  private scheduleNext(): void {
    if (this.stopped || !this.interval) return;
    this.timer = this.homey.setTimeout(() => this.tick(), this.interval * 60_000);
  }

  private cancelTimer(): void {
    if (this.timer) {
      this.homey.clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private stop(): void {
    this.stopped = true;
    this.cancelTimer();
  }
}
