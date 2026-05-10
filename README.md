# Omnik Solar Panels - Homey App

A [Homey](https://homey.app) app that talks directly to Omnik solar inverters over your local network - no cloud, no Solarman account, no scraping a website. The inverter speaks; Homey listens.

This repo continues where [DiedB's Homey-SolarPanels](https://github.com/DiedB/Homey-SolarPanels) left off after Omnik was dropped from that app following the manufacturer's bankruptcy in 2021. Most of the protocol know-how comes from the open-source community - see [credits](#credits) below.

## What you get

- Real-time **AC power** (W), **AC voltage** (V), and inverter **temperature** (°C)
- **Today's production** (`meter_power.daily`, kWh) and **lifetime cumulative production** (`meter_power`, kWh) - the latter feeds Homey Energy and Insights correctly
- **Flow cards**:
  - Trigger: *Today's production changed*
  - Conditions: *Is producing power*, *Power is above X W*, *Today's production is above Y kWh*
- Transient TCP errors (WiFi hiccups) are retried before declaring the device offline

## Hardware support

The app speaks the legacy `0x68`-framed binary protocol on TCP port **8899** that Omnik's WiFi module exposes locally (an external WiFi stick on most models, built into the inverter on TL2 and some others).

**Confirmed working** (WiFi-module serial number prefixes): `160`, `161`, `604`, `646`.

**Likely to work** (same protocol family, not exhaustively tested): `602`–`606`, `611`/`617` (Hosola-branded), `504` (iGEN). The pairing flow accepts *any* numeric serial number; you get a non-blocking warning if your prefix isn't in the verified list.

**Won't work**:

- WiFi modules starting with `601` - those are cloud-only and don't respond to direct TCP
- Newer ethernet/Solarman v5 logger sticks - different protocol (Modbus RTU embedded in v5 frames) which this app does not yet implement
- Models that only expose data over HTTP (e.g. Omniksol 2500TL - HTML-only, 2000TL2 - JSON-only) - an HTTP fallback is on the roadmap

If pairing fails on your inverter, please open an issue with your model name and serial number prefix so we can extend support.

## Pairing

1. Find the **WiFi module's IP address** in your router's DHCP table or in the inverter's WiFi configuration page
2. (Auto-detected during pairing, but if needed manually:) find the **WiFi-module serial number** on a sticker. On most models it's on the external WiFi stick; on TL2-series and other models with a built-in WiFi module the sticker is on the inverter itself. Usually 10 digits starting with `160`/`161`/`604`/`646`.
3. In Homey, add a new device → Omnik → enter the IP. The S/N is read from the inverter automatically; only fill it in manually if auto-detect can't reach `/js/status.js`.
4. The default polling interval is 5 minutes; you can lower it in the device's advanced settings.

## Development

Targets **Node.js v22** (matches the Homey Pro runtime). Standard Homey app layout — `app.json` is generated from `.homeycompose/` and the per-driver `driver.compose.json` files; don't edit it directly.

```bash
npm install
homey app run            # builds + installs in dev mode
```

### Debug scripts

`scripts/` contains live-probe tools that talk to a real inverter on your LAN. Excluded from the published app bundle (see `.homeyignore`); useful when adding support for a new model:

```bash
npm run build

# Dump raw protocol response and parsed values from TCP/8899
node .homeybuild/scripts/probe-inverter.js <ip> <wifi-stick-sn>

# Probe the HTTP web interface (auth optional)
node .homeybuild/scripts/probe-webinterface.js <ip> [user] [password]
```

## Credits

- [DiedB/Homey-SolarPanels](https://github.com/DiedB/Homey-SolarPanels) - the original integration
- [Woutrrr/Omnik-Data-Logger](https://github.com/Woutrrr/Omnik-Data-Logger) - protocol reverse-engineering, especially the `InverterMsg.py` byte-offset map (E-Total at offset 71, etc.)
- [klaasnicolaas/python-omnikinverter](https://github.com/klaasnicolaas/python-omnikinverter) and [robbinjanssen/home-assistant-omnik-inverter](https://github.com/robbinjanssen/home-assistant-omnik-inverter) - Home Assistant integrations that documented model/datasource compatibility

## License

GPL-3.0 - see [LICENSE](./LICENSE).
