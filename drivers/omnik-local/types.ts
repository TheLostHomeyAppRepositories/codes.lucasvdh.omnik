export interface DeviceData {
  id: number;
}

export interface NewSettings {
  ip?: string | null;
  interval?: number | null;
}

export interface SettingsInput {
  newSettings: NewSettings;
  changedKeys: Array<string>;
}

export interface DeviceSettings {
  ip: string;
  interval: number;
}

export interface Device {
  name: string;
  data: DeviceData;
  settings: DeviceSettings;
}
