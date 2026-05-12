import {
  generateDeviceReport,
  generateIpReport,
  renderMarkdown,
  NetworkSnapshot,
} from "./drivers/omnik-local/diagnostic";

const DRIVER_ID = "omnik-local";

interface ApiArgs {
  homey: any;
}

interface ReportArgs extends ApiArgs {
  body: { deviceId: string };
}

interface ProbeIpArgs extends ApiArgs {
  body: { ip: string };
}

interface DeviceLite {
  getName(): string;
  getData(): { id?: string | number } & Record<string, unknown>;
}

module.exports = {
  async listDevices({ homey }: ApiArgs): Promise<Array<{ id: string; name: string }>> {
    const driver = homey.drivers.getDriver(DRIVER_ID);
    return driver.getDevices().map((d: DeviceLite) => ({
      id: String(d.getData().id ?? d.getName()),
      name: d.getName(),
    }));
  },

  async generateReport({ homey, body }: ReportArgs): Promise<{ markdown: string }> {
    const driver = homey.drivers.getDriver(DRIVER_ID);
    const device = driver
      .getDevices()
      .find((d: DeviceLite) => String(d.getData().id ?? "") === body.deviceId);
    if (!device) {
      throw new Error(`No paired device found with id ${body.deviceId}`);
    }

    const report = await generateDeviceReport({
      device,
      appVersion: String(homey.manifest?.version ?? "unknown"),
      homeyFirmwareVersion: typeof homey.version === "string" ? homey.version : undefined,
      homeyPlatform: typeof homey.platform === "string" ? homey.platform : undefined,
      network: await collectNetwork(homey, device),
    });

    return { markdown: renderMarkdown(report) };
  },

  async probeByIp({ homey, body }: ProbeIpArgs): Promise<{ markdown: string }> {
    const ip = String(body?.ip ?? "").trim();
    if (!ip) throw new Error("ip is required");
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) throw new Error(`"${ip}" doesn't look like an IPv4 address`);

    const report = await generateIpReport({
      ip,
      appVersion: String(homey.manifest?.version ?? "unknown"),
      homeyFirmwareVersion: typeof homey.version === "string" ? homey.version : undefined,
      homeyPlatform: typeof homey.platform === "string" ? homey.platform : undefined,
      network: await collectNetworkForIp(homey, ip),
    });

    return { markdown: renderMarkdown(report) };
  },
};

async function collectNetworkForIp(homey: any, ip: string): Promise<NetworkSnapshot> {
  try {
    const mac = await Promise.race([
      homey.arp.getMAC(ip),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("ARP lookup timed out after 2s")), 2000),
      ),
    ]);
    return { ip, arpMac: typeof mac === "string" && mac.length > 0 ? mac : undefined };
  } catch (err) {
    return { ip, arpError: humaniseArpError((err as Error).message) };
  }
}

async function collectNetwork(homey: any, device: any): Promise<NetworkSnapshot | undefined> {
  const settings = device.getSettings?.() ?? {};
  const ip: string | undefined = settings.ip;
  if (!ip) return undefined;
  return collectNetworkForIp(homey, ip);
}

function humaniseArpError(message: string): string {
  if (message.includes("ping")) return "Inverter did not respond to ARP probe (likely powered off)";
  if (message.includes("timed out")) return "ARP lookup timed out";
  return message;
}
