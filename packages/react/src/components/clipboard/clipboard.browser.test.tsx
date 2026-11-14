/**
 * The adapter's half: six parts rendered, the composition point honoured, the
 * controlled value obeyed, and axe clean on the two shapes a consumer ships —
 * a labelled field with a composed trigger, and an icon-only trigger named by
 * `copyLabel`.
 *
 * `navigator.clipboard` is stubbed as an own property on the instance, the same
 * arrangement the core's browser test uses: the three-engine matrix must never
 * depend on a real clipboard permission.
 *
 * `copyLabel` sits on the root, not on the trigger: it is a machine prop, and a
 * part has no way to reach the machine its root owns. A consumer who prefers to
 * name the button on the button writes `aria-label` there — the consumer's value
 * wins in `mergeProps`, so both spellings land.
 */

import { getLiveAnnouncer } from "@standarui/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  expectNoAxeViolations,
  fire,
  mount,
  queryPart,
  queryParts,
  unmountAll,
  waitFor,
} from "../../render-harness";
import { ButtonRoot } from "../button";
import {
  ClipboardControl,
  ClipboardIndicator,
  ClipboardInput,
  ClipboardLabel,
  ClipboardRoot,
  ClipboardTrigger,
  useClipboard,
} from "./clipboard";

const restores: VoidFunction[] = [];

function stubClipboard(writeText: (text: string) => Promise<void>): void {
  const target = window.navigator as Navigator & Record<string, unknown>;
  Object.defineProperty(target, "clipboard", { value: { writeText }, configurable: true });
  restores.push(() => Reflect.deleteProperty(target, "clipboard"));
}

function part<T extends HTMLElement = HTMLElement>(container: HTMLElement, name: string): T {
  const node = queryPart<T>(container, name);
  if (node === null) throw new Error(`the clipboard rendered no "${name}"`);
  return node;
}

const VALUE = "https://example.com/install.sh";

const CopyIcon = (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
    <path d="M5.5 5.5h8v8h-8z" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const CheckIcon = (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
    <path d="M3 8.5l3.5 3.5L13 4.5" fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
);

function Indicators() {
  return (
    <>
      <ClipboardIndicator>{CopyIcon}</ClipboardIndicator>
      <ClipboardIndicator copied>{CheckIcon}</ClipboardIndicator>
    </>
  );
}

function Demo() {
  return (
    <ClipboardRoot defaultValue={VALUE} copyLabel="Copy the install script">
      <ClipboardLabel>Install script</ClipboardLabel>
      <ClipboardControl>
        <ClipboardInput />
        <ClipboardTrigger render={<ButtonRoot variant="gray" />}>
          <Indicators />
        </ClipboardTrigger>
      </ClipboardControl>
    </ClipboardRoot>
  );
}

afterEach(() => {
  unmountAll();
  for (const restore of restores.splice(0, restores.length)) restore();
  getLiveAnnouncer(document).destroy();
});

describe("ClipboardRoot", () => {
  it("renders all six parts, the indicator twice", () => {
    const { container } = mount(<Demo />);

    expect(part(container, "root").getAttribute("data-state")).toBe("idle");
    expect(part<HTMLLabelElement>(container, "label").htmlFor).toBe(part(container, "input").id);
    expect(part(container, "control").getAttribute("data-part")).toBe("clipboard:control");
    expect(part<HTMLInputElement>(container, "input").readOnly).toBe(true);
    expect(part<HTMLButtonElement>(container, "trigger").getAttribute("type")).toBe("button");
    expect(part(container, "trigger").getAttribute("aria-label")).toBe("Copy the install script");
    expect(queryParts(container, "indicator")).toHaveLength(2);
  });

  it("keeps both identities on the composed trigger", () => {
    const { container } = mount(<Demo />);

    const tokens = (part(container, "trigger").getAttribute("data-part") ?? "").split(" ");
    expect(tokens).toContain("clipboard:trigger");
    expect(tokens).toContain("button:root");
  });

  it("copies on a click and swaps the indicator pair", async () => {
    const written: string[] = [];
    stubClipboard((text) => {
      written.push(text);
      return Promise.resolve();
    });
    const onCopiedChange = vi.fn();
    const { container } = mount(
      <ClipboardRoot defaultValue="hello" onCopiedChange={onCopiedChange} copyLabel="Copy">
        <ClipboardTrigger>
          <Indicators />
        </ClipboardTrigger>
      </ClipboardRoot>,
    );

    expect(queryParts(container, "indicator")[0]?.hidden).toBe(false);
    expect(queryParts(container, "indicator")[1]?.hidden).toBe(true);

    fire(() => part(container, "trigger").click());
    expect(written).toEqual(["hello"]);

    await waitFor(() => {
      expect(part(container, "root").getAttribute("data-copied")).toBe("");
    });
    expect(onCopiedChange).toHaveBeenCalledWith({ copied: true });
    expect(queryParts(container, "indicator")[0]?.hidden).toBe(true);
    expect(queryParts(container, "indicator")[1]?.hidden).toBe(false);
  });

  it("stays controlled: the consumer owns the value", () => {
    const onValueChange = vi.fn();
    const view = (value: string) => (
      <ClipboardRoot value={value} onValueChange={onValueChange} copyLabel="Copy">
        <ClipboardInput />
        <ClipboardTrigger>Copy</ClipboardTrigger>
      </ClipboardRoot>
    );
    const handle = mount(view("first"));

    expect(part<HTMLInputElement>(handle.container, "input").value).toBe("first");

    handle.render(view("second"));
    expect(part<HTMLInputElement>(handle.container, "input").value).toBe("second");
  });

  it("hands the same api to a consumer placing the props themselves", () => {
    const seen: { value?: string; copied?: boolean } = {};

    function Hooked() {
      const api = useClipboard({ defaultValue: "from the hook" });
      seen.value = api.value;
      seen.copied = api.copied;
      return <div {...api.getRootProps()} />;
    }

    const { container } = mount(<Hooked />);

    expect(seen).toEqual({ value: "from the hook", copied: false });
    expect(part(container, "root").getAttribute("data-state")).toBe("idle");
  });

  it("selects the whole value when the input takes focus", () => {
    const { container } = mount(<Demo />);
    const input = part<HTMLInputElement>(container, "input");

    fire(() => input.focus());

    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(VALUE.length);
  });

  it("passes axe as a labelled field, icon-only, and while copied", async () => {
    stubClipboard(() => Promise.resolve());
    const handle = mount(
      <main>
        <Demo />
        <ClipboardRoot defaultValue="npm i" copyLabel="Copy the command">
          <ClipboardTrigger>
            <Indicators />
          </ClipboardTrigger>
        </ClipboardRoot>
      </main>,
    );

    await expectNoAxeViolations(handle.container);

    // Qualified on purpose. `queryParts` matches a bare name against every
    // `scope:name` token, and the composed trigger in `Demo` carries
    // `button:root` — so `queryParts(…, "root")[1]` is that button, not the
    // second clipboard. Asking for `clipboard:root` is the only spelling that
    // means what it says once a part is composed onto a Button.
    const roots = queryParts(handle.container, "clipboard:root");
    expect(roots).toHaveLength(2);

    const iconOnly = queryParts(handle.container, "trigger")[1];
    expect(roots[1]?.contains(iconOnly ?? null)).toBe(true);

    fire(() => iconOnly?.click());
    await waitFor(() => {
      expect(roots[1]?.getAttribute("data-copied")).toBe("");
    });

    await expectNoAxeViolations(handle.container);
  });
});
