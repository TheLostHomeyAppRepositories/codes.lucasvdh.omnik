export type DeviceProtocol = "tcp" | "http";

export interface DeviceData {
  /**
   * Homey's immutable device identity. We use the WiFi-stick S/N as a number
   * (parsed from m2mMid). For HTTP-only setups it's still the m2mMid value
   * — it just isn't sent over the wire.
   */
  id: number;
}

export interface DeviceSettings {
  ip: string;
  interval: number;
  protocol: DeviceProtocol;
  wifi_sn: string;
  http_user: string;
  http_password: string;
}

/** Partial of DeviceSettings — Homey passes only the changed keys' values. */
export type NewSettings = Partial<DeviceSettings>;

export interface SettingsInput {
  newSettings: NewSettings;
  changedKeys: Array<string>;
}

export interface Device {
  name: string;
  data: DeviceData;
  settings: DeviceSettings;
}
