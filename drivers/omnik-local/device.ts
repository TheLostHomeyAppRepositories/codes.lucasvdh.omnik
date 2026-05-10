"use strict";

import { Inverter } from "../../inverter";
import OmnikLocalApi, {
  HostUnreachableError,
  InverterData,
  ParseError,
  TimeoutError,
  UnexpectedResponseError,
} from "./api";
import { DeviceData, DeviceSettings, SettingsInput } from "./types";

const RETRY_DELAY_MS = 5000;
const MAX_ATTEMPTS = 2;

const MIGRATED_OPTIONS = ["meter_power", "meter_power.daily"];

class OmnikLocal extends Inverter {
  private api?: OmnikLocalApi;

  async onInit(): Promise<void> {
    this.log("Device has been initialized");

    await this.migrateCapabilities();

    const settings: DeviceSettings = this.getSettings();
    const data: DeviceData = this.getData();

    this.api = new OmnikLocalApi({ address: settings.ip, wifiSn: data.id });

    return super.onInit();
  }

  private async migrateCapabilities(): Promise<void> {
    if (!this.hasCapability("measure_temperature")) {
      this.log("Adding capability measure_temperature");
      await this.addCapability("measure_temperature");
    }
    if (!this.hasCapability("meter_power.daily")) {
      this.log("Adding capability meter_power.daily");
      await this.addCapability("meter_power.daily");
    }

    // capabilitiesOptions in driver.compose.json only apply to fresh pairings.
    // For upgrades we have to re-push them so v1.2 titles take effect on
    // existing devices. Read from the homey manifest (works regardless of
    // whether `driver.manifest` is populated in this SDK version).
    const driverId = this.driver.id;
    const driverManifest = (this.homey.manifest as any)?.drivers?.find(
      (d: any) => d.id === driverId
    );
    const manifestOptions: Record<string, Record<string, unknown>> | undefined =
      driverManifest?.capabilitiesOptions;

    if (!manifestOptions) {
      this.log("No capabilitiesOptions found in driver manifest, skipping option sync");
      return;
    }

    for (const capability of MIGRATED_OPTIONS) {
      const opts = manifestOptions[capability];
      if (!opts) continue;
      try {
        await this.setCapabilityOptions(capability, opts);
        this.log(`Synced options for ${capability}`);
      } catch (err) {
        this.error(`Failed to set options for ${capability}`, err);
      }
    }
  }

  async onSettings({ newSettings, changedKeys }: SettingsInput) {
    const data: DeviceData = this.getData();

    if (changedKeys.includes("ip") && newSettings.ip) {
      this.api = new OmnikLocalApi({ address: newSettings.ip, wifiSn: data.id });
    }

    if (changedKeys.includes("interval") && newSettings.interval) {
      this.resetInterval(newSettings.interval);
      this.log(`Changed interval to ${newSettings.interval} minutes`);
    }
  }

  async checkProduction(): Promise<void> {
    if (!this.api) {
      this.error("API not initialized");
      return;
    }

    this.log("Checking production");

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const data = await this.api.getData();
        this.log(
          `Inverter response: ${data.currentPower}W, ${data.currentVoltage}V, today=${data.dailyProduction}kWh, total=${data.totalProduction}kWh, ${data.currentTemperature}°C`
        );
        await this.applyInverterData(data);
        await this.markAvailable();
        return;
      } catch (error) {
        lastError = error;
        if (!this.isRetryable(error) || attempt === MAX_ATTEMPTS) break;
        this.log(`Attempt ${attempt} failed (${this.describe(error)}), retrying in ${RETRY_DELAY_MS}ms`);
        await this.delay(RETRY_DELAY_MS);
      }
    }

    this.error(`Unavailable: ${this.describe(lastError)}`);
    await this.markUnavailable(`Error retrieving data: ${this.describe(lastError)}`);
  }

  /**
   * Wrappers around setAvailable/setUnavailable that:
   *   - only call when the state actually changes (avoids hammering the
   *     internal SQLite DB every polling cycle when the inverter stays offline)
   *   - swallow errors so a transient DB-full / SDK error doesn't crash the
   *     whole app process. Crashes #4 and #6 (340× SQLITE_FULL) bubbled out of
   *     setUnavailable as unhandled rejections; this is the safety net.
   */
  private async markAvailable(): Promise<void> {
    if (this.getAvailable()) return;
    try {
      await this.setAvailable();
    } catch (err) {
      this.error("setAvailable failed", err);
    }
  }

  private async markUnavailable(reason: string): Promise<void> {
    if (!this.getAvailable()) return;
    try {
      await this.setUnavailable(reason);
    } catch (err) {
      this.error("setUnavailable failed", err);
    }
  }

  private async applyInverterData(data: InverterData): Promise<void> {
    await this.safeSetCapabilityValue("measure_power", data.currentPower);
    await this.safeSetCapabilityValue("measure_voltage", data.currentVoltage);
    if (Number.isFinite(data.currentTemperature)) {
      await this.safeSetCapabilityValue("measure_temperature", data.currentTemperature);
    }

    if (Number.isFinite(data.dailyProduction)) {
      const previousDaily = this.getCapabilityValue("meter_power.daily") as number | null;
      await this.safeSetCapabilityValue("meter_power.daily", data.dailyProduction);
      if (previousDaily !== data.dailyProduction) {
        this.driver
          .homey.flow.getDeviceTriggerCard("daily_production_changed")
          .trigger(this, { daily_production: data.dailyProduction })
          .catch((err) => this.error("Failed to fire daily_production_changed", err));
      }
    }

    // meter_power tracks lifetime cumulative kWh (from protocol offset 71).
    // Guard against transient zero readings so Insights/Energy don't see a regression.
    if (Number.isFinite(data.totalProduction)) {
      const previousTotal = this.getCapabilityValue("meter_power") as number | null;
      if (data.totalProduction > 0 || previousTotal == null) {
        await this.safeSetCapabilityValue("meter_power", data.totalProduction);
      }
    }
  }

  private async safeSetCapabilityValue(capability: string, value: unknown): Promise<void> {
    try {
      await this.setCapabilityValue(capability, value);
    } catch (err) {
      this.error(`Failed to set ${capability} = ${value}`, err);
    }
  }

  private isRetryable(error: unknown): boolean {
    return (
      error instanceof TimeoutError ||
      error instanceof HostUnreachableError ||
      (error instanceof Error && /ECONNRESET|EPIPE|ETIMEDOUT/.test(error.message))
    );
  }

  private describe(error: unknown): string {
    if (error instanceof TimeoutError) return "timeout";
    if (error instanceof HostUnreachableError) return error.message;
    if (error instanceof UnexpectedResponseError) return error.message;
    if (error instanceof ParseError) return error.message;
    if (error instanceof Error) return error.message;
    return String(error);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => this.homey.setTimeout(resolve, ms));
  }
}

module.exports = OmnikLocal;
