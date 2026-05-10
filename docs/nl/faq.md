# FAQ & probleemoplossing

## Algemeen

### Heeft deze app een cloud-account nodig?
Nee. De app leest direct van de WiFi-module op je lokale netwerk. Geen Solarman-account, geen port-forwarding, niets verlaat je netwerk.

### Hoe vaak polleert de app de omvormer?
Elke 5 minuten standaard. Aanpasbaar via *Apparaat-instellingen → Controle-interval* (minimum 1 minuut). Polleer niet te agressief - sommige Omnik-modules crashen als je ze hard aanpakt.

### Wat is het verschil tussen *Totale energie* en *Vandaag*?
- **Totale energie** (`meter_power`) is de cumulatieve kWh die de omvormer ooit heeft geproduceerd. Gaat alleen omhoog. Dit is wat Homey Energy en Insights-maandtotalen gebruiken.
- **Vandaag** (`meter_power.daily`) reset naar 0 om middernacht. Gebruik het voor dagsamenvattingen en "is vandaag meer dan gisteren"-vergelijkingen.

### Mijn spanning en temperatuur tonen "-"
Je apparaat staat in HTTP-modus en de webinterface van de omvormer levert die waarden niet. Ofwel schakel naar TCP via *Instellingen → Protocol* als je omvormer dat ondersteunt, ofwel accepteer dat die capabilities niet beschikbaar zijn - geen waardes is beter dan verouderde waardes.

## Koppelproblemen

### "Kon geen verbinding maken met de Omnik-omvormer"
- Verifieer of het IP-adres klopt (`ping <ip>` vanaf een computer op hetzelfde netwerk)
- Check of de omvormer aan staat (panelen hebben licht nodig - 's nachts schakelt de omvormer vaak ook zijn WiFi uit)
- Als het IP regelmatig verandert: stel een vast IP in via je router

### "Authenticatie vereist"
De webinterface van de omvormer is met wachtwoord beveiligd. De app toont een scherm voor gebruikersnaam en wachtwoord - beide voor-ingevuld met de fabrieksdefault `admin` / `admin` (voor de NS-serie is het `admin` / `500005`). Werken de defaults niet, dan zijn de gegevens ooit gewijzigd; je moet ze achterhalen of de WiFi-module resetten.

### "Onverwachte reactie van uw Omnik-omvormer"
De webinterface is bereikbaar maar `/js/status.js` heeft geen bruikbare payload. De app stuurt je naar het handmatige S/N-invoer-scherm - typ daar het S/N van de sticker (op de externe stick als je die hebt, anders op de omvormer zelf). De app probeert vervolgens TCP, wat vaak werkt voor oudere firmwares.

### Auto-detect heeft een verkeerd S/N gevonden
Open *Apparaat-instellingen*, wijzig het *WiFi-module S/N*-veld, sla op. De polling hervat meteen met de nieuwe waarde.

## Runtime-problemen

### Mijn omvormer is 's nachts uit - is dat een probleem?
Nee. Vanaf v1.2 blijft de app beschikbaar en rapporteert 0 W als de omvormer inactief is. Flows die afhankelijk zijn van *Wekt stroom op* zien dan de false-tak, maar het apparaat zelf gaat niet onbeschikbaar.

### Mijn apparaat toont een uitroepteken
De app kon de omvormer twee opeenvolgende polls niet bereiken. Oorzaken:
- WiFi-module is herstart (gebeurt af en toe - herstelt meestal binnen minuten)
- IP is veranderd (stel een vast IP in)
- TCP-only module blokkeert poort 8899 - probeer naar HTTP te wisselen

### Mijn waardes blijven hangen op hetzelfde getal
- Check de device-log via `homey app log` - verandert de *Inverter response*-regel elke cyclus?
- Als de waardes echt niet veranderen, kan de omvormer een eigen cache-window hebben - verhoog het polling-interval naar 5 of 10 minuten

### Hoe meld ik een bug?
Deel je model en het S/N-prefix, plus eventuele foutmelding, op [GitHub](https://github.com/lucasvdh/codes.lucasvdh.omnik/issues) of in de [Homey community-thread](https://community.homey.app/t/app-pro-omnik/94499).

## Compatibiliteit

### Werkt dit met Hosola / iGEN / Bosswerk-omvormers?
Hosola en vergelijkbare modules (prefixes `611`, `617`, `504`) gebruiken dezelfde protocol-familie. Werkt waarschijnlijk - probeer te koppelen. De app accepteert nu elk numeriek S/N, met een waarschuwing als je prefix niet in de geverifieerde lijst staat.

### Werkt dit met nieuwere Solarman v5 ethernet-loggers?
Nee. Die gebruiken een compleet ander protocol (Modbus RTU over Solarman v5-frames). Gebruik de aparte **Solarman**-app uit de Homey App Store.

### Werken oude Omnik-portal accounts nog?
Het Omnik-portaal is na het faillissement van de fabrikant in 2021 stopgezet. Deze app gebruikt het portaal niet - alleen je lokale WiFi-netwerk.
