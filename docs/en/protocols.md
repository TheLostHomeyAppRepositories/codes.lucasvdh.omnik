# How the app reads data (TCP vs HTTP)

Omnik WiFi modules expose two ways to get data from the inverter, and this app supports both.

## TCP (binary protocol on port 8899)

The original way Omnik sticks were designed to talk. The app sends a small request frame and the stick replies with a single binary payload containing all the live values.

**What you get over TCP:**
- Current AC power
- AC voltage
- AC frequency
- Inverter temperature
- Today's production (kWh)
- Lifetime cumulative production (kWh)

## HTTP (`/js/status.js`)

The same WiFi module also runs a small web server. The app fetches `/js/status.js` and parses the embedded JavaScript variables.

**What you get over HTTP:**
- Current AC power
- Today's production (kWh)
- Lifetime cumulative production (kWh)
- Inverter model name & firmware versions

**What's missing in HTTP mode:**
- AC voltage and temperature aren't in the HTTP payload - those capabilities show "-" instead of stale values

## How the app picks one

During pairing the app tries both:

1. First HTTP, to read the WiFi module's serial number (so you don't have to type it)
2. Then TCP with that serial number - TCP wins if it works, because it has more data
3. If TCP fails (no response, wrong checksum, etc.), the app sticks with HTTP

The chosen protocol is saved in the device's settings.

## Switching protocols later

Open the device → *Settings*. Under *Omnik inverter* you'll see a *Protocol* dropdown. Change it to TCP or HTTP and save - the app rebuilds the connection on the next poll without restarting.

If you switch to HTTP and your inverter requires authentication, fill in the username and password under the *HTTP authentication* group below.

## When to override

You generally don't need to. The auto-selection picks the best one. Manual override is useful if:

- Your inverter starts blocking TCP after a firmware update - switch to HTTP
- Your network setup blocks port 8899 but allows port 80
- You want to debug why a particular protocol is failing
