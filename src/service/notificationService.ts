import { API_CONFIG } from './apiConfig';

export interface CustomNotificationPayload {
  title: string;
  body: string;
}

export interface CustomNotificationResponse {
  success: boolean;
  message?: string;
  data?: any;
}

export async function sendCustomNotification(
  deviceToken: string,
  payload: CustomNotificationPayload
): Promise<CustomNotificationResponse> {
  const url = `${API_CONFIG.proxyUrl}/swap/1inch/customNotification`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-auth-device-token': deviceToken,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Sending notification failed: ${response.statusText}`);
  }

  return response.json();
}