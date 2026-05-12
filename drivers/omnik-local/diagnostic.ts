import type Homey from "homey";
import net from "net";
import { OmnikLocalApi, OmnikProtocol, InverterData } from "./api";
import { OmnikHttpApi } from "./http-api";

// Settings keys whose value must never appear in a diagnostic report.
const SECRET_SETTINGS_KEYS = new Set<string>(["http_password"]);

export interface ProbeResult {
  label: string;
  target: string;
  status: "ok" | "fail" | "skipped";
  durationMs?: number;
  statusCode?: number;
  errorName?: string;
  errorMessage?: string;
  responseSummary?: string;
  responseRaw?: unknown;
}

export interface DeviceSnapshot {
  id: string;
  name: string;
  available: boolean;
  settings: Record<string, unknown>;
  store: Record<string, unknown>;
  capabilities: Array<{ id: string; value: unknown }>;
}

export interface NetworkSnapshot {
  ip: string;
  arpMac?: string;
  arpError?: string;
  tcpReachable?: boolean;
  tcpError?: string;
}

export interface DiagnosticReport {
  generatedAt: string;
  appVersion: string;
  homeyFirmwareVersion?: string;
  homeyPlatform?: string;
  scope: "paired-device" | "ip-only";
  scopeTarget: string;
  device?: DeviceSnapshot;
  network?: NetworkSnapshot;
  probes: ProbeResult[];
}

const RESPONSE_PREVIEW_LENGTH = 600;
const PER_PROBE_TIMEOUT_MS = 6_000;
const TCP_REACHABILITY_TIMEOUT_MS = 3_000;

interface ProbeRunner {
  (): Promise<unknown>;
}

export async function generateDeviceReport(opts: {
  device: Homey.Device;
  appVersion: string;
  homeyFirmwareVersion?: string;
  homeyPlatform?: string;
  network?: NetworkSnapshot;
}): Promise<DiagnosticReport> {
  const { device, appVersion, homeyFirmwareVersion, homeyPlatform, network } = opts;
  const settings = device.getSettings() as Record<string, unknown>;
  const ip = String(settings.ip ?? "");
  const wifiSn = settings.wifi_sn ? Number(settings.wifi_sn) : Number((device.getData() as { id?: number }).id);
  const auth = settings.http_user
    ? { user: String(settings.http_user), password: String(settings.http_password ?? "") }
    : undefined;

  return {
    generatedAt: new Date().toISOString(),
    appVersion,
    homeyFirmwareVersion,
    homeyPlatform,
    scope: "paired-device",
    scopeTarget: device.getName(),
    device: snapshotDevice(device),
    network,
    probes: await runAllProbes({ ip, wifiSn: Number.isFinite(wifiSn) ? wifiSn : undefined, auth }),
  };
}

/**
 * Build a report against an IP address only, used when the inverter refuses to
 * pair. Without a known WiFi-stick S/N we can only probe HTTP /js/status.js
 * and the raw TCP/8899 port; we'll only run the binary protocol probe if the
 * HTTP probe handed us a serial.
 */
export async function generateIpReport(opts: {
  ip: string;
  appVersion: string;
  homeyFirmwareVersion?: string;
  homeyPlatform?: string;
  network?: NetworkSnapshot;
}): Promise<DiagnosticReport> {
  const { ip, appVersion, homeyFirmwareVersion, homeyPlatform, network } = opts;

  return {
    generatedAt: new Date().toISOString(),
    appVersion,
    homeyFirmwareVersion,
    homeyPlatform,
    scope: "ip-only",
    scopeTarget: ip,
    network,
    probes: await runAllProbes({ ip }),
  };
}

function snapshotDevice(device: Homey.Device): DeviceSnapshot {
  const data = device.getData() as { id?: number | string };
  const rawSettings = device.getSettings() as Record<string, unknown>;
  const settings: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawSettings)) {
    if (SECRET_SETTINGS_KEYS.has(key)) {
      settings[key] = value ? "<redacted>" : "";
      continue;
    }
    settings[key] = value;
  }

  const store: Record<string, unknown> = {};
  for (const key of device.getStoreKeys() ?? []) {
    store[key] = device.getStoreValue(key);
  }

  const capabilities = device.getCapabilities().map((cap) => ({
    id: cap,
    value: device.getCapabilityValue(cap),
  }));

  return {
    id: String(data.id ?? device.getName()),
    name: device.getName(),
    available: device.getAvailable(),
    settings,
    store,
    capabilities,
  };
}

async function runAllProbes(opts: {
  ip: string;
  wifiSn?: number;
  auth?: { user: string; password: string };
}): Promise<ProbeResult[]> {
  const { ip, wifiSn, auth } = opts;

  const probes: Array<{ label: string; target: string; runner: ProbeRunner }> = [];

  probes.push({
    label: "TCP/8899 port reachability",
    target: `tcp://${ip}:8899`,
    runner: async () => {
      const result = await probeTcpReachable(ip, 8899, TCP_REACHABILITY_TIMEOUT_MS);
      return { open: result.open, errorCode: result.errorCode };
    },
  });

  probes.push({
    label: "HTTP /js/status.js (no auth)",
    target: `http://${ip}:80/js/status.js`,
    runner: async () => {
      const api = new OmnikHttpApi({ address: ip, timeoutMs: PER_PROBE_TIMEOUT_MS });
      const discovery = await api.discover();
      return {
        inverterName: discovery.inverterName,
        model: discovery.model,
        wifiStickSn: discovery.wifiStickSn,
        masterFirmware: discovery.masterFirmware,
        slaveFirmware: discovery.slaveFirmware,
        currentPower: discovery.data.currentPower,
        dailyProduction: discovery.data.dailyProduction,
        totalProduction: discovery.data.totalProduction,
      };
    },
  });

  if (auth) {
    probes.push({
      label: "HTTP /js/status.js (with configured auth)",
      target: `http://${ip}:80/js/status.js`,
      runner: async () => {
        const api = new OmnikHttpApi({ address: ip, auth, timeoutMs: PER_PROBE_TIMEOUT_MS });
        const discovery = await api.discover();
        return {
          inverterName: discovery.inverterName,
          model: discovery.model,
          wifiStickSn: discovery.wifiStickSn,
          masterFirmware: discovery.masterFirmware,
          slaveFirmware: discovery.slaveFirmware,
          currentPower: discovery.data.currentPower,
          dailyProduction: discovery.data.dailyProduction,
          totalProduction: discovery.data.totalProduction,
        };
      },
    });
  } else {
    probes.push({
      label: "HTTP /js/status.js (admin/admin default)",
      target: `http://${ip}:80/js/status.js`,
      runner: async () => {
        const api = new OmnikHttpApi({
          address: ip,
          auth: { user: "admin", password: "admin" },
          timeoutMs: PER_PROBE_TIMEOUT_MS,
        });
        const discovery = await api.discover();
        return {
          inverterName: discovery.inverterName,
          model: discovery.model,
          wifiStickSn: discovery.wifiStickSn,
          masterFirmware: discovery.masterFirmware,
          slaveFirmware: discovery.slaveFirmware,
          currentPower: discovery.data.currentPower,
          dailyProduction: discovery.data.dailyProduction,
          totalProduction: discovery.data.totalProduction,
        };
      },
    });
  }

  if (wifiSn && wifiSn > 0) {
    probes.push({
      label: `TCP binary protocol (S/N ${wifiSn})`,
      target: `tcp://${ip}:8899 (0x68 frame)`,
      runner: async () => {
        const api = new OmnikLocalApi({ address: ip, wifiSn, timeoutMs: PER_PROBE_TIMEOUT_MS });
        return await api.getData();
      },
    });
    probes.push({
      label: `TCP raw frame capture (S/N ${wifiSn})`,
      target: `tcp://${ip}:8899 (raw bytes)`,
      runner: async () => captureRawTcpFrame(ip, wifiSn, PER_PROBE_TIMEOUT_MS),
    });
  } else {
    probes.push({
      label: "TCP binary protocol",
      target: `tcp://${ip}:8899`,
      runner: async () => {
        throw new Error("No WiFi-stick S/N known — cannot build the binary request frame. Run the HTTP probe first or supply a serial number manually.");
      },
    });
  }

  return Promise.all(probes.map((p) => runProbe(p.label, p.target, p.runner)));
}

async function probeTcpReachable(
  ip: string,
  port: number,
  timeoutMs: number,
): Promise<{ open: boolean; errorCode?: string }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (result: { open: boolean; errorCode?: string }) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish({ open: true }));
    socket.once("timeout", () => finish({ open: false, errorCode: "ETIMEDOUT" }));
    socket.once("error", (err: NodeJS.ErrnoException) => finish({ open: false, errorCode: err.code ?? err.message }));
    socket.connect(port, ip);
  });
}

async function captureRawTcpFrame(
  ip: string,
  wifiSn: number,
  timeoutMs: number,
): Promise<{ bytesReceived: number; hexPreview: string; parsable: boolean; parseError?: string; parsed?: InverterData }> {
  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      fn();
    };
    socket.setTimeout(timeoutMs);
    socket.on("data", (chunk: Buffer) => settle(() => resolve(chunk)));
    socket.on("timeout", () => settle(() => reject(new Error("TCP read timed out"))));
    socket.on("error", (err) => settle(() => reject(err)));
    socket.on("ready", () => {
      try {
        socket.write(OmnikProtocol.buildRequest(wifiSn));
      } catch (err) {
        settle(() => reject(err));
      }
    });
    socket.connect(8899, ip);
  });

  const hex = buffer.toString("hex");
  const preview = hex.length > 200 ? `${hex.slice(0, 200)}…` : hex;
  try {
    const parsed = OmnikProtocol.parseResponse(buffer);
    return { bytesReceived: buffer.length, hexPreview: preview, parsable: true, parsed };
  } catch (err) {
    return {
      bytesReceived: buffer.length,
      hexPreview: preview,
      parsable: false,
      parseError: (err as Error).message,
    };
  }
}

async function runProbe(label: string, target: string, runner: ProbeRunner): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const result = await withTimeout(runner(), PER_PROBE_TIMEOUT_MS + 500);
    return {
      label,
      target,
      status: "ok",
      durationMs: Date.now() - started,
      responseSummary: summariseResponse(result),
      responseRaw: result,
    };
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    return {
      label,
      target,
      status: "fail",
      durationMs: Date.now() - started,
      statusCode: e.statusCode,
      errorName: e.name,
      errorMessage: e.code ? `${e.code}: ${e.message}` : e.message,
    };
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Probe timeout after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function summariseResponse(value: unknown): string {
  if (value == null) return String(value);
  let json: string;
  try {
    json = JSON.stringify(value);
  } catch {
    return "<unserialisable>";
  }
  if (json.length <= RESPONSE_PREVIEW_LENGTH) return json;
  return `${json.slice(0, RESPONSE_PREVIEW_LENGTH)}… (truncated, ${json.length} chars)`;
}

export function renderMarkdown(report: DiagnosticReport): string {
  const lines: string[] = [];
  const scopeHeader = report.scope === "paired-device"
    ? `paired device "${report.scopeTarget}"`
    : `IP address \`${report.scopeTarget}\` (no paired device)`;
  lines.push("# Omnik diagnostic report");
  lines.push("");
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- App version: ${report.appVersion}`);
  if (report.homeyFirmwareVersion) lines.push(`- Homey firmware: ${report.homeyFirmwareVersion}`);
  if (report.homeyPlatform) lines.push(`- Homey platform: ${report.homeyPlatform}`);
  lines.push(`- Scope: ${scopeHeader}`);
  lines.push("");

  if (report.device) {
    const device = report.device;
    lines.push("## Device snapshot");
    lines.push("");
    lines.push(`- Name: ${device.name}`);
    lines.push(`- Data id (WiFi-stick S/N): ${device.id}`);
    lines.push(`- Available: ${device.available ? "yes" : "no"}`);
    lines.push("");
    lines.push("### Settings");
    lines.push("```json");
    lines.push(JSON.stringify(device.settings, null, 2));
    lines.push("```");
    lines.push("");
    if (Object.keys(device.store).length > 0) {
      lines.push("### Store");
      lines.push("```json");
      lines.push(JSON.stringify(device.store, null, 2));
      lines.push("```");
      lines.push("");
    }
    const stateful = device.capabilities.filter((c) => c.value !== null && c.value !== undefined);
    const stateless = device.capabilities.filter((c) => c.value === null || c.value === undefined);
    lines.push(`### Capabilities (${device.capabilities.length} total, ${stateful.length} with state)`);
    for (const cap of stateful) {
      lines.push(`- \`${cap.id}\` = ${JSON.stringify(cap.value)}`);
    }
    if (stateless.length > 0) {
      lines.push("");
      lines.push(`<details><summary>${stateless.length} stateless capabilities</summary>`);
      lines.push("");
      lines.push(stateless.map((c) => `\`${c.id}\``).join(", "));
      lines.push("");
      lines.push("</details>");
    }
    lines.push("");
  }

  if (report.network) {
    lines.push("## Network");
    lines.push("");
    lines.push(`- Configured IP: \`${report.network.ip}\``);
    if (report.network.arpMac) {
      lines.push(`- ARP-resolved MAC: \`${report.network.arpMac}\``);
    } else if (report.network.arpError) {
      lines.push(`- ARP lookup failed: ${report.network.arpError}`);
    } else {
      lines.push(`- ARP lookup: no MAC found (inverter may be powered off or on a different subnet)`);
    }
    lines.push("");
  }

  lines.push("## Probes");
  lines.push("");
  lines.push("| Result | Probe | Target | Status | Time | Summary |");
  lines.push("|---|---|---|---|---|---|");
  for (const p of report.probes) {
    const result = p.status === "ok" ? "✅" : p.status === "skipped" ? "⏭" : "❌";
    const status = p.status === "ok" ? "ok" : `${p.statusCode ?? ""} ${p.errorName ?? ""}`.trim() || "fail";
    const time = p.durationMs != null ? `${p.durationMs} ms` : "-";
    const summary = p.status === "ok"
      ? truncateForTable(p.responseSummary ?? "")
      : truncateForTable(p.errorMessage ?? "");
    lines.push(`| ${result} | ${p.label} | \`${p.target}\` | ${status} | ${time} | ${summary} |`);
  }
  lines.push("");

  lines.push("## Raw probe data (JSON)");
  lines.push("");
  lines.push("<details><summary>Click to expand</summary>");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.probes.map(stripRaw), null, 2));
  lines.push("```");
  lines.push("");
  lines.push("</details>");

  return lines.join("\n");
}

function truncateForTable(text: string): string {
  const cleaned = text.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
  return cleaned.length > 80 ? `${cleaned.slice(0, 80)}…` : cleaned;
}

function stripRaw(p: ProbeResult): ProbeResult {
  const { responseRaw: _, ...rest } = p;
  return rest;
}
