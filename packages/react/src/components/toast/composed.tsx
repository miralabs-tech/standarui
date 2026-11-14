/**
 * `<Toast toaster={t}/>` — the region, and a card for every record in it.
 *
 * **The bare name is the GROUP, not the card**, which is the arbitration this file
 * carries. Seven parts in the anatomy, and `root` is the card rather than the
 * region — the region is `group`. A composed card would have been the first layer
 * in the library whose outermost node is not its own component's root, its parity
 * row would have had to wrap a `<ToastGroup>` the layer does not own, and it would
 * not have removed the passage this layer exists to remove: `children` is a
 * REQUIRED render-prop on the group, so a consumer composing cards would still
 * write the region, the store read and the map by hand.
 *
 * **The default body is only possible because the sheet draws the five severity
 * marks.** A record carries a `type` and no icon — `ToastOptions` has no such
 * field — so a default card can derive its mark from the severity and nothing
 * else. `_toast.scss` now draws info, success, warning, error and the spinner under
 * `:empty`, which is what took this folder off the pending list the V4 wave put it
 * on. A consumer who hands their own symbol through `parts.indicator` stops the
 * `:empty` matching and pays nothing for the defaults.
 *
 * **Both names come through `translations`**, which is a machine prop and travels
 * untouched: `regionLabel` names the landmark and `dismissLabel` the close button,
 * and the machine defaults both — so this layer invents no English of its own and
 * takes no label prop.
 *
 * `renderCard(record, defaults)` is the escape hatch the closed vocabulary allows:
 * it is handed the record and the card this layer would have rendered, so a
 * consumer can wrap it, replace one branch, or ignore it.
 */

import type * as toast from "@standarui/core/toast";
import type { ReactNode } from "react";
import type { PartProps } from "../../create-part";
import {
  ToastActionTrigger,
  ToastCloseTrigger,
  ToastDescription,
  ToastGroup,
  type ToastGroupProps,
  ToastIndicator,
  ToastRoot,
  ToastTitle,
} from "./toast";

/** Applied last on every part, so the consumer's entry wins over the placement. */
export interface ToastParts {
  readonly root?: Omit<PartProps<"div">, "toast"> | undefined;
  /**
   * The severity mark. Hand it a child and the sheet's own drawing steps aside —
   * `:empty` is the whole guard — which is how a consumer keeps their icon set.
   */
  readonly indicator?: PartProps<"span"> | undefined;
  readonly title?: PartProps<"div"> | undefined;
  readonly description?: PartProps<"div"> | undefined;
  readonly actionTrigger?: PartProps<"button"> | undefined;
  readonly closeTrigger?: PartProps<"button"> | undefined;
}

export interface ToastComposedProps
  extends Omit<ToastGroupProps, "children" | "render" | "asChild"> {
  /**
   * Handed each record and the card this layer would have rendered for it. Return
   * the card to keep it, wrap it, or ignore it and build your own.
   */
  readonly renderCard?: ((record: toast.ToastRecord, defaults: ReactNode) => ReactNode) | undefined;
  readonly parts?: ToastParts | undefined;
}

export function Toast(props: ToastComposedProps): ReactNode {
  const { renderCard, parts, ...group } = props;

  return (
    <ToastGroup {...group}>
      {(record) => {
        const card = (
          <ToastRoot toast={record} {...parts?.root}>
            {record.type === undefined ? null : <ToastIndicator {...parts?.indicator} />}
            <ToastTitle {...parts?.title}>{record.title}</ToastTitle>
            {record.description === undefined ? null : (
              <ToastDescription {...parts?.description}>{record.description}</ToastDescription>
            )}
            {record.action === undefined ? null : (
              <ToastActionTrigger {...parts?.actionTrigger}>
                {record.action.label}
              </ToastActionTrigger>
            )}
            {record.closable === true ? <ToastCloseTrigger {...parts?.closeTrigger} /> : null}
          </ToastRoot>
        );

        return renderCard === undefined ? card : renderCard(record, card);
      }}
    </ToastGroup>
  );
}
