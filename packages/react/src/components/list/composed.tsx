import type { ListMachineProps, ListRowOptions } from "@standarui/core/list";
import type { ReactNode } from "react";
import type { ComposedTrigger } from "../../composed";
import type { PartProps } from "../../create-part";
import {
  ListAction,
  ListFooter,
  ListGroup,
  ListHeader,
  ListLeading,
  ListRoot,
  ListRow,
  ListSection,
  ListSubtitle,
  ListTitle,
  ListTrailing,
} from "./list";

export interface ListParts {
  readonly section?: PartProps<"section"> | undefined;
  readonly header?: PartProps<"h3"> | undefined;
  readonly group?: PartProps<"ul"> | undefined;
  readonly footer?: PartProps<"p"> | undefined;
}

export interface ListComposedProps
  extends ListMachineProps,
    Omit<PartProps<"div", ListMachineProps>, "children"> {
  /** The section title, an `h3` over the group. */
  readonly header?: ReactNode;
  /** The rows of the group, most often `ListItem`s. */
  readonly children?: ReactNode;
  /** The note under the group. */
  readonly footer?: ReactNode;
  readonly parts?: ListParts | undefined;
}

export interface ListItemParts {
  readonly action?: PartProps<"button"> | undefined;
  readonly leading?: PartProps<"span"> | undefined;
  readonly title?: PartProps<"span"> | undefined;
  readonly subtitle?: PartProps<"span"> | undefined;
  readonly trailing?: PartProps<"span"> | undefined;
}

export interface ListItemComposedProps
  extends ListRowOptions,
    Omit<PartProps<"li", ListRowOptions>, "children" | "title"> {
  /** An image or an icon, flush with the row's start edge. */
  readonly leading?: ReactNode;
  /** The row's one line of text. */
  readonly title: Exclude<ReactNode, null | undefined | boolean>;
  /** The second line, for a `tall` row. */
  readonly subtitle?: ReactNode;
  /** The detail at the end. On an acting row the chevron follows it. */
  readonly trailing?: ReactNode;
  /**
   * The element the row's content is placed in, handed to the action part's
   * `render`: an `<a href>` or a `<button>`. Never placed as children.
   */
  readonly action?: ComposedTrigger | undefined;
  readonly parts?: ListItemParts | undefined;
}

const given = (slot: ReactNode): boolean => slot != null && slot !== false;

export function List(props: ListComposedProps): ReactNode {
  const { header, children, footer, parts, ...root } = props;

  return (
    <ListRoot {...root}>
      <ListSection {...parts?.section}>
        {given(header) ? <ListHeader {...parts?.header}>{header}</ListHeader> : null}
        {given(children) ? <ListGroup {...parts?.group}>{children}</ListGroup> : null}
        {given(footer) ? <ListFooter {...parts?.footer}>{footer}</ListFooter> : null}
      </ListSection>
    </ListRoot>
  );
}

export function ListItem(props: ListItemComposedProps): ReactNode {
  const { leading, title, subtitle, trailing, action, parts, ...row } = props;

  const content = (
    <>
      {given(leading) ? <ListLeading {...parts?.leading}>{leading}</ListLeading> : null}
      <ListTitle {...parts?.title}>{title}</ListTitle>
      {given(subtitle) ? <ListSubtitle {...parts?.subtitle}>{subtitle}</ListSubtitle> : null}
      {given(trailing) ? <ListTrailing {...parts?.trailing}>{trailing}</ListTrailing> : null}
    </>
  );

  return (
    <ListRow {...row}>
      {action === undefined ? (
        content
      ) : (
        <ListAction render={action} {...parts?.action}>
          {content}
        </ListAction>
      )}
    </ListRow>
  );
}
