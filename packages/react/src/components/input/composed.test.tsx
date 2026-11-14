/**
 * What the composed input owes beyond the markup its rows already pin: the dev
 * warning that stands in for what the discriminated union in `composed.tsx`
 * cannot catch — a `type` read from a variable, which is plain `string` to the
 * compiler, or a plain-JS caller with no type checker in the loop at all.
 * `composed.parity.tsx` proves the markup; this proves the guard rail behind it.
 */

import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Input } from "./composed";

describe("the composed input's reveal label", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("warns when a computed `type` lands on password with no revealLabel — the case the union cannot narrow", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // Annotated `string` on purpose: a literal `"password"` here would be exactly
    // what `composed.tsx`'s union already refuses at compile time, so this is the
    // one shape the type system lets through.
    const type: string = "password";

    renderToString(<Input id="p" type={type} />);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("revealLabel");
  });

  it("warns on an explicit empty string the way `Dialog.closeLabel` treats it as absent", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    renderToString(<Input id="p" type="password" revealLabel="" />);

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("stays silent once revealLabel is given", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    renderToString(<Input id="p" type="password" revealLabel="Show password" />);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("stays silent on a plain field with no password type at all", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    renderToString(<Input id="p" />);

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
