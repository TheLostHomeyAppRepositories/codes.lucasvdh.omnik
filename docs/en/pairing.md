# Adding your inverter

The pair flow is fully automatic in the common case - you only need the IP address of your inverter's WiFi module.

## Step 1 - find the IP address

The WiFi module connects to your home network like any other device. Find its IP in:

- Your router's DHCP / "connected devices" page
- The Omnik app on your phone (if you set it up there originally)
- A network scanner like Fing

Tip: assign a fixed IP in your router so it doesn't change.

## Step 2 - start pairing in Homey

In the Homey app: *+ Add device* → *Omnik* → *Omnik inverter*.

Enter the IP and tap *Next*. The app then:

1. Reads `/js/status.js` from the inverter to discover the WiFi-module serial number automatically
2. Tries the binary TCP/8899 protocol with that serial number (preferred - it gives more data)
3. Falls back to HTTP for runtime data if TCP doesn't respond
4. Shows you the live readings on a confirmation screen so you can verify before adding

## If the inverter web interface is password-protected

The factory default is `admin` / `admin` - both fields come pre-filled, just tap *Continue*. If those don't work the credentials have been changed at some point (rare); you'll need the values they were set to, or you can factory-reset the WiFi module to restore the defaults.

## If auto-detect can't find your inverter

Some older firmwares don't have `/js/status.js` (you'd see a 404). The app then offers a *manual S/N entry* screen:

1. Find the sticker with the 10-digit serial number. On most models it's on the WiFi stick that plugs into the inverter - but the TL2 series and some others have the WiFi module **built in**, in which case the sticker is on the inverter itself.
2. The number usually starts with `160`, `161`, `604` or `646`.
3. The app skips HTTP and tries TCP directly with that S/N.

## After pairing

The device appears in your Homey with all capabilities. The first reading shows up within seconds; afterwards the app polls every 5 minutes by default. You can change the interval in *Device settings → Check interval*.
