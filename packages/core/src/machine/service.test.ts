import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReactivityRoot, type ReactivityRoot } from "../reactivity";
import { createMachine } from "./create-machine";
import { createService } from "./service";
import type { MachineSchema, Service } from "./types";

interface FixtureProps {
  readonly pressed?: boolean | undefined;
  readonly defaultPressed?: boolean | undefined;
  readonly disabled: boolean;
  readonly onPressedChange?: ((pressed: boolean) => void) | undefined;
  readonly log: string[];
}

interface FixtureSchema extends MachineSchema {
  state: "off" | "on";
  tag: "active";
  props: FixtureProps;
  context: { pressed: boolean };
  refs: { clicks: number };
  computed: { label: string };
  event: { type: "TRIGGER.CLICK" } | { type: "PRESSED.SET"; pressed: boolean };
  action: "togglePressed" | "setPressed" | "countClick" | "logEntry" | "logExit" | "logTransition";
  guard: "isEnabled";
  effect: "trackOuter" | "trackInner";
}

const fixture = createMachine<FixtureSchema>({
  props({ props }) {
    return { disabled: false, log: [], ...props };
  },

  context({ prop, bindable }) {
    return {
      pressed: bindable<boolean>(() => ({
        defaultValue: prop("defaultPressed") ?? false,
        value: prop("pressed"),
        onChange: (pressed) => prop("onPressedChange")?.(pressed),
        debugLabel: "pressed",
      })),
    };
  },

  refs() {
    return { clicks: 0 };
  },

  computed: {
    label: ({ context }) => (context.get("pressed") ? "on" : "off"),
  },

  watch({ track, context, prop }) {
    track(
      () => [context.get("pressed")],
      () => prop("log").push(`watch:${context.get("pressed")}`),
    );
  },

  initialState({ prop }) {
    return (prop("pressed") ?? prop("defaultPressed")) === true ? "on" : "off";
  },

  states: {
    off: {
      on: {
        "TRIGGER.CLICK": {
          target: "on",
          guard: "isEnabled",
          actions: ["countClick", "togglePressed", "logTransition"],
        },
        "PRESSED.SET": {
          target: "on",
          guard: ({ event }) => event.type === "PRESSED.SET" && event.pressed,
          actions: ["setPressed"],
        },
      },
    },
    on: {
      tags: ["active"],
      entry: ["logEntry"],
      exit: ["logExit"],
      effects: ["trackOuter", "trackInner"],
      on: {
        "TRIGGER.CLICK": {
          target: "off",
          guard: "isEnabled",
          actions: ["countClick", "togglePressed"],
        },
      },
    },
  },

  implementations: {
    guards: {
      isEnabled: ({ prop }) => !prop("disabled"),
    },
    actions: {
      togglePressed({ context }) {
        context.set("pressed", (prev) => !prev);
      },
      setPressed({ context, event }) {
        if (event.type === "PRESSED.SET") context.set("pressed", event.pressed);
      },
      countClick({ refs }) {
        refs.set("clicks", refs.get("clicks") + 1);
      },
      logEntry({ prop }) {
        prop("log").push("entry:on");
      },
      logExit({ prop }) {
        prop("log").push("exit:on");
      },
      logTransition({ prop }) {
        prop("log").push("transition");
      },
    },
    effects: {
      trackOuter({ prop }) {
        prop("log").push("effect:outer");
        return () => prop("log").push("cleanup:outer");
      },
      trackInner({ prop }) {
        prop("log").push("effect:inner");
        return () => prop("log").push("cleanup:inner");
      },
    },
  },
});

function setup(props: Partial<FixtureProps> = {}): {
  service: Service<FixtureSchema>;
  root: ReactivityRoot;
  log: string[];
} {
  const log = props.log ?? [];
  const current = { disabled: false, ...props, log };
  const root = createReactivityRoot();
  const service = createService(fixture, root.adapter, {
    id: "x1",
    props: () => current,
  });
  return { service, root, log };
}

describe("createService", () => {
  it("resolves the initial state from props without running anything", () => {
    const { service, log } = setup({ defaultPressed: true });

    expect(service.state.get()).toBe("on");
    expect(service.status()).toBe("not-started");
    expect(log).toEqual([]);
  });

  it("merges machine prop defaults with the ones passed in", () => {
    const { service } = setup();

    expect(service.prop("disabled")).toBe(false);
  });

  it("installs state effects and entry actions on start, in order", () => {
    const { service, log } = setup({ defaultPressed: true });
    service.start();

    expect(log).toEqual(["effect:outer", "effect:inner", "entry:on"]);
    expect(service.status()).toBe("started");
  });

  it("runs exit, transition and entry actions in that order", () => {
    const { service, log } = setup();
    service.start();
    log.length = 0;

    service.send({ type: "TRIGGER.CLICK" });

    expect(service.state.get()).toBe("on");
    expect(log).toEqual(["transition", "effect:outer", "effect:inner", "entry:on", "watch:true"]);
  });

  it("tears effects down in reverse order when leaving a state", () => {
    const { service, log } = setup({ defaultPressed: true });
    service.start();
    log.length = 0;

    service.send({ type: "TRIGGER.CLICK" });

    expect(service.state.get()).toBe("off");
    expect(log).toEqual(["cleanup:inner", "cleanup:outer", "exit:on", "watch:false"]);
  });

  it("holds events sent before start and delivers them on start", () => {
    const { service } = setup();
    service.send({ type: "TRIGGER.CLICK" });

    expect(service.state.get()).toBe("off");

    service.start();
    expect(service.state.get()).toBe("on");
  });

  it("ignores a blocked transition when the guard fails", () => {
    const { service } = setup({ disabled: true });
    service.start();

    service.send({ type: "TRIGGER.CLICK" });

    expect(service.state.get()).toBe("off");
    expect(service.context.get("pressed")).toBe(false);
  });

  it("supports inline guard functions reading the event", () => {
    const { service } = setup();
    service.start();

    service.send({ type: "PRESSED.SET", pressed: false });
    expect(service.state.get()).toBe("off");

    service.send({ type: "PRESSED.SET", pressed: true });
    expect(service.state.get()).toBe("on");
    expect(service.context.get("pressed")).toBe(true);
  });

  it("exposes tags of the current state", () => {
    const { service } = setup({ defaultPressed: true });
    service.start();

    expect(service.state.hasTag("active")).toBe(true);
    service.send({ type: "TRIGGER.CLICK" });
    expect(service.state.hasTag("active")).toBe(false);
  });

  it("keeps refs out of the reactive graph", () => {
    const { service } = setup();
    service.start();

    service.send({ type: "TRIGGER.CLICK" });
    service.send({ type: "TRIGGER.CLICK" });

    expect(service.refs.get("clicks")).toBe(2);
  });

  it("computes derived values from live context", () => {
    const { service } = setup();
    service.start();

    expect(service.computed("label")).toBe("off");
    service.send({ type: "TRIGGER.CLICK" });
    expect(service.computed("label")).toBe("on");
  });

  it("records the previous state and event", () => {
    const { service } = setup();
    service.start();
    service.send({ type: "TRIGGER.CLICK" });

    expect(service.state.previous()).toBe("off");
    expect(service.event.current()).toEqual({ type: "TRIGGER.CLICK" });
  });

  it("is symmetric across stop and start, the way StrictMode remounts", () => {
    const { service, log } = setup({ defaultPressed: true });

    service.start();
    service.start();
    expect(log).toEqual(["effect:outer", "effect:inner", "entry:on"]);

    log.length = 0;
    service.stop();
    service.stop();
    expect(log).toEqual(["cleanup:inner", "cleanup:outer"]);
    expect(service.status()).toBe("stopped");

    log.length = 0;
    service.start();
    expect(log).toEqual(["effect:outer", "effect:inner", "entry:on"]);
    expect(service.state.get()).toBe("on");
  });

  it("drops events sent after stop", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { service } = setup();
    service.start();
    service.stop();

    service.send({ type: "TRIGGER.CLICK" });

    expect(service.state.get()).toBe("off");
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("throws on an action the implementations do not declare", () => {
    const broken = createMachine<FixtureSchema>({
      ...fixture,
      states: {
        off: { on: { "TRIGGER.CLICK": { target: "on", actions: ["togglePressed"] } } },
        on: {},
      },
      implementations: { guards: fixture.implementations?.guards ?? { isEnabled: () => true } },
    });
    const root = createReactivityRoot();
    const service = createService(broken, root.adapter, {
      id: "x2",
      props: () => ({ disabled: false, log: [] }),
    });
    service.start();

    expect(() => service.send({ type: "TRIGGER.CLICK" })).toThrow(/unknown action "togglePressed"/);
  });

  it("disposes the service when the reactivity root is torn down", () => {
    const { service, root, log } = setup({ defaultPressed: true });
    service.start();
    log.length = 0;

    root.dispose();

    expect(log).toEqual(["cleanup:inner", "cleanup:outer"]);
    expect(service.status()).toBe("stopped");
  });
});

describe("createService — controlled context", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("never writes its own value when the prop is present", () => {
    const onPressedChange = vi.fn();
    const { service } = setup({ pressed: false, onPressedChange });
    service.start();

    service.send({ type: "TRIGGER.CLICK" });

    expect(onPressedChange).toHaveBeenCalledWith(true);
    expect(service.context.get("pressed")).toBe(false);
    warn.mockRestore();
  });

  it("writes and reports when uncontrolled", () => {
    const onPressedChange = vi.fn();
    const { service } = setup({ onPressedChange });
    service.start();

    service.send({ type: "TRIGGER.CLICK" });

    expect(onPressedChange).toHaveBeenCalledWith(true);
    expect(service.context.get("pressed")).toBe(true);
    warn.mockRestore();
  });

  it("warns once when a bindable flips between controlled and uncontrolled", () => {
    // A fresh object per call, the way every adapter hands props down — the memo
    // in front of `props()` is keyed on identity.
    let pressed: boolean | undefined = false;
    const root = createReactivityRoot();
    const service = createService(fixture, root.adapter, {
      id: "x3",
      props: () => ({ disabled: false, log: [], pressed }),
    });
    service.start();

    pressed = undefined;
    service.context.get("pressed");
    service.context.get("pressed");

    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain("controlled to uncontrolled");
    warn.mockRestore();
  });
});
