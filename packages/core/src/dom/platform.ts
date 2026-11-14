/**
 * Platform reads take a window, which is the point: they can only be called from
 * an effect, never from `connect` or `initialState`. A `navigator` sniff during
 * render is exactly how an SSR hydration mismatch is born (CDC §5.3).
 */

interface UserAgentData {
  readonly platform?: string;
  readonly brands?: readonly { readonly brand: string }[];
}

function platformOf(win: Window): string {
  const nav = win.navigator as Navigator & { userAgentData?: UserAgentData };
  return nav.userAgentData?.platform ?? nav.platform ?? "";
}

function userAgentOf(win: Window): string {
  return win.navigator.userAgent ?? "";
}

export function isMac(win: Window): boolean {
  return /^Mac/i.test(platformOf(win));
}

export function isIos(win: Window): boolean {
  // iPadOS reports as a Mac; the touch points are what give it away.
  return (
    /iPhone|iPad|iPod/i.test(platformOf(win)) || (isMac(win) && win.navigator.maxTouchPoints > 1)
  );
}

export function isApple(win: Window): boolean {
  return isMac(win) || isIos(win);
}

export function isFirefox(win: Window): boolean {
  return /firefox/i.test(userAgentOf(win));
}

export function isSafari(win: Window): boolean {
  const ua = userAgentOf(win);
  return /^((?!chrome|android).)*safari/i.test(ua);
}

/**
 * The same signal the tokens layer uses to pick the touch density, so the machine
 * and the stylesheet can never disagree about which one is active.
 */
export function isCoarsePointer(win: Window): boolean {
  return win.matchMedia("(pointer: coarse)").matches;
}

export function prefersReducedMotion(win: Window): boolean {
  return win.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function supportsPointerEvents(win: Window): boolean {
  return "PointerEvent" in win;
}
