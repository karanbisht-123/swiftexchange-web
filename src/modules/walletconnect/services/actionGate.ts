let lastUserGestureAt = 0;

const GESTURE_WINDOW_MS = 10000;

function markGesture() {
  lastUserGestureAt = Date.now();
}

if (typeof window !== 'undefined') {
  ['pointerdown', 'keydown'].forEach(evt => {
    window.addEventListener(evt, markGesture, { capture: true });
  });
}

export function hasRecentUserGesture(): boolean {
  return Date.now() - lastUserGestureAt < GESTURE_WINDOW_MS;
}

export function assertUserGesture(): void {
  if (!hasRecentUserGesture()) {
    throw new Error('GESTURE_REQUIRED');
  }
}
