#!/usr/bin/env node
/**
 * Standalone Omnik diagnostic — for use when the inverter is not yet paired
 * with Homey (the in-app diagnostic needs a paired device or the in-app probe-
 * by-IP form).
 *
 * Usage:
 *   node scripts/diagnose.mjs <ip>                       # HTTP only
 *   node scripts/diagnose.mjs <ip> --sn <wifi-stick-sn>  # HTTP + TCP binary probe
 *   node scripts/diagnose.mjs <ip> --user admin --pass admin
 *
 * The WiFi-stick S/N is the 10-digit number printed on the sticker of the
 * external WiFi dongle, or shown on the inverter's web UI under "Status →
 * Wireless info → m2mMid". It's required for the TCP/8899 probe because it
 * is used to construct the binary request frame.
 *
 * Prints a Markdown report to stdout — pipe to a file with `> report.md` or
 * copy/paste the output into a GitHub issue.
 *
 * Requires Node 18+ (uses built-in fetch). No npm install needed.
 */

import { argv, exit } from "node:process";
import net from "node:net";

const HTTP_TIMEOUT_MS = 8000;
const TCP_TIMEOUT_MS = 8000;
const PREVIEW_LENGTH = 600;

function parseArgs(argv) {
  const positional = [];
  const opts = { user: undefined, pass: undefined, sn: undefined };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--user" || a === "-u") opts.user = argv[++i];
    else if (a === "--pass" || a === "-p") opts.pass = argv[++i];
    else if (a === "--sn" || a === "-s") opts.sn = argv[++i];
    else if (a === "--help" || a === "-h") {
      printUsage();
      exit(0);
    } else positional.push(a);
  }
  return { ip: positional[0], ...opts };
}

function printUsage() {
  console.error("Usage: node scripts/diagnose.mjs <ip> [--sn <wifi-stick-sn>] [--user <user> --pass <pass>]");
  console.error("");
  console.error("Examples:");
  console.error("  node scripts/diagnose.mjs 192.168.1.42");
  console.error("  node scripts/diagnose.mjs 192.168.1.42 --sn 1604123456");
  console.error("  node scripts/diagnose.mjs 192.168.1.42 --user admin --pass admin");
}

async function probeHttp(label, ip, auth) {
  const started = Date.now();
  const url = `http://${ip}/js/status.js`;
  const result = { label, target: url, status: "fail", durationMs: 0 };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const headers = { Accept: "text/javascript, */*;q=0.5" };
    if (auth) {
      const token = Buffer.from(`${auth.user}:${auth.pass}`).toString("base64");
      headers["Authorization"] = `Basic ${token}`;
    }
    const response = await fetch(url, { method: "GET", signal: controller.signal, headers });
    result.durationMs = Date.now() - started;
    result.statusCode = response.status;
    const body = await response.text();
    result.bodyPreview = body.length > PREVIEW_LENGTH ? body.slice(0, PREVIEW_LENGTH) + "…" : body;
    if (response.status === 401) {
      result.status = "http_error";
      result.errorMessage = "401 Unauthorized — try --user admin --pass admin";
      return result;
    }
    if (response.status < 200 || response.status >= 300) {
      result.status = "http_error";
      result.errorMessage = `HTTP ${response.status}`;
      return result;
    }
    const parsed = parseStatusJs(body);
    result.parsed = parsed;
    result.status = "ok";
  } catch (err) {
    result.durationMs = Date.now() - started;
    result.errorName = err.name;
    result.errorMessage = err.message;
    result.errorCode = err.cause?.code ?? err.code;
  } finally {
    clearTimeout(timer);
  }
  return result;
}

function parseStatusJs(body) {
  const meta = {
    m2mMid: matchVar(body, "m2mMid"),
    version: matchVar(body, "version"),
    wlanMac: matchVar(body, "wlanMac"),
  };
  // Original firmware exposes a `webData` variable; newer firmware (issue #1,
  // omnik5000tl2 with WiFi firmware H4.01.51MW) uses `myDeviceArray[0]="..."`.
  // Same field layout — try both.
  const match =
    body.match(/webData\s*=\s*"([^"]*)"/) ??
    body.match(/myDeviceArray\s*\[\s*0\s*\]\s*=\s*"([^"]*)"/);
  const webData = match ? match[1].split(",").map((f) => f.trim()) : [];
  const fieldSource = body.match(/webData\s*=\s*"/)
    ? "webData"
    : body.match(/myDeviceArray\s*\[\s*0\s*\]/)
      ? "myDeviceArray[0]"
      : "none";
  return {
    meta,
    fieldSource,
    webData,
    inverterName: webData[0] ?? "",
    masterFirmware: webData[1] ?? "",
    slaveFirmware: webData[2] ?? "",
    model: webData[3] ?? "",
    currentPower: webData[5] ? Number(webData[5]) : null,
    dailyKwh: webData[6] ? Number(webData[6]) / 100 : null,
    totalKwh: webData[7] ? Number(webData[7]) / 10 : null,
  };
}

function matchVar(body, name) {
  const m = body.match(new RegExp(`var\\s+${name}\\s*=\\s*"([^"]*)"`));
  return m ? m[1] : "";
}

async function probeTcpReachable(ip, port) {
  const started = Date.now();
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const result = { label: `TCP/${port} port reachability`, target: `tcp://${ip}:${port}`, status: "fail", durationMs: 0 };
    let done = false;
    const finish = (status, extra) => {
      if (done) return;
      done = true;
      socket.destroy();
      result.durationMs = Date.now() - started;
      result.status = status;
      Object.assign(result, extra ?? {});
      resolve(result);
    };
    socket.setTimeout(TCP_TIMEOUT_MS);
    socket.once("connect", () => finish("ok", { bodyPreview: "port open" }));
    socket.once("timeout", () => finish("fail", { errorMessage: "connect() timed out", errorCode: "ETIMEDOUT" }));
    socket.once("error", (err) => finish("fail", { errorMessage: err.message, errorCode: err.code }));
    socket.connect(port, ip);
  });
}

function buildOmnikRequest(serialNumber) {
  const buffer = Buffer.alloc(16);
  buffer[0] = 0x68;
  buffer[1] = 0x02;
  buffer[2] = 0x40;
  buffer[3] = 0x30;
  const doubleHex = Number(serialNumber).toString(16).padStart(8, "0").repeat(2);
  for (let i = 0; i < 8; i++) {
    const byte = parseInt(doubleHex.substring((7 - i) * 2, (7 - i) * 2 + 2), 16);
    buffer[4 + i] = byte;
  }
  buffer[12] = 0x01;
  buffer[13] = 0x00;
  let checksum = 115;
  for (let i = 4; i < 12; i++) checksum += buffer[i];
  buffer[14] = checksum & 0xff;
  buffer[15] = 0x16;
  return buffer;
}

function parseOmnikResponse(data) {
  if (data.length < 75) throw new Error(`response too short (${data.length} bytes)`);
  const inverterName = data.subarray(15, 31).toString().replace(/\0+$/, "").trim();
  const phasePowers = [59, 63, 67].map((o) => data.readInt16BE(o)).filter((v) => v > 0);
  const phaseVoltages = [51, 53, 55].map((o) => data.readInt16BE(o)).filter((v) => v > 0);
  const currentPower = phasePowers.reduce((s, v) => s + v, 0);
  const currentVoltage = phaseVoltages.length ? phaseVoltages.reduce((s, v) => s + v, 0) / phaseVoltages.length / 10 : 0;
  const rawFreq = data.readUInt16BE(57);
  const rawDaily = data.readUInt16BE(69);
  const rawTotal = data.readUInt32BE(71);
  const rawTemp = data.readInt16BE(31);
  return {
    inverterName,
    currentPower,
    currentVoltage,
    currentFrequency: rawFreq === 0xffff ? null : rawFreq / 100,
    dailyProduction: rawDaily === 0xffff ? null : rawDaily / 100,
    totalProduction: rawTotal === 0xffffffff ? null : rawTotal / 10,
    currentTemperature: rawTemp === -1 ? null : rawTemp / 10,
  };
}

async function probeTcpBinary(ip, sn) {
  const started = Date.now();
  const result = {
    label: `TCP/8899 binary protocol (S/N ${sn})`,
    target: `tcp://${ip}:8899 (0x68 frame)`,
    status: "fail",
    durationMs: 0,
  };
  try {
    const buffer = await new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let settled = false;
      const settle = (fn) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        fn();
      };
      socket.setTimeout(TCP_TIMEOUT_MS);
      socket.on("data", (chunk) => settle(() => resolve(chunk)));
      socket.on("timeout", () => settle(() => reject(new Error("TCP read timed out"))));
      socket.on("error", (err) => settle(() => reject(err)));
      socket.on("ready", () => {
        try {
          socket.write(buildOmnikRequest(sn));
        } catch (err) {
          settle(() => reject(err));
        }
      });
      socket.connect(8899, ip);
    });
    result.durationMs = Date.now() - started;
    result.bytesReceived = buffer.length;
    result.hexPreview = buffer.toString("hex").slice(0, 200);
    try {
      result.parsed = parseOmnikResponse(buffer);
      result.status = "ok";
    } catch (parseErr) {
      result.status = "fail";
      result.errorMessage = `parse failed: ${parseErr.message}`;
    }
  } catch (err) {
    result.durationMs = Date.now() - started;
    result.errorName = err.name;
    result.errorMessage = err.message;
    result.errorCode = err.code;
  }
  return result;
}

async function main() {
  const args = parseArgs(argv);
  if (!args.ip) {
    printUsage();
    exit(1);
  }
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(args.ip)) {
    console.error(`"${args.ip}" doesn't look like an IPv4 address`);
    exit(1);
  }

  const probes = [];
  probes.push(await probeTcpReachable(args.ip, 8899));
  probes.push(await probeHttp("HTTP /js/status.js (no auth)", args.ip));
  if (args.user || args.pass) {
    probes.push(await probeHttp("HTTP /js/status.js (custom auth)", args.ip, { user: args.user ?? "", pass: args.pass ?? "" }));
  } else {
    probes.push(await probeHttp("HTTP /js/status.js (admin/admin default)", args.ip, { user: "admin", pass: "admin" }));
  }

  // Pick the first HTTP probe that succeeded and yielded an m2mMid (= WiFi S/N).
  const discoveredSn = probes
    .map((p) => p.parsed?.meta?.m2mMid)
    .find((v) => v && /^\d+$/.test(v));
  const sn = args.sn ?? discoveredSn;
  if (sn) {
    probes.push(await probeTcpBinary(args.ip, Number(sn)));
  }

  console.log(renderReport(args.ip, sn, args.sn ? "argument" : discoveredSn ? "HTTP discovery" : null, probes));
}

function renderReport(ip, sn, snSource, probes) {
  const lines = [];
  lines.push("# Omnik standalone diagnostic");
  lines.push("");
  lines.push(`- Target IP: ${ip}`);
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push(`- Node: ${process.version} on ${process.platform}`);
  if (sn) lines.push(`- WiFi-stick S/N: ${sn} (source: ${snSource})`);
  else lines.push(`- WiFi-stick S/N: not provided and not discovered (TCP binary probe skipped)`);
  lines.push("");

  const httpHit = probes.find((p) => p.status === "ok" && p.parsed?.webData?.length);
  if (httpHit) {
    const p = httpHit.parsed;
    lines.push("## Inverter identification (HTTP)");
    lines.push("");
    lines.push(`- Name: ${p.inverterName || "-"}`);
    lines.push(`- Model: ${p.model || "-"}`);
    lines.push(`- Master firmware: ${p.masterFirmware || "-"}`);
    lines.push(`- Slave firmware: ${p.slaveFirmware || "-"}`);
    lines.push(`- m2mMid (WiFi S/N): ${p.meta.m2mMid || "-"}`);
    lines.push(`- WLAN MAC: ${p.meta.wlanMac || "-"}`);
    lines.push(`- Firmware version: ${p.meta.version || "-"}`);
    lines.push(`- Device-fields source: ${p.fieldSource}`);
    lines.push(`- Current power: ${p.currentPower ?? "-"} W`);
    lines.push(`- Today: ${p.dailyKwh ?? "-"} kWh`);
    lines.push(`- Total: ${p.totalKwh ?? "-"} kWh`);
    lines.push("");
  }

  const tcpHit = probes.find((p) => p.target.includes("0x68 frame") && p.status === "ok");
  if (tcpHit) {
    const p = tcpHit.parsed;
    lines.push("## Inverter identification (TCP)");
    lines.push("");
    lines.push(`- Name: ${p.inverterName || "-"}`);
    lines.push(`- Current power: ${p.currentPower} W`);
    lines.push(`- AC voltage (avg): ${p.currentVoltage} V`);
    lines.push(`- Frequency: ${p.currentFrequency ?? "-"} Hz`);
    lines.push(`- Temperature: ${p.currentTemperature ?? "-"} °C`);
    lines.push(`- Today: ${p.dailyProduction ?? "-"} kWh`);
    lines.push(`- Total: ${p.totalProduction ?? "-"} kWh`);
    lines.push("");
  }

  lines.push("## Probes");
  lines.push("");
  lines.push("| Result | Probe | Target | Status | Time | Summary |");
  lines.push("|---|---|---|---|---|---|");
  for (const p of probes) {
    const icon = p.status === "ok" ? "✅" : p.status === "http_error" ? "⚠️" : "❌";
    const codeStr = typeof p.errorCode === "string" ? p.errorCode : undefined;
    const statusText = p.statusCode
      ? `HTTP ${p.statusCode}`
      : p.status === "ok"
        ? "ok"
        : codeStr ?? p.errorName ?? "error";
    const summary = (p.bodyPreview ?? p.hexPreview ?? p.errorMessage ?? "")
      .replace(/\|/g, "\\|")
      .replace(/\n/g, " ");
    const summaryTrunc = summary.length > 80 ? summary.slice(0, 80) + "…" : summary;
    lines.push(`| ${icon} | ${p.label} | \`${p.target}\` | ${statusText} | ${p.durationMs} ms | ${summaryTrunc} |`);
  }
  lines.push("");

  lines.push("## Raw probe data");
  lines.push("");
  lines.push("<details><summary>Click to expand</summary>");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(probes, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("</details>");

  return lines.join("\n");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  exit(2);
});
