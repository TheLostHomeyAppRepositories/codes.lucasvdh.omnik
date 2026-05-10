# Hoe de app data leest (TCP vs HTTP)

Omnik WiFi-modules bieden twee manieren om data uit de omvormer te halen, en deze app ondersteunt beide.

## TCP (binair protocol op poort 8899)

De originele manier waarop Omnik-sticks zijn ontworpen om te communiceren. De app stuurt een klein verzoekframe en de stick antwoordt met één binaire payload met alle live-waarden.

**Wat je via TCP krijgt:**
- Actueel AC-vermogen
- AC-spanning
- Netfrequentie
- Omvormer-temperatuur
- Productie van vandaag (kWh)
- Cumulatieve lifetime productie (kWh)

## HTTP (`/js/status.js`)

Dezelfde WiFi-module draait ook een kleine webserver. De app haalt `/js/status.js` op en parseert de JavaScript-variabelen daarin.

**Wat je via HTTP krijgt:**
- Actueel AC-vermogen
- Productie van vandaag (kWh)
- Cumulatieve lifetime productie (kWh)
- Modelnaam en firmware-versies van de omvormer

**Wat ontbreekt in HTTP-modus:**
- AC-spanning en temperatuur zitten niet in de HTTP-payload - die capabilities tonen "-" in plaats van verouderde waarden

## Hoe de app kiest

Tijdens het koppelen probeert de app beide:

1. Eerst HTTP, om het serienummer van de WiFi-module op te halen (zodat jij het niet hoeft in te tikken)
2. Vervolgens TCP met dat serienummer - TCP wint als het werkt, want het levert meer data op
3. Als TCP faalt (geen respons, foute checksum, etc.), blijft de app op HTTP

Het gekozen protocol wordt opgeslagen in de apparaat-instellingen.

## Achteraf van protocol wisselen

Open het apparaat → *Instellingen*. Onder *Omnik-omvormer* zie je een *Protocol*-dropdown. Wijzig naar TCP of HTTP en sla op - de app bouwt de verbinding bij de eerstvolgende poll opnieuw op, zonder herstart.

Schakel je naar HTTP en vereist je omvormer authenticatie? Vul dan onder *HTTP-authenticatie* de gebruikersnaam en het wachtwoord in.

## Wanneer wil je handmatig kiezen?

Meestal niet - de auto-keuze pakt de beste op. Handmatig overschrijven is nuttig als:

- Je omvormer TCP blokkeert na een firmware-update - schakel naar HTTP
- Je netwerk poort 8899 blokkeert maar poort 80 toelaat
- Je wilt debuggen waarom een specifiek protocol faalt
