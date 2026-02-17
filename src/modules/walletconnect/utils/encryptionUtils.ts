const ENCRYPTION_KEY = import.meta.env.VITE_ENCRYPTION_KEY;

interface EncryptedData {
    iv: string;
    ciphertext: string;
}

async function getEncryptionKey(): Promise<CryptoKey> {
    if (!ENCRYPTION_KEY) {
        throw new Error('Encryption key not configured');
    }

    const keyBuffer = hexToBuffer(ENCRYPTION_KEY);

    return await crypto.subtle.importKey(
        'raw',
        keyBuffer.buffer as ArrayBuffer,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

function hexToBuffer(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
}

function bufferToHex(buffer: Uint8Array): string {
    return Array.from(buffer)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

export async function encryptMnemonic(mnemonic: string): Promise<string> {
    try {
        const key = await getEncryptionKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoder = new TextEncoder();
        const data = encoder.encode(mnemonic);

        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            data
        );

        const encrypted: EncryptedData = {
            iv: bufferToHex(iv),
            ciphertext: bufferToHex(new Uint8Array(ciphertext)),
        };

        return JSON.stringify(encrypted);
    } catch (error) {
        throw new Error('Encryption failed');
    }
}

export async function decryptMnemonic(encryptedData: string): Promise<string> {
    try {
        const key = await getEncryptionKey();
        const { iv, ciphertext }: EncryptedData = JSON.parse(encryptedData);

        const ivBuffer = hexToBuffer(iv);
        const ciphertextBuffer = hexToBuffer(ciphertext);

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: ivBuffer as any },
            key,
            ciphertextBuffer as BufferSource
        );

        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    } catch (error) {
        throw new Error('Decryption failed');
    }
}
