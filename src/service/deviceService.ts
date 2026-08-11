import { API_CONFIG } from './apiConfig';

export interface DeviceRegistrationPayload {
  brand: string;
  model: string;
  type: string;
  uniqueId: string;
  macAddress: string;
  fcmToken: string;
}

export interface DeviceRegistrationResponse {
  deviceToken: any;
  success: boolean;
  message?: string;
  token?: string;
  data?: {
    deviceToken?: string;
    [key: string]: any;
  };
}

export async function registerDevice(
  payload: DeviceRegistrationPayload
): Promise<DeviceRegistrationResponse> {
  const url = `${API_CONFIG.serverUrl}/device`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Device registration failed: ${response.statusText}`);
  }

  return response.json();
}
