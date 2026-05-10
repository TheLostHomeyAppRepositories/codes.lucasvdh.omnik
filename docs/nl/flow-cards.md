# Flow-kaarten & automatiseringen

De app levert Flow-kaarten waarmee je kunt reageren op veranderingen in je zonneproductie.

## Triggers (Wanneer…)

| Kaart | Wordt geactiveerd wanneer |
| --- | --- |
| **Productie gestart** | Vermogen gaat van 0 W naar >0 W (zonsopgang, wolk verdwijnt) - biedt een `power`-token |
| **Productie gestopt** | Vermogen gaat van >0 W naar 0 W (zonsondergang, wolkendek) |
| **Productie van vandaag is veranderd** | De today-kWh-waarde verandert tussen polls |
| **Het vermogen is veranderd** | `measure_power` verandert |
| **Totale energie is veranderd** | `meter_power` verandert |
| **Frequentie is veranderd** | `measure_frequency` verandert |
| Spanning / temperatuur veranderd | De capability verandert |

## Condities (En…)

| Kaart | Waar wanneer |
| --- | --- |
| **Wekt stroom op** | Huidig vermogen > 0 W |
| **Vermogen is hoger dan** | Huidig vermogen > de opgegeven waarde (W) |
| **Productie van vandaag is hoger dan** | Vandaag-kWh > de opgegeven waarde |

## Handige automatiseringen

**Laad de EV op als de zon opkomt:**
> Wanneer *Productie gestart* op Omnik → start oplaadsessie

**Vaatwasser alleen op zonne-energie:**
> Wanneer tijd 12:00 is → als *Vermogen is hoger dan 1500 W* → start vaatwasser

**Stuur melding als systeem voor de nacht stopt:**
> Wanneer *Productie gestopt* op Omnik → stuur push "Zon klaar - totaal vandaag: \[meter_power.daily] kWh"

**Frequentie-alarm (zeldzame netproblemen):**
> Wanneer *Frequentie is veranderd* → als *Frequentie lager dan 49.8 Hz of hoger dan 50.2 Hz* → stuur melding

## Tokens

De *Productie gestart*-trigger biedt een `power`-token (het feitelijke vermogen op het moment dat productie begon), bruikbaar in vervolgstappen - handig voor branching ("alleen EV laden als productie minimaal 1 kW is").
