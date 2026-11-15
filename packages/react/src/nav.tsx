import { NavProvider } from "@standarx/nav/react";
import type { ComponentProps, ReactNode } from "react";

export type { InputPlugin, InputSystem } from "@standarx/nav";
export { focusElement, setInputModality, trackInputModality } from "@standarx/nav";
export type { GamepadRuntime } from "@standarx/nav/gamepad";
export { gamepadPlugin } from "@standarx/nav/gamepad";
export {
  NavDocumentProvider,
  NavProvider,
  useInputSystem,
  useIntentScopeHost,
} from "@standarx/nav/react";
export { spatialPlugin } from "@standarx/nav/spatial";

export function StandaruiNavProvider(props: ComponentProps<typeof NavProvider>): ReactNode {
  return <NavProvider {...props} />;
}
