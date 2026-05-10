# Omnik for Homey

Read your Omnik solar inverter directly from your Homey, without a cloud account.

## What the app does

- **Live monitoring** - current power, today's production, lifetime kWh, AC voltage, grid frequency, and inverter temperature
- **Homey Energy integration** - lifetime kWh feeds Insights and the Energy tab correctly
- **Flow automations** - react when production starts or stops, or when output crosses a threshold
- **Two ways to read your inverter** - direct binary protocol on TCP/8899 (preferred) or an HTTP fallback for inverters that don't support TCP

## Supported hardware

The app talks to the WiFi module of your Omnik inverter - an external WiFi stick on most models, built into the inverter on TL2 and some others. Look at the sticker (on the stick if external, on the inverter if built-in) for the serial number; the first digits tell you whether it's likely to work:

| WiFi-module serial number prefix | Status |
| --- | --- |
| `160`, `161`, `604`, `646` | ✅ Confirmed working |
| `602`–`606`, `611`/`617`, `504` | ⚠️ Same protocol family, likely works |
| `601` | ❌ Cloud-only, no local API |
| Newer Solarman v5 / Ethernet sticks | ❌ Different protocol - use the dedicated Solarman app |

If your prefix isn't listed, the app will still try - it's not blocked. Pairing succeeds when your inverter actually responds.

## Quick links

- [Adding your inverter](pairing.md)
- [How the app reads data (TCP vs HTTP)](protocols.md)
- [Flow cards & automations](flow-cards.md)
- [FAQ & troubleshooting](faq.md)
