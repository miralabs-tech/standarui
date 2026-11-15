/**
 * Where the tree lives — a document, a shadow root, an iframe — and what it
 * resolves to: `{ dir, locale, density, reducedMotion }`.
 *
 * The provider renders no element of its own. Density and theme are attributes an
 * app puts on its own markup (they are settable per subtree, that is the styles
 * contract), and a wrapper `<div>` here would break every grid and flex layout it
 * landed in. What it does instead is watch those attributes and hand the resolved
 * context down, with the same resolution order the styles layer uses: attributes
 * first, media queries second.
 *
 * Given a `rootNode`, it also tells the input layer which document to listen to,
 * so a `NavProvider` goes below it, never above.
 */

import {
  defaultEnvironment,
  type EnvironmentContext,
  type EnvironmentOverrides,
  type RootNode,
  resolveEnvironment,
  trackEnvironment,
} from "@standarui/core";
import { NavDocumentProvider } from "@standarx/nav/react";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

interface EnvironmentValue {
  readonly getRootNode: (() => RootNode) | undefined;
  readonly environment: EnvironmentContext;
}

const EnvironmentReactContext = createContext<EnvironmentValue | null>(null);

export interface EnvironmentProviderProps extends EnvironmentOverrides {
  readonly rootNode?: RootNode | (() => RootNode) | undefined;
  readonly children?: ReactNode;
}

export function EnvironmentProvider(props: EnvironmentProviderProps): ReactNode {
  const { rootNode, dir, locale, density, motion, reducedMotion, children } = props;

  const getRootNode = useMemo((): (() => RootNode) | undefined => {
    if (rootNode === undefined) return undefined;
    return typeof rootNode === "function" ? rootNode : (): RootNode => rootNode;
  }, [rootNode]);

  // The server and the first client render agree on this: overrides only, no
  // platform read, which is what `resolveEnvironment(null, …)` is for.
  const [environment, setEnvironment] = useState<EnvironmentContext>(() =>
    resolveEnvironment(null, { dir, locale, density, motion, reducedMotion }),
  );

  useEffect(() => {
    const overrides: EnvironmentOverrides = { dir, locale, density, motion, reducedMotion };
    const root = getRootNode?.() ?? document;
    const doc = root.ownerDocument ?? (root as Document);
    const node = doc.documentElement;
    setEnvironment(resolveEnvironment(node, overrides));
    return trackEnvironment(node, { ...overrides, onChange: setEnvironment });
  }, [getRootNode, dir, locale, density, motion, reducedMotion]);

  const value = useMemo<EnvironmentValue>(
    () => ({ getRootNode, environment }),
    [getRootNode, environment],
  );

  const getDocument = useMemo(
    (): (() => Document) | undefined =>
      getRootNode === undefined
        ? undefined
        : (): Document => {
            const root = getRootNode();
            return root.ownerDocument ?? (root as Document);
          },
    [getRootNode],
  );

  return (
    <EnvironmentReactContext.Provider value={value}>
      {getDocument === undefined ? (
        children
      ) : (
        <NavDocumentProvider doc={getDocument}>{children}</NavDocumentProvider>
      )}
    </EnvironmentReactContext.Provider>
  );
}

export function useEnvironment(): EnvironmentContext {
  return useContext(EnvironmentReactContext)?.environment ?? defaultEnvironment;
}

/**
 * `undefined` when no provider is mounted, and that is the useful answer: the
 * core's `Scope` falls back to the document on its own, and passing a
 * `getRootNode` that returns `document` would defeat nothing but readability.
 */
export function useRootNode(): (() => RootNode) | undefined {
  return useContext(EnvironmentReactContext)?.getRootNode;
}

/** The document the tree belongs to. Effects only — it reads the DOM. */
export function useDocument(): () => Document {
  const getRootNode = useRootNode();
  return useMemo(
    () => (): Document => {
      const root = getRootNode?.() ?? document;
      return root.ownerDocument ?? (root as Document);
    },
    [getRootNode],
  );
}
