import { afterEach, describe, expect, it } from "vitest";
import { expectNoAxeViolations, mount, queryPart, unmountAll, waitFor } from "../../render-harness";
import { AvatarFallback, AvatarImage, AvatarRoot } from "./avatar";

const GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
/** Valid base64, and not an image: the decoder rejects it and fires `error`. */
const BROKEN = "data:image/png;base64,AAAAAAAA";

function part(container: HTMLElement, name: string): HTMLElement {
  const node = queryPart(container, name);
  if (node === null) throw new Error(`no part "${name}"`);
  return node;
}

function Person({ src, alt = "Ada Lovelace" }: { readonly src: string; readonly alt?: string }) {
  return (
    <AvatarRoot>
      <AvatarImage src={src} alt={alt} />
      <AvatarFallback>AL</AvatarFallback>
    </AvatarRoot>
  );
}

afterEach(() => {
  unmountAll();
});

describe("AvatarRoot", () => {
  it("puts the monogram away once the picture is up", async () => {
    const { container } = mount(<Person src={GIF} />);

    await waitFor(() => {
      expect(part(container, "root").getAttribute("data-state")).toBe("loaded");
    });

    expect(part(container, "fallback").hasAttribute("hidden")).toBe(true);
    expect(part(container, "image").hasAttribute("hidden")).toBe(false);
    expect(part(container, "image").getAttribute("alt")).toBe("Ada Lovelace");
    expect(part(container, "image").getAttribute("draggable")).toBe("false");
  });

  it("removes the picture that will not decode and shows the monogram", async () => {
    const { container } = mount(<Person src={BROKEN} />);

    await waitFor(() => {
      expect(part(container, "root").getAttribute("data-state")).toBe("error");
    });

    expect(part(container, "image").hasAttribute("hidden")).toBe(true);
    expect(part(container, "fallback").hasAttribute("hidden")).toBe(false);
  });

  it("keeps its name through a 404 when it was given one, and stays anonymous without", async () => {
    // Without `label` the name lives entirely in the alt, and `hidden` takes the
    // alt out of the tree with the image: the avatar is announced while the
    // network is up and silent when it is down.
    const bare = mount(<Person src={BROKEN} />);
    await waitFor(() => {
      expect(part(bare.container, "root").getAttribute("data-state")).toBe("error");
    });
    expect(part(bare.container, "root").hasAttribute("role")).toBe(false);
    expect(part(bare.container, "root").hasAttribute("aria-label")).toBe(false);

    const named = mount(
      <AvatarRoot label="Ada Lovelace">
        <AvatarImage src={BROKEN} alt="" />
        <AvatarFallback>AL</AvatarFallback>
      </AvatarRoot>,
    );
    await waitFor(() => {
      expect(part(named.container, "root").getAttribute("data-state")).toBe("error");
    });

    const root = part(named.container, "root");
    expect(root.getAttribute("role")).toBe("img");
    expect(root.getAttribute("aria-label")).toBe("Ada Lovelace");
    // The name is on the root, so nothing that can fail carries it: the picture
    // is still `hidden` and the monogram still `aria-hidden`.
    expect(part(named.container, "image").hasAttribute("hidden")).toBe(true);
    expect(part(named.container, "fallback").getAttribute("aria-hidden")).toBe("true");
  });

  it("goes back to loading when React swaps the src on the same element", async () => {
    const statuses: string[] = [];
    const handle = mount(
      <AvatarRoot
        onStatusChange={(details): void => {
          statuses.push(details.status);
        }}
      >
        <AvatarImage src={GIF} alt="Ada" />
        <AvatarFallback>A</AvatarFallback>
      </AvatarRoot>,
    );

    await waitFor(() => {
      expect(part(handle.container, "root").getAttribute("data-state")).toBe("loaded");
    });

    handle.render(
      <AvatarRoot
        onStatusChange={(details): void => {
          statuses.push(details.status);
        }}
      >
        <AvatarImage src={PNG} alt="Ada" />
        <AvatarFallback>A</AvatarFallback>
      </AvatarRoot>,
    );

    await waitFor(() => {
      expect(statuses).toEqual(["loaded", "loading", "loaded"]);
    });
  });

  it("shows the fallback outright when there is no image part at all", async () => {
    const { container } = mount(
      <AvatarRoot>
        <AvatarFallback>AL</AvatarFallback>
      </AvatarRoot>,
    );

    await waitFor(() => {
      expect(part(container, "fallback").hasAttribute("hidden")).toBe(false);
    });

    // Still `loading` as a status — nothing has failed. There is simply no
    // picture in the tree, which is a different fact and the reason
    // `showFallback` is not just `status !== "loaded"`.
    expect(part(container, "root").getAttribute("data-state")).toBe("loading");
  });

  it("holds the monogram back for a delay it was given", async () => {
    // No `src`: the element is `complete` with nothing decoded, so it fires
    // neither event and the delay is the only thing that moves.
    const { container } = mount(
      <AvatarRoot fallbackDelay={60}>
        <AvatarImage alt="" />
        <AvatarFallback>AL</AvatarFallback>
      </AvatarRoot>,
    );

    expect(part(container, "fallback").hasAttribute("hidden")).toBe(true);

    await waitFor(() => {
      expect(part(container, "fallback").hasAttribute("hidden")).toBe(false);
    });
  });

  it("carries the size as presentation", () => {
    const { container } = mount(
      <AvatarRoot size="xl">
        <AvatarFallback>AL</AvatarFallback>
      </AvatarRoot>,
    );

    expect(part(container, "root").getAttribute("data-size")).toBe("xl");
  });

  it("says where a part belongs when it is rendered outside its root", () => {
    expect(() => mount(<AvatarFallback />)).toThrow(/inside <AvatarRoot>/);
  });

  it("passes axe as a named picture, as a bare monogram, and as a labelled root", async () => {
    const handle = mount(
      <main>
        <Person src={GIF} />
        {/* Decorative: the name is in the adjacent text, so the alt is empty
            and the monogram is hidden from the tree entirely. */}
        <AvatarRoot>
          <AvatarImage src={GIF} alt="" />
          <AvatarFallback>AL</AvatarFallback>
        </AvatarRoot>
        <span>Ada Lovelace</span>
        {/* The recipe for an avatar that means something and has no picture:
            the root takes the role and the name itself. */}
        <AvatarRoot role="img" aria-label="Grace Hopper">
          <AvatarFallback>GH</AvatarFallback>
        </AvatarRoot>
      </main>,
    );

    await waitFor(() => {
      expect(queryPart(handle.container, "image")).not.toBeNull();
    });

    await expectNoAxeViolations(handle.container);
  });
});
