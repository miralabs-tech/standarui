import type { ReactElement } from "react";
import type { ComposedAction, ComposedTrigger, PartProps } from "./index";

type IsAny<T> = 0 extends 1 & T ? true : false;
type Expect<T extends true> = T;

export type RootTypeExports = [
  Expect<IsAny<PartProps<"a">> extends false ? true : false>,
  Expect<PartProps<"a"> extends { readonly href?: string | undefined } ? true : false>,
  Expect<IsAny<ComposedAction> extends false ? true : false>,
  Expect<ComposedAction["label"] extends string ? true : false>,
  Expect<ComposedTrigger extends ReactElement ? true : false>,
];
