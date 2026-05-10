"use strict";
import { Driver } from "homey";
import {
  HostUnreachableError,
  OmnikLocalApi,
  ParseError,
  TimeoutError,
  UnexpectedResponseError,
} from "./api";
import { Device } from "./types";

class OmnikLocal extends Driver {
  async onInit(): Promise<void> {
    this.registerFlowConditions();
  }

  private registerFlowConditions(): void {
    this.homey.flow
      .getConditionCard("is_producing")
      .registerRunListener(async ({ device }: { device: any }) => {
        const power = device.getCapabilityValue("measure_power") as number | null;
        return typeof power === "number" && power > 0;
      });

    this.homey.flow
      .getConditionCard("power_above")
      .registerRunListener(async ({ device, watts }: { device: any; watts: number }) => {
        const power = device.getCapabilityValue("measure_power") as number | null;
        return typeof power === "number" && power > watts;
      });

    this.homey.flow
      .getConditionCard("daily_production_above")
      .registerRunListener(async ({ device, kwh }: { device: any; kwh: number }) => {
        const daily = device.getCapabilityValue("meter_power.daily") as number | null;
        return typeof daily === "number" && daily > kwh;
      });
  }

  async onPair(session: any) {
    let pairingDevice: Device;
    let pairingIpAddress: string | null = null;
    let pairingWifiSn: number | null = null;

    session.setHandler("showView", async (view: string) => {
      this.log("Show view", view);

      if (view !== "validate") return;

      if (pairingIpAddress === null) {
        await session.showView("pair");
        await session.emit("alert", this.homey.__("pair.omnik-local.error.missing_ip_address"));
        return;
      }

      if (pairingWifiSn === null) {
        await session.showView("pair");
        await session.emit("alert", this.homey.__("pair.omnik-local.error.missing_wifi_sn"));
        return;
      }

      try {
        const omnikLocalApi = new OmnikLocalApi({ address: pairingIpAddress, wifiSn: pairingWifiSn });
        const { inverterName } = await omnikLocalApi.getData();

        pairingDevice = {
          name: inverterName || "Omnik",
          data: {
            id: Number(pairingWifiSn),
          },
          settings: {
            ip: pairingIpAddress,
            interval: 5,
          },
        };

        await session.showView("add_device");
      } catch (error) {
        await session.showView("pair");
        await session.emit("alert", this.translatePairError(error));
      }
    });

    session.setHandler("getDevice", async () => pairingDevice);

    session.setHandler("error", async (error: any) => {
      this.log("session.setHandler(error)", error);
    });

    session.setHandler("add_device_error", async (error: string) => {
      await session.showView("pair");
      await session.emit("alert", error);
    });

    session.setHandler("getIpAddress", async () => pairingIpAddress);
    session.setHandler("setIpAddress", async (ip: string) => {
      pairingIpAddress = ip;
    });

    session.setHandler("getWifiSn", async () => pairingWifiSn);
    session.setHandler("setWifiSn", async (wifiSn: number) => {
      pairingWifiSn = wifiSn;
    });
  }

  private translatePairError(error: unknown): string {
    if (error instanceof TimeoutError) {
      return this.homey.__("pair.omnik-local.error.connection_timed_out");
    }
    if (error instanceof HostUnreachableError) {
      return this.homey.__("pair.omnik-local.error.host_unreachable");
    }
    if (error instanceof UnexpectedResponseError || error instanceof ParseError) {
      return this.homey.__("pair.omnik-local.error.unexpected_response");
    }
    return this.homey.__("error.generic");
  }
}

module.exports = OmnikLocal;
