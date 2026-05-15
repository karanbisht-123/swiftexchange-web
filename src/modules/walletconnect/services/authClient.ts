import { WALLETCONNECT_PROJECT_ID, WALLETCONNECT_METADATA } from '../config/chains'

let signClientInstance: any = null

export async function getSignClient(): Promise<any> {
  if (signClientInstance) return signClientInstance
  const { default: SignClient } = await import('@walletconnect/sign-client')
  signClientInstance = await SignClient.init({
    projectId: WALLETCONNECT_PROJECT_ID,
    metadata: WALLETCONNECT_METADATA,
  })
  return signClientInstance
}

export async function fetchNonce(_address?: string): Promise<string> {
  return Math.random().toString(36).substring(2, 10)
}

export async function verifyAndGetJWT(_params: {
  message: string
  signature: string
  address: string
}): Promise<string | null> {
  return null
}

export function storeJWT(jwt: string): void {
  if (!jwt) return
  localStorage.setItem('swiftex_jwt', jwt)
}

export function getJWT(): string | null {
  return localStorage.getItem('swiftex_jwt')
}

export function clearJWT(): void {
  localStorage.removeItem('swiftex_jwt')
}
