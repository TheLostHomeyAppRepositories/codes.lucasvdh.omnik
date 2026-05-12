# Generating a diagnostic report

When something doesn't work and you want to report it, please attach a
diagnostic report. It captures the inverter's HTTP and TCP responses, the
app's cached state, and the result of every probe we run, so we can triage
without a back-and-forth asking for details.

There are two ways to generate one. Pick whichever matches your situation.

## Option A: in the Homey app (recommended)

Open the Homey mobile or web app, go to
**More** → **Apps** → **Omnik** → **Configure app**. There are two tabs:

**Paired device**: use this when the inverter is paired with Homey, even
if it's currently misbehaving or marked unavailable.

1. Pick the inverter from the dropdown.
2. Click **Generate report**. Takes about five seconds.
3. Click **Copy to clipboard** and paste into a
   [new GitHub issue](https://github.com/lucasvdh/codes.lucasvdh.omnik/issues/new).

**By IP address**: use this when the inverter won't pair, so there's
nothing to pick from the dropdown. We probe HTTP `/js/status.js` (with
no auth and with the `admin/admin` default) and the raw TCP/8899 port.
The binary protocol can only be probed in full once the WiFi-stick S/N
is known — if HTTP discovers it, we'll automatically continue with TCP.

1. Switch to the **By IP address** tab.
2. Enter the inverter's IP address.
3. Click **Probe IP**, then **Copy to clipboard** and paste into a
   [new GitHub issue](https://github.com/lucasvdh/codes.lucasvdh.omnik/issues/new).

## Option B: standalone script (no Homey required)

Use this if you can't get to the Homey app for some reason, or if you want
to probe an inverter that Homey can't reach but your computer can.
You'll need Node.js 18 or newer installed on your computer. The computer
needs to be on the same Wi-Fi/LAN as the inverter.

1. [Install Node.js](https://nodejs.org) if you don't have it. The LTS
   version is fine.
2. Download
   [`scripts/diagnose.mjs`](scripts/diagnose.mjs) from this repository.
3. Open a terminal in the folder where you saved it.
4. Run:
   ```
   node diagnose.mjs <inverter-ip>
   ```
   For example: `node diagnose.mjs 192.168.1.42`

   If HTTP returns 401 / requires auth, pass credentials:
   ```
   node diagnose.mjs 192.168.1.42 --user admin --pass admin
   ```

   To also exercise the binary TCP/8899 protocol, supply the WiFi-stick
   S/N (the 10-digit number on the dongle sticker — usually starts with
   `160`, `161`, `604` or `646`):
   ```
   node diagnose.mjs 192.168.1.42 --sn 1604123456
   ```
   If HTTP succeeds the script auto-discovers the S/N and runs the TCP
   probe without `--sn`.
5. Copy the entire output and paste it into a
   [new GitHub issue](https://github.com/lucasvdh/codes.lucasvdh.omnik/issues/new).

You can also write it to a file with `node diagnose.mjs 192.168.1.42 > report.md`
and attach the file instead.

## What's in the report

- **Identification**: inverter name, model, master/slave firmware, WiFi
  module firmware, MAC and (where available) WiFi-stick S/N.
- **Device snapshot** (option A only): the settings and store values the
  app has cached, plus the current value of every capability.
- **Probe results**: TCP/8899 port reachability, the binary 0x68 frame
  (if S/N known), HTTP `/js/status.js` with and without auth, each with
  HTTP status, response time and a preview of the body.
- **Raw JSON appendix**: a machine-parseable copy of everything above.

## Privacy

The report contains your inverter's local IP address, MAC address and
serial number. These are only useful on your home network, so there's
no security risk to sharing them publicly. We left them in by default
because they help us reproduce networking edge cases. If you'd rather
strip them, just edit the text after pasting.

The HTTP password is **automatically redacted** before the report is
rendered. The WiFi-stick S/N is included because it's needed to construct
the TCP request frame; an attacker on your LAN can already discover it
from `/js/status.js` so it isn't a secret in practice.
