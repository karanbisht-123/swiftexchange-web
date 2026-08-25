import { useSyncExternalStore } from 'react';

export const MOBILE_BREAKPOINT = 768;

function subscribeMobile(breakpoint: number) {
    return (cb: () => void) => {
        const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
        mq.addEventListener('change', cb);
        return () => mq.removeEventListener('change', cb);
    };
}

function getMobileSnapshot(breakpoint: number) {
    return () => window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches;
}

const subscribeMobileBound = subscribeMobile(MOBILE_BREAKPOINT);
const getMobileSnapshotBound = getMobileSnapshot(MOBILE_BREAKPOINT);
const getServerSnapshot = () => false;

export function useIsMobile(): boolean {
    return useSyncExternalStore(
        subscribeMobileBound,
        getMobileSnapshotBound,
        getServerSnapshot
    );
}
