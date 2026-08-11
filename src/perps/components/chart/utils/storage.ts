import { useCallback, useMemo, useState } from 'react';

export function debounce<T extends (...args: any[]) => void>(
    fn: T,
    wait: number
): T {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return ((...args: any[]) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    }) as T;
}

export const strBool = {
    s: (v: boolean) => String(v),
    d: (s: string) => s === 'true',
};

export const strString = {
    s: (v: string) => v,
    d: (s: string) => s,
};

export const strJson = {
    s: (v: any) => JSON.stringify(v),
    d: (s: string) => JSON.parse(s),
};

export function useDebouncedLocalStorage<T>(
    key: string,
    defaultValue: T,
    serialize: (v: T) => string,
    deserialize: (s: string) => T,
    wait = 400
): [T, (v: T | ((prev: T) => T)) => void] {
    const [value, setValue] = useState<T>(() => {
        try {
            const saved = localStorage.getItem(key);
            return saved !== null ? deserialize(saved) : defaultValue;
        } catch {
            return defaultValue;
        }
    });
    const debouncedWrite = useMemo(
        () =>
            debounce((v: T) => {
                try {
                    localStorage.setItem(key, serialize(v));
                } catch {
                    /* ignore quota / privacy errors */
                }
            }, wait),
        [key, serialize, deserialize, wait]
    );

    const set = useCallback(
        (v: T | ((prev: T) => T)) => {
            setValue(prev => {
                const next =
                    typeof v === 'function' ? (v as (p: T) => T)(prev) : v;
                debouncedWrite(next);
                return next;
            });
        },
        [debouncedWrite]
    );

    return [value, set];
}

export function readLocalStorage<T>(
    key: string,
    deserialize: (s: string) => T,
    defaultValue: T
): T {
    try {
        const saved = localStorage.getItem(key);
        return saved !== null ? deserialize(saved) : defaultValue;
    } catch {
        return defaultValue;
    }
}

export function writeLocalStorage(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        /* ignore */
    }
}
