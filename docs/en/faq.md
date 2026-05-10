# FAQ & troubleshooting

## General

### Does this app need a cloud account?
No. It reads directly from the WiFi module on your local network. No Solarman account, no port forwarding, nothing leaves your network.

### How often does the app poll the inverter?
Every 5 minutes by default. You can change this under *Device settings → Check interval* (minimum 1 minute). Don't poll too aggressively - some Omnik modules crash if you hammer them.

### What's the difference between *Total energy* and *Today*?
- **Total energy** (`meter_power`) is the cumulative kWh ever produced by the inverter. It only goes up. This is what feeds Homey Energy and Insights monthly totals.
- **Today** (`meter_power.daily`) resets to 0 every midnight. Use it for daily summaries and "did we produce more than yesterday" comparisons.

### My voltage and temperature show "-"
Your device is in HTTP mode and the inverter's web interface doesn't expose those values. Either switch to TCP under *Settings → Protocol* if your inverter supports it, or accept that those capabilities aren't available - no values is better than stale ones.

## Pairing problems

### "Could not reach the Omnik inverter"
- Verify the IP address is correct (`ping <ip>` from a computer on the same network)
- Check the inverter is on (panels need light - at night the inverter often shuts down its WiFi)
- If the IP changes regularly, set a fixed IP in your router

### "Authentication required"
The inverter's web interface is password-protected. The app shows a screen for username and password - both pre-filled with the factory default `admin` / `admin` (for the NS series it's `admin` / `500005`). If the defaults don't work the credentials have been changed at some point; you'll need to find them or factory-reset the WiFi module.

### "Unexpected response from your Omnik inverter"
The web interface reachable but `/js/status.js` doesn't have a usable payload. The app sends you to the manual S/N entry screen - type the WiFi module S/N from the sticker (on the external stick if you have one, otherwise on the inverter itself). The app then tries TCP, which often works for older firmware.

### Auto-detect found a wrong S/N
Open *Device settings*, edit the *WiFi module S/N* field, save. The polling resumes immediately with the new value.

## Runtime problems

### My inverter is offline at night - is that a problem?
No. From v1.2 onwards the app stays available and reports 0 W when the inverter is idle. Flows that depend on `Is producing power` will see the false branch, but the device itself doesn't go unavailable.

### My device shows an exclamation mark
The app couldn't reach the inverter for two consecutive polls. Causes:
- WiFi module rebooted (it does this occasionally - usually recovers within minutes)
- IP changed (set a fixed IP)
- TCP-only module blocked port 8899 - try switching to HTTP

### My values look stuck on the same number
- Check the device-log via `homey app log` - does the *Inverter response* line update each cycle?
- If the values genuinely don't change, the inverter may have its own caching window - try increasing the polling interval to 5 or 10 minutes

### How do I report a bug?
Please share your model and the S/N prefix, plus any error message you see, on [GitHub](https://github.com/lucasvdh/codes.lucasvdh.omnik/issues) or in the [Homey community thread](https://community.homey.app/t/app-pro-omnik/94499).

## Compatibility

### Does this work with Hosola / iGEN / Bosswerk inverters?
Hosola and similar modules (prefixes `611`, `617`, `504`) use the same protocol family. They probably work - try pairing. The app accepts any numeric S/N now, with a warning if your prefix isn't in the verified list.

### Does this work with newer Solarman v5 ethernet loggers?
No. Those use a completely different protocol (Modbus RTU over Solarman v5 frames). Use the dedicated **Solarman** app from the Homey App Store.

### Will old Omnik portal accounts still work?
The Omnik portal was discontinued after the manufacturer went bankrupt in 2021. This app doesn't use the portal at all - only your local WiFi network.
