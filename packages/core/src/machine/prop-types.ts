/**
 * The prop getters returned by `connect` speak plain DOM: HTML attribute names,
 * native event types, camelCase handlers. Every adapter's `normalizeProps` maps
 * that to its own dialect (`class` → `className`, `onFocusIn` → `onFocus`,
 * `onClick` → `onclick`…) and casts once, at that boundary — which is why the
 * handlers below are typed with real DOM events even though React will hand a
 * synthetic one to the same function.
 *
 * `data-*` and `aria-*` are pattern index signatures rather than an exhaustive
 * list: the state contract (`data-state`, `data-focus-visible`…) grows per
 * component, but a typo in a real prop still fails to compile.
 */

export type EventHandler<E extends Event = Event> = (event: E) => void;

export interface DOMEventProps {
  onClick?: EventHandler<MouseEvent> | undefined;
  /** Middle and right button. `click` never fires for either. */
  onAuxClick?: EventHandler<MouseEvent> | undefined;
  onDoubleClick?: EventHandler<MouseEvent> | undefined;
  onContextMenu?: EventHandler<MouseEvent> | undefined;
  onMouseDown?: EventHandler<MouseEvent> | undefined;
  onMouseUp?: EventHandler<MouseEvent> | undefined;
  onMouseEnter?: EventHandler<MouseEvent> | undefined;
  onMouseLeave?: EventHandler<MouseEvent> | undefined;
  onMouseMove?: EventHandler<MouseEvent> | undefined;
  onPointerDown?: EventHandler<PointerEvent> | undefined;
  onPointerUp?: EventHandler<PointerEvent> | undefined;
  onPointerMove?: EventHandler<PointerEvent> | undefined;
  onPointerEnter?: EventHandler<PointerEvent> | undefined;
  onPointerLeave?: EventHandler<PointerEvent> | undefined;
  onPointerCancel?: EventHandler<PointerEvent> | undefined;
  onLostPointerCapture?: EventHandler<PointerEvent> | undefined;
  onTouchStart?: EventHandler<TouchEvent> | undefined;
  onTouchEnd?: EventHandler<TouchEvent> | undefined;
  onTouchMove?: EventHandler<TouchEvent> | undefined;
  onTouchCancel?: EventHandler<TouchEvent> | undefined;
  onKeyDown?: EventHandler<KeyboardEvent> | undefined;
  onKeyUp?: EventHandler<KeyboardEvent> | undefined;
  onFocus?: EventHandler<FocusEvent> | undefined;
  onBlur?: EventHandler<FocusEvent> | undefined;
  onFocusIn?: EventHandler<FocusEvent> | undefined;
  onFocusOut?: EventHandler<FocusEvent> | undefined;
  onInput?: EventHandler<Event> | undefined;
  onBeforeInput?: EventHandler<InputEvent> | undefined;
  onChange?: EventHandler<Event> | undefined;
  onSelect?: EventHandler<Event> | undefined;
  onSubmit?: EventHandler<SubmitEvent> | undefined;
  onReset?: EventHandler<Event> | undefined;
  onScroll?: EventHandler<Event> | undefined;
  onWheel?: EventHandler<WheelEvent> | undefined;
  onDragStart?: EventHandler<DragEvent> | undefined;
  onCompositionStart?: EventHandler<CompositionEvent> | undefined;
  onCompositionUpdate?: EventHandler<CompositionEvent> | undefined;
  onCompositionEnd?: EventHandler<CompositionEvent> | undefined;
  onAnimationStart?: EventHandler<AnimationEvent> | undefined;
  onAnimationEnd?: EventHandler<AnimationEvent> | undefined;
  onTransitionEnd?: EventHandler<TransitionEvent> | undefined;
  onCopy?: EventHandler<ClipboardEvent> | undefined;
  onCut?: EventHandler<ClipboardEvent> | undefined;
  onPaste?: EventHandler<ClipboardEvent> | undefined;
}

export interface CommonProps extends DOMEventProps {
  [key: `data-${string}`]: string | number | boolean | undefined;
  [key: `aria-${string}`]: string | number | boolean | undefined;
  id?: string | undefined;
  class?: string | undefined;
  style?: string | Readonly<Record<string, string | number | undefined>> | undefined;
  role?: string | undefined;
  tabIndex?: number | undefined;
  hidden?: boolean | undefined;
  dir?: "ltr" | "rtl" | undefined;
  title?: string | undefined;
  lang?: string | undefined;
  inert?: boolean | undefined;
}

export interface HTMLProps extends CommonProps {
  draggable?: boolean | undefined;
  contentEditable?: boolean | "plaintext-only" | undefined;
  spellCheck?: boolean | undefined;
  translate?: "yes" | "no" | undefined;
}

/**
 * The anchor, and it is its own slot rather than an `element` with an `href`:
 * `link` is the first component whose root has to be a real `<a>` — the role,
 * the native activation and the browser's own navigation all come from the tag,
 * and none of them survive being written onto a `div`.
 */
export interface AnchorProps extends HTMLProps {
  href?: string | undefined;
  target?: string | undefined;
  rel?: string | undefined;
  download?: string | boolean | undefined;
  hrefLang?: string | undefined;
  referrerPolicy?: string | undefined;
  ping?: string | undefined;
}

export interface ButtonProps extends HTMLProps {
  type?: "button" | "submit" | "reset" | undefined;
  disabled?: boolean | undefined;
  value?: string | number | undefined;
  name?: string | undefined;
  form?: string | undefined;
}

export interface InputProps extends HTMLProps {
  type?: string | undefined;
  value?: string | number | undefined;
  defaultValue?: string | number | undefined;
  checked?: boolean | undefined;
  defaultChecked?: boolean | undefined;
  disabled?: boolean | undefined;
  readOnly?: boolean | undefined;
  required?: boolean | undefined;
  name?: string | undefined;
  form?: string | undefined;
  placeholder?: string | undefined;
  inputMode?: string | undefined;
  autoComplete?: string | undefined;
  autoCapitalize?: string | undefined;
  min?: string | number | undefined;
  max?: string | number | undefined;
  step?: string | number | undefined;
  maxLength?: number | undefined;
  minLength?: number | undefined;
  pattern?: string | undefined;
  multiple?: boolean | undefined;
  accept?: string | undefined;
}

export interface LabelProps extends HTMLProps {
  for?: string | undefined;
}

export interface OutputProps extends HTMLProps {
  for?: string | undefined;
  name?: string | undefined;
}

export interface SelectProps extends HTMLProps {
  value?: string | number | readonly string[] | undefined;
  defaultValue?: string | number | readonly string[] | undefined;
  disabled?: boolean | undefined;
  multiple?: boolean | undefined;
  required?: boolean | undefined;
  name?: string | undefined;
  form?: string | undefined;
  size?: number | undefined;
}

export interface TextareaProps extends HTMLProps {
  value?: string | undefined;
  defaultValue?: string | undefined;
  rows?: number | undefined;
  cols?: number | undefined;
  disabled?: boolean | undefined;
  readOnly?: boolean | undefined;
  required?: boolean | undefined;
  placeholder?: string | undefined;
  name?: string | undefined;
  form?: string | undefined;
  maxLength?: number | undefined;
}

export interface ImgProps extends HTMLProps {
  src?: string | undefined;
  alt?: string | undefined;
  width?: string | number | undefined;
  height?: string | number | undefined;
  loading?: "eager" | "lazy" | undefined;
  decoding?: "sync" | "async" | "auto" | undefined;
  // Neither event bubbles, so a delegated listener never sees them and the
  // handler has to ride on the element itself — which is how `avatar` learns
  // that its image resolved or broke.
  onLoad?: EventHandler<Event> | undefined;
  onError?: EventHandler<Event> | undefined;
}

export interface SVGProps extends CommonProps {
  viewBox?: string | undefined;
  width?: string | number | undefined;
  height?: string | number | undefined;
  fill?: string | undefined;
  stroke?: string | undefined;
  strokeWidth?: string | number | undefined;
  xmlns?: string | undefined;
  focusable?: boolean | undefined;
}

export interface CircleProps extends SVGProps {
  cx?: string | number | undefined;
  cy?: string | number | undefined;
  r?: string | number | undefined;
  strokeDasharray?: string | number | undefined;
  strokeDashoffset?: string | number | undefined;
  strokeLinecap?: "butt" | "round" | "square" | undefined;
}

export interface PathProps extends SVGProps {
  d?: string | undefined;
  strokeLinecap?: "butt" | "round" | "square" | undefined;
  strokeLinejoin?: "miter" | "round" | "bevel" | undefined;
}

/** One slot per element kind an adapter has to render. */
export interface PropTypes<T = unknown> {
  element: T;
  a: T;
  button: T;
  input: T;
  label: T;
  output: T;
  select: T;
  textarea: T;
  img: T;
  svg: T;
  circle: T;
  path: T;
}

export interface NormalizeProps<T extends PropTypes> {
  element(props: HTMLProps): T["element"];
  a(props: AnchorProps): T["a"];
  button(props: ButtonProps): T["button"];
  input(props: InputProps): T["input"];
  label(props: LabelProps): T["label"];
  output(props: OutputProps): T["output"];
  select(props: SelectProps): T["select"];
  textarea(props: TextareaProps): T["textarea"];
  img(props: ImgProps): T["img"];
  svg(props: SVGProps): T["svg"];
  circle(props: CircleProps): T["circle"];
  path(props: PathProps): T["path"];
}

/** Props as the adapter sees them, once the element kind stops mattering. */
export type AnyProps = Readonly<Record<string, unknown>>;

export function createNormalizer<T extends PropTypes>(
  transform: (props: AnyProps) => unknown,
): NormalizeProps<T> {
  const wrap = (props: object): never => transform(props as AnyProps) as never;
  return {
    element: wrap,
    a: wrap,
    button: wrap,
    input: wrap,
    label: wrap,
    output: wrap,
    select: wrap,
    textarea: wrap,
    img: wrap,
    svg: wrap,
    circle: wrap,
    path: wrap,
  };
}
