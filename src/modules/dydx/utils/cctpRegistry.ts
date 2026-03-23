//  not in use for now
import { Registry } from '@cosmjs/proto-signing';
import { defaultRegistryTypes } from '@cosmjs/stargate';

function encodeVarint(value: number): Uint8Array {
  const bytes: number[] = [];
  let v = value >>> 0;
  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v);
  return new Uint8Array(bytes);
}

function encodeField(fieldNumber: number, wireType: number): Uint8Array {
  return encodeVarint((fieldNumber << 3) | wireType);
}

function encodeString(fieldNumber: number, value: string): Uint8Array {
  const encoded = new TextEncoder().encode(value);
  return concat(encodeField(fieldNumber, 2), encodeVarint(encoded.length), encoded);
}

function encodeUint32Field(fieldNumber: number, value: number): Uint8Array {
  return concat(encodeField(fieldNumber, 0), encodeVarint(value >>> 0));
}

function encodeBytes(fieldNumber: number, value: Uint8Array): Uint8Array {
  return concat(encodeField(fieldNumber, 2), encodeVarint(value.length), value);
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  const padded = h.length % 2 ? '0' + h : h;
  const bytes = new Uint8Array(padded.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function toBytes(value: string | Uint8Array): Uint8Array {
  if (typeof value === 'string') {
    if (value.startsWith('0x') || /^[0-9a-fA-F]{40,}$/.test(value)) {
      return hexToBytes(value);
    }
    try {
      const binary = atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    } catch {
      return new TextEncoder().encode(value);
    }
  }
  return value;
}

function encodeMsgDepositForBurnWithCaller(value: Record<string, unknown>): Uint8Array {
  const parts: Uint8Array[] = [];

  if (value.from) parts.push(encodeString(1, value.from as string));
  if (value.amount) parts.push(encodeString(2, String(value.amount)));
  if (value.destinationDomain !== undefined) {
    parts.push(encodeUint32Field(3, Number(value.destinationDomain)));
  }
  if (value.mintRecipient) {
    parts.push(encodeBytes(4, toBytes(value.mintRecipient as string | Uint8Array)));
  }
  if (value.burnToken) parts.push(encodeString(5, value.burnToken as string));
  if (value.destinationCaller) {
    parts.push(encodeBytes(6, toBytes(value.destinationCaller as string | Uint8Array)));
  }

  return concat(...parts);
}

function encodeMsgDepositForBurn(value: Record<string, unknown>): Uint8Array {
  const parts: Uint8Array[] = [];

  if (value.from) parts.push(encodeString(1, value.from as string));
  if (value.amount) parts.push(encodeString(2, String(value.amount)));
  if (value.destinationDomain !== undefined) {
    parts.push(encodeUint32Field(3, Number(value.destinationDomain)));
  }
  if (value.mintRecipient) {
    parts.push(encodeBytes(4, toBytes(value.mintRecipient as string | Uint8Array)));
  }
  if (value.burnToken) parts.push(encodeString(5, value.burnToken as string));

  return concat(...parts);
}

function encodeCoin(denom: string, amount: string): Uint8Array {
  return concat(encodeString(1, denom), encodeString(2, amount));
}

function encodeMsgSend(value: Record<string, unknown>): Uint8Array {
  const parts: Uint8Array[] = [];
  const from = (value.fromAddress ?? value.from_address) as string | undefined;
  const to = (value.toAddress ?? value.to_address) as string | undefined;

  if (from) parts.push(encodeString(1, from));
  if (to) parts.push(encodeString(2, to));

  const coins = (value.amount as any[]) || [];
  for (const coin of coins) {
    const coinBytes = encodeCoin(coin.denom, String(coin.amount));
    parts.push(encodeBytes(3, coinBytes));
  }

  return concat(...parts);
}

function encodeMsgTransfer(value: Record<string, unknown>): Uint8Array {
  const parts: Uint8Array[] = [];

  if (value.sourcePort) parts.push(encodeString(1, value.sourcePort as string));
  if (value.sourceChannel) parts.push(encodeString(2, value.sourceChannel as string));

  if (value.token) {
    const t = value.token as any;
    const coinBytes = encodeCoin(t.denom, t.amount);
    parts.push(encodeBytes(3, coinBytes));
  }

  if (value.sender) parts.push(encodeString(4, value.sender as string));
  if (value.receiver) parts.push(encodeString(5, value.receiver as string));

  if (value.timeoutTimestamp) {
    const ts = BigInt(value.timeoutTimestamp as string | number);
    const tsNum = Number(ts);
    parts.push(concat(encodeField(7, 0), encodeVarint(tsNum)));
  }

  if (value.memo) parts.push(encodeString(8, value.memo as string));

  return concat(...parts);
}

export function createCctpRegistry(): Registry {
  const registry = new Registry(defaultRegistryTypes);

  registry.register('/circle.cctp.v1.MsgDepositForBurnWithCaller', {
    encode: (value: any) => ({ finish: () => encodeMsgDepositForBurnWithCaller(value) }),
    decode: () => {
      throw new Error('decode not implemented');
    },
    fromPartial: (v: any) => v,
  } as any);

  registry.register('/circle.cctp.v1.MsgDepositForBurn', {
    encode: (value: any) => ({ finish: () => encodeMsgDepositForBurn(value) }),
    decode: () => {
      throw new Error('decode not implemented');
    },
    fromPartial: (v: any) => v,
  } as any);

  registry.register('/cosmos.bank.v1beta1.MsgSend', {
    encode: (value: any) => ({ finish: () => encodeMsgSend(value) }),
    decode: () => {
      throw new Error('decode not implemented');
    },
    fromPartial: (v: any) => v,
  } as any);

  registry.register('/ibc.applications.transfer.v1.MsgTransfer', {
    encode: (value: any) => ({ finish: () => encodeMsgTransfer(value) }),
    decode: () => {
      throw new Error('decode not implemented');
    },
    fromPartial: (v: any) => v,
  } as any);

  return registry;
}
