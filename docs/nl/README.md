# Omnik voor Homey

Lees je Omnik-omvormer rechtstreeks uit met je Homey, zonder cloud-account.

## Wat doet de app

- **Live monitoring** - actueel vermogen, productie van vandaag, lifetime kWh, AC-spanning, netfrequentie en omvormer-temperatuur
- **Homey Energy-integratie** - lifetime kWh wordt correct opgenomen in Insights en de Energie-tab
- **Flow-automatiseringen** - reageer wanneer productie start of stopt, of wanneer het vermogen een drempel passeert
- **Twee uitleesmethodes** - direct binair protocol op TCP/8899 (voorkeur) of HTTP-fallback voor omvormers die TCP niet ondersteunen

## Ondersteunde hardware

De app praat met de WiFi-module van je Omnik-omvormer - bij de meeste modellen een externe WiFi-stick, bij de TL2-serie en sommige andere is die ingebouwd in de omvormer. Op de sticker (op de stick als die los is, of op de omvormer als de module ingebouwd is) staat het serienummer; de eerste cijfers vertellen of het waarschijnlijk werkt:

| Prefix WiFi-module serienummer | Status |
| --- | --- |
| `160`, `161`, `604`, `646` | ✅ Bevestigd werkend |
| `602`–`606`, `611`/`617`, `504` | ⚠️ Zelfde protocol-familie, werkt waarschijnlijk |
| `601` | ❌ Cloud-only, geen lokale API |
| Nieuwere Solarman v5 / Ethernet-sticks | ❌ Ander protocol - gebruik de aparte Solarman-app |

Staat je prefix er niet bij? De app probeert het toch - er wordt niet geblokkeerd. Als je omvormer reageert, lukt het koppelen.

## Snelle links

- [Apparaat toevoegen](pairing.md)
- [Hoe de app data leest (TCP vs HTTP)](protocols.md)
- [Flow-kaarten & automatiseringen](flow-cards.md)
- [FAQ & probleemoplossing](faq.md)
