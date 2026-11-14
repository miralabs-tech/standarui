import { type CSSProperties, type ReactNode, type Ref, useImperativeHandle } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckboxControl, CheckboxHiddenInput, CheckboxRoot } from "./components/checkbox/checkbox";
import { TabsList, TabsRoot, TabsTrigger } from "./components/tabs/tabs";
import { normalizeProps } from "./normalize-props";
import { fire, mount, queryPart, settle, unmountAll } from "./render-harness";
import { type RenderableProps, useRender } from "./use-render";

interface PartProps extends RenderableProps {
  readonly onClick?: (() => void) | undefined;
  readonly children?: ReactNode;
}

/** A part as the component layer will write one: prop getter in, render out. */
function Part(props: PartProps): ReactNode {
  const { render, asChild, children, onClick } = props;
  return useRender({
    render,
    asChild,
    element: "button",
    props: normalizeProps.button({
      "data-scope": "demo",
      "data-part": "demo:root",
      type: "button",
      class: "sui-part",
      onClick: () => onClick?.(),
    }),
    children,
  });
}

function found(container: HTMLElement): HTMLElement {
  const node = container.querySelector<HTMLElement>('[data-part~="demo:root"]');
  if (node === null) throw new Error("nothing rendered the part");
  return node;
}

afterEach(() => {
  unmountAll();
});

describe("useRender", () => {
  it("renders its default element with the machine's props", () => {
    const { container } = mount(<Part>press</Part>);
    const node = found(container);

    expect(node.tagName).toBe("BUTTON");
    expect(node.className).toBe("sui-part");
    expect(node.textContent).toBe("press");
  });

  it("substitutes the element given to render, keeping both sets of props", () => {
    const { container } = mount(<Part render={<a href="/next" data-mine="yes" />}>go</Part>);
    const node = found(container);

    expect(node.tagName).toBe("A");
    expect(node.getAttribute("href")).toBe("/next");
    expect(node.getAttribute("data-mine")).toBe("yes");
    expect(node.textContent).toBe("go");
  });

  it("lets the substituted element's own children win", () => {
    const { container } = mount(<Part render={<a href="/next">theirs</a>}>ours</Part>);

    expect(found(container).textContent).toBe("theirs");
  });

  it("accepts asChild as the same thing spelled the Radix way", () => {
    const { container } = mount(
      <Part asChild>
        <a href="/next">go</a>
      </Part>,
    );
    const node = found(container);

    expect(node.tagName).toBe("A");
    expect(node.textContent).toBe("go");
  });

  it("hands the props to a render function", () => {
    const { container } = mount(
      <Part render={(props) => <a {...(props as Record<string, unknown>)} href="/next" />}>
        go
      </Part>,
    );

    expect(found(container).tagName).toBe("A");
    expect(found(container).textContent).toBe("go");
  });

  it("runs the consumer's handler first, so preventDefault is a real veto", () => {
    const machine = vi.fn();
    const order: string[] = [];
    const { container } = mount(
      <Part
        onClick={() => {
          order.push("machine");
          machine();
        }}
        render={
          <button
            type="button"
            onClick={(event) => {
              order.push("consumer");
              event.preventDefault();
            }}
          />
        }
      >
        press
      </Part>,
    );

    fire(() => found(container).click());

    // Both ran, the consumer first — the machine's handler is the one that reads
    // `defaultPrevented`, so it has to be the second.
    expect(order).toEqual(["consumer", "machine"]);
  });

  it("accumulates class names instead of dropping one", () => {
    const { container } = mount(<Part render={<button type="button" className="mine" />} />);

    expect(found(container).className).toBe("sui-part mine");
  });
});

interface StyledProps extends RenderableProps {
  readonly machineStyle?: Record<string, string | number | undefined> | undefined;
  readonly style?: CSSProperties | undefined;
  readonly ref?: ((node: HTMLElement | null) => void) | undefined;
  readonly name?: string | undefined;
  readonly children?: ReactNode;
}

function Styled(props: StyledProps): ReactNode {
  const { render, asChild, children, machineStyle, name = "styled", ...elementProps } = props;
  return useRender({
    render,
    asChild,
    element: "div",
    props: normalizeProps.element({ "data-part": `demo:${name}`, style: machineStyle }),
    elementProps,
    children,
  });
}

function camel(property: string): string {
  return property.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function styled(container: HTMLElement, name = "styled"): HTMLElement {
  const node = container.querySelector<HTMLElement>(`[data-part~="demo:${name}"]`);
  if (node === null) throw new Error("nothing rendered the part");
  return node;
}

describe("useRender — core styles are written by the CSSOM", () => {
  it("writes custom and regular properties after mount", () => {
    const { container } = mount(
      <Styled
        machineStyle={{ "--sui-demo": "3", textTransform: "uppercase", "white-space": "nowrap" }}
      />,
    );
    const node = styled(container);

    expect(node.style.getPropertyValue("--sui-demo")).toBe("3");
    expect(node.style.getPropertyValue("text-transform")).toBe("uppercase");
    expect(node.style.getPropertyValue("white-space")).toBe("nowrap");
  });

  it("updates a value when it changes", () => {
    const view = mount(<Styled machineStyle={{ "--sui-demo": "3" }} />);
    view.render(<Styled machineStyle={{ "--sui-demo": "4" }} />);

    expect(styled(view.container).style.getPropertyValue("--sui-demo")).toBe("4");
  });

  it("removes a key that the machine stops emitting, and keeps the others", () => {
    const view = mount(<Styled machineStyle={{ "--sui-a": "1", "--sui-b": "2" }} />);
    expect(styled(view.container).style.getPropertyValue("--sui-b")).toBe("2");

    view.render(<Styled machineStyle={{ "--sui-a": "1", "--sui-b": undefined }} />);
    const node = styled(view.container);

    expect(node.style.getPropertyValue("--sui-a")).toBe("1");
    expect(node.style.getPropertyValue("--sui-b")).toBe("");
  });

  it("lets a consumer's own style win on the same property", () => {
    const view = mount(
      <Styled
        machineStyle={{ "text-transform": "uppercase", "--sui-demo": "1" }}
        style={{ textTransform: "lowercase" }}
      />,
    );
    const node = styled(view.container);

    expect(node.style.getPropertyValue("text-transform")).toBe("lowercase");
    expect(node.style.getPropertyValue("--sui-demo")).toBe("1");

    view.render(<Styled machineStyle={{ "text-transform": "uppercase", "--sui-demo": "1" }} />);
    expect(node.style.getPropertyValue("text-transform")).toBe("uppercase");
  });

  it("calls a consumer's callback ref once, however often it renders", () => {
    const ref = vi.fn();
    const view = mount(<Styled ref={ref} machineStyle={{ "--sui-demo": "1" }} />);
    view.render(<Styled ref={ref} machineStyle={{ "--sui-demo": "2" }} />);
    view.render(<Styled ref={ref} machineStyle={{ "--sui-demo": "3" }} />);

    expect(ref).toHaveBeenCalledTimes(1);
    expect(ref).toHaveBeenCalledWith(styled(view.container));
    expect(styled(view.container).style.getPropertyValue("--sui-demo")).toBe("3");
  });

  it("writes on a substituted host element and keeps its own style", () => {
    const { container } = mount(
      <Styled
        machineStyle={{ "--sui-demo": "1" }}
        render={<a href="/x" style={{ color: "red" }} />}
      />,
    );
    const node = styled(container);

    expect(node.tagName).toBe("A");
    expect(node.style.getPropertyValue("--sui-demo")).toBe("1");
    expect(node.style.getPropertyValue("color")).toBe("red");
  });

  it("keeps the styles of both parts when one is composed into the other", () => {
    const { container } = mount(
      <Styled
        name="outer"
        machineStyle={{ "--sui-outer": "1" }}
        render={<Styled name="inner" machineStyle={{ "--sui-inner": "2" }} />}
      />,
    );
    const node = styled(container, "outer");

    expect(node.getAttribute("data-part")).toBe("demo:inner demo:outer");
    expect(node.style.getPropertyValue("--sui-outer")).toBe("1");
    expect(node.style.getPropertyValue("--sui-inner")).toBe("2");
  });

  it("chains the ref of the substituted element after the part's", () => {
    const ref = vi.fn();
    const { container } = mount(
      <Styled
        machineStyle={{ "--sui-demo": "1" }}
        render={<div ref={ref} data-part="demo:own" />}
      />,
    );

    expect(ref).toHaveBeenCalledTimes(1);
    expect(ref).toHaveBeenCalledWith(styled(container));
    expect(styled(container).style.getPropertyValue("--sui-demo")).toBe("1");
  });

  it("writes through a render function that forwards the ref", () => {
    const { container } = mount(
      <Styled
        machineStyle={{ "--sui-demo": "1" }}
        render={(props) => <section {...(props as Record<string, unknown>)} />}
      />,
    );

    expect(styled(container).style.getPropertyValue("--sui-demo")).toBe("1");
  });

  it("hands a render function the ref and no machine style", () => {
    const seen: string[] = [];
    mount(
      <Styled
        machineStyle={{ "--sui-demo": "1" }}
        render={(props) => {
          seen.push(...Object.keys(props));
          return <div />;
        }}
      />,
    );

    expect(seen).toContain("ref");
    expect(seen).not.toContain("style");
  });

  it("yields a core shorthand to the consumer's longhand, and a custom property only to its own name", () => {
    const { container } = mount(
      <>
        <Styled
          name="a"
          machineStyle={{ "--sui-a": "1" }}
          style={{ margin: "3px", ["--sui-a-b" as string]: "2" }}
        />
        <Styled
          name="b"
          machineStyle={{ margin: "9px", borderWidth: "4px" }}
          style={{ marginLeft: "2px", borderTopWidth: "1px" }}
        />
      </>,
    );
    const first = styled(container, "a");
    const second = styled(container, "b");

    expect(first.style.marginTop).toBe("3px");
    expect(first.style.getPropertyValue("--sui-a-b")).toBe("2");
    expect(first.style.getPropertyValue("--sui-a")).toBe("1");
    expect(second.style.marginLeft).toBe("2px");
    expect(second.style.marginRight).toBe("");
    expect(second.style.borderTopWidth).toBe("1px");
    expect(second.style.borderBottomWidth).toBe("");
  });

  it.each([
    { core: "overflow", value: "hidden", other: "overflow-wrap", otherValue: "anywhere" },
    { core: "overflow", value: "hidden", other: "overflow-anchor", otherValue: "none" },
    { core: "position", value: "absolute", other: "position-anchor", otherValue: "--anchor" },
    { core: "position", value: "absolute", other: "position-try-order", otherValue: "normal" },
    {
      core: "clip",
      value: "rect(0px, 0px, 0px, 0px)",
      other: "clip-path",
      otherValue: "inset(50%)",
    },
    { core: "border-width", value: "0px", other: "border-image-width", otherValue: "2" },
    { core: "margin", value: "-1px", other: "margin-trim", otherValue: "none" },
  ])("keeps the core's $core when the consumer sets only $other", (spec) => {
    const { container } = mount(
      <Styled
        machineStyle={{ [spec.core]: spec.value }}
        style={{ [camel(spec.other)]: spec.otherValue } as CSSProperties}
      />,
    );

    expect(styled(container).style.getPropertyValue(spec.core)).not.toBe("");
  });

  it.each(["--sui-x-inline", "--sui-x-y", "--sui-x-top-width", "--sui-x-block-start"])(
    "keeps a core custom property when the consumer sets %s",
    (other) => {
      const { container } = mount(
        <Styled
          machineStyle={{ "--sui-x": "1" }}
          style={{ [other]: "2" } as unknown as CSSProperties}
        />,
      );

      expect(styled(container).style.getPropertyValue("--sui-x")).toBe("1");
      expect(styled(container).style.getPropertyValue(other)).toBe("2");
    },
  );

  it.each([
    { core: "padding", value: "7px", other: "padding-inline" },
    { core: "margin", value: "7px", other: "margin-block-start" },
    { core: "overflow", value: "hidden", other: "overflow-x" },
    { core: "border-width", value: "7px", other: "border-top-width" },
    { core: "border-width", value: "7px", other: "border-block-start-width" },
    { core: "overflow", value: "hidden", other: "overflow-block" },
  ])("yields the core's $core to the consumer's $other", (spec) => {
    const { container } = mount(
      <Styled
        machineStyle={{ [spec.core]: spec.value }}
        style={{ [camel(spec.other)]: "1px" } as CSSProperties}
      />,
    );
    const probe = document.createElement("div");
    probe.style.setProperty(spec.core, spec.value);

    expect(styled(container).style.getPropertyValue(spec.core)).not.toBe(
      probe.style.getPropertyValue(spec.core),
    );
  });

  it("does not write the visually hidden recipe again on a re-render", () => {
    const hidden = (
      <CheckboxRoot id="agree" name="agree">
        <CheckboxHiddenInput />
        <CheckboxControl />
      </CheckboxRoot>
    );
    const view = mount(hidden);
    expect(getComputedStyle(queryPart(view.container, "hidden-input") as HTMLElement).width).toBe(
      "1px",
    );
    const write = vi.spyOn(CSSStyleDeclaration.prototype, "setProperty");

    view.render(hidden);
    view.render(
      <CheckboxRoot id="agree" name="agree">
        <CheckboxHiddenInput />
        <CheckboxControl />
      </CheckboxRoot>,
    );

    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
  });

  it("restores a core value that was changed by hand on the node", () => {
    const view = mount(<Styled machineStyle={{ "--sui-demo": "1", padding: "0" }} />);
    const node = styled(view.container);
    node.style.setProperty("--sui-demo", "9");
    node.style.setProperty("padding", "5px");

    view.render(<Styled machineStyle={{ "--sui-demo": "1", padding: "0" }} />);

    expect(node.style.getPropertyValue("--sui-demo")).toBe("1");
    expect(node.style.padding).toBe("0px");
  });

  it("keeps a key the inner part still emits when the outer part drops its own", () => {
    const view = mount(
      <Styled
        name="outer"
        machineStyle={{ "--sui-shared": "1" }}
        render={<Styled name="inner" machineStyle={{ "--sui-shared": "2" }} />}
      />,
    );
    expect(styled(view.container, "outer").style.getPropertyValue("--sui-shared")).toBe("1");

    view.render(
      <Styled
        name="outer"
        machineStyle={{ "--sui-shared": undefined }}
        render={<Styled name="inner" machineStyle={{ "--sui-shared": "2" }} />}
      />,
    );

    expect(styled(view.container, "outer").style.getPropertyValue("--sui-shared")).toBe("2");
  });

  it("does not write a property again when its value has not changed", () => {
    const view = mount(<Styled machineStyle={{ "--sui-demo": "1", textTransform: "uppercase" }} />);
    const write = vi.spyOn(CSSStyleDeclaration.prototype, "setProperty");

    view.render(<Styled machineStyle={{ "--sui-demo": "1", textTransform: "uppercase" }} />);
    expect(write).not.toHaveBeenCalled();

    view.render(<Styled machineStyle={{ "--sui-demo": "2", textTransform: "uppercase" }} />);
    expect(write).toHaveBeenCalledTimes(1);
    write.mockRestore();
  });

  it("writes a number on a custom property and refuses one on a regular property", () => {
    const { container } = mount(
      <Styled machineStyle={{ "--sui-demo": 3, width: 12, opacity: 0.5 }} />,
    );
    const node = styled(container);

    expect(node.style.getPropertyValue("--sui-demo")).toBe("3");
    expect(node.style.width).toBe("");
    expect(node.style.opacity).toBe("");
  });

  it("renders into a target whose ref is an imperative handle, not an element", () => {
    function Handle(props: { readonly ref?: Ref<unknown> }): ReactNode {
      useImperativeHandle(props.ref, () => ({ focus: (): void => undefined }), []);
      return <div data-part="demo:handle" />;
    }

    expect(() =>
      mount(<Styled machineStyle={{ "--sui-demo": "1" }} render={<Handle />} />),
    ).not.toThrow();
  });
});

describe("components — their styles reach the node after mount", () => {
  it("writes --sui-item-count on the tab list", async () => {
    const { container } = mount(
      <TabsRoot id="demo" defaultValue="a">
        <TabsList aria-label="Demo">
          <TabsTrigger value="a" label="A">
            A
          </TabsTrigger>
          <TabsTrigger value="b" label="B">
            B
          </TabsTrigger>
          <TabsTrigger value="c" label="C">
            C
          </TabsTrigger>
        </TabsList>
      </TabsRoot>,
    );
    await settle();
    const list = queryPart(container, "list") as HTMLElement;

    expect(list.style.getPropertyValue("--sui-item-count")).toBe("3");
    expect(getComputedStyle(list).getPropertyValue("--sui-item-count").trim()).toBe("3");
  });

  it("clips the hidden input of a checkbox to one pixel", () => {
    const { container } = mount(
      <CheckboxRoot id="agree" name="agree">
        <CheckboxHiddenInput />
        <CheckboxControl />
      </CheckboxRoot>,
    );
    const input = queryPart(container, "hidden-input") as HTMLElement;
    const box = getComputedStyle(input);

    expect(box.position).toBe("absolute");
    expect(box.width).toBe("1px");
    expect(box.height).toBe("1px");
    expect(box.overflow).toBe("hidden");
  });
});
