/**
 * The handshake between a modal surface's focus trap and the child layers it
 * owns, for one Tab.
 *
 * The trap prevents a Tab that would carry the focus out of both in capture,
 * before any listener can stop the event from reaching it — and a prevented
 * event is one `proxyTabFocus` otherwise leaves alone. So the trap marks the
 * prevention as its own, and a child layer that then places the focus itself
 * claims the key, which tells the trap not to step on a second time.
 */

const held = new WeakSet<Event>();
const claimed = new WeakSet<Event>();

export function holdTab(event: KeyboardEvent): void {
  held.add(event);
  event.preventDefault();
}

export function isHeldTab(event: KeyboardEvent): boolean {
  return held.has(event);
}

export function claimTab(event: KeyboardEvent): void {
  claimed.add(event);
}

export function isClaimedTab(event: KeyboardEvent): boolean {
  return claimed.has(event);
}
