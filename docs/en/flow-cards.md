# Flow cards & automations

The app exposes Flow cards so you can react to changes in your solar production.

## Triggers (When…)

| Card | Fires when |
| --- | --- |
| **Production started** | Power transitions from 0 W to >0 W (sunrise, cloud passes) - exposes a `power` token |
| **Production stopped** | Power transitions from >0 W to 0 W (sunset, cloud cover) |
| **Today's production changed** | The today-kWh value changes between polls |
| **The power changed** | `measure_power` changes |
| **Total energy changed** | `meter_power` changes |
| **Frequency changed** | `measure_frequency` changes |
| Voltage / temperature changed | The capability changes |

## Conditions (And…)

| Card | True when |
| --- | --- |
| **Is producing power** | Current power > 0 W |
| **Power is above** | Current power > the value you specify (W) |
| **Today's production is above** | Today's kWh > the value you specify |

## Useful automations

**Charge the EV when the sun comes up:**
> When *Production started* on Omnik → start charging session

**Run the dishwasher only on solar power:**
> When time is 12:00 → if *Power is above 1500 W* → start dishwasher

**Notify when the system goes idle for the night:**
> When *Production stopped* on Omnik → send push "Solar finished - total today: \[meter_power.daily] kWh"

**Frequency alarm (rare grid issues):**
> When *Frequency changed* → if *Frequency below 49.8 Hz or above 50.2 Hz* → send notification

## Tokens

The *Production started* trigger provides a `power` token (the actual wattage at the moment production started), which you can use in subsequent flow steps - useful for branching ("only charge the EV if production is at least 1 kW").
