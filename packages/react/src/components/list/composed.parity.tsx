import type { ReactElement } from "react";
import { BOLT, type ParityCase } from "../../composed.harness";
import { List, ListItem } from "./composed";
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

// biome-ignore lint/a11y/useAnchorContent: the anchor is a substitution handed to `useRender`, which fills it with the action part's children.
const LINK: ReactElement = <a href="/profile" />;
const PRESS: ReactElement = <button type="button" />;

export const parity: readonly ParityCase[] = [
  {
    name: "list",
    composed: (
      <List id="settings" header="Account" footer="Changes apply to every device.">
        <ListItem
          id="profile"
          action={LINK}
          leading={BOLT}
          title="Profile"
          subtitle="Name, photo"
          size="tall"
        />
        <ListItem id="storage" title="Storage" trailing="128 GB" />
        <ListItem id="language" action={PRESS} title="Language" />
      </List>
    ),
    parts: (
      <ListRoot id="settings">
        <ListSection>
          <ListHeader>Account</ListHeader>
          <ListGroup>
            <ListRow id="profile" size="tall">
              <ListAction render={LINK}>
                <ListLeading>{BOLT}</ListLeading>
                <ListTitle>Profile</ListTitle>
                <ListSubtitle>Name, photo</ListSubtitle>
              </ListAction>
            </ListRow>
            <ListRow id="storage">
              <ListTitle>Storage</ListTitle>
              <ListTrailing>128 GB</ListTrailing>
            </ListRow>
            <ListRow id="language">
              <ListAction render={PRESS}>
                <ListTitle>Language</ListTitle>
              </ListAction>
            </ListRow>
          </ListGroup>
          <ListFooter>Changes apply to every device.</ListFooter>
        </ListSection>
      </ListRoot>
    ),
  },
  {
    name: "list",
    composed: (
      <List id="plain" variant="plain">
        <ListItem id="only" title="Only row" />
      </List>
    ),
    parts: (
      <ListRoot id="plain" variant="plain">
        <ListSection>
          <ListGroup>
            <ListRow id="only">
              <ListTitle>Only row</ListTitle>
            </ListRow>
          </ListGroup>
        </ListSection>
      </ListRoot>
    ),
  },
  {
    name: "list",
    composed: (
      <List id="quiet" header="Nothing yet" footer={false}>
        {false}
      </List>
    ),
    parts: (
      <ListRoot id="quiet">
        <ListSection>
          <ListHeader>Nothing yet</ListHeader>
        </ListSection>
      </ListRoot>
    ),
  },
  {
    name: "list",
    composed: <ListItem id="detail" action={LINK} title="Storage" trailing="On" />,
    parts: (
      <ListRow id="detail">
        <ListAction render={LINK}>
          <ListTitle>Storage</ListTitle>
          <ListTrailing>On</ListTrailing>
        </ListAction>
      </ListRow>
    ),
  },
  {
    name: "list",
    composed: (
      <ListItem
        id="bare"
        title="Bare row"
        subtitle={false}
        trailing={false}
        leading={false}
        action={undefined}
      />
    ),
    parts: (
      <ListRow id="bare">
        <ListTitle>Bare row</ListTitle>
      </ListRow>
    ),
  },
  {
    name: "list",
    composed: (
      <List
        id="tuned"
        header="Tuned"
        parts={{
          section: { className: "block" },
          header: { id: "tuned:header", className: "title" },
          group: { id: "tuned:group" },
          footer: { className: "note" },
        }}
        footer="Note"
      >
        <ListItem
          id="tuned-row"
          title="Tuned row"
          trailing="Detail"
          action={LINK}
          parts={{
            action: { className: "hit", "aria-label": "Open tuned row" },
            title: { className: "name" },
            trailing: { className: "detail" },
          }}
        />
      </List>
    ),
    parts: (
      <ListRoot id="tuned">
        <ListSection className="block">
          <ListHeader id="tuned:header" className="title">
            Tuned
          </ListHeader>
          <ListGroup id="tuned:group">
            <ListRow id="tuned-row">
              <ListAction render={LINK} className="hit" aria-label="Open tuned row">
                <ListTitle className="name">Tuned row</ListTitle>
                <ListTrailing className="detail">Detail</ListTrailing>
              </ListAction>
            </ListRow>
          </ListGroup>
          <ListFooter className="note">Note</ListFooter>
        </ListSection>
      </ListRoot>
    ),
  },
];
