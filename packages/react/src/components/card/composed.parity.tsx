/**
 * The card's rows of the markup-parity table, discovered by the glob in
 * `packages/react/src/composed.test.tsx` and run by its loop. The contract is
 * stated there; what lives here is only this component's fixtures, so a wave that
 * adds a composed layer elsewhere never edits this file.
 *
 * Every row pins `id` on both sides, as the loop asks. Nothing here mints one:
 * the card has no machine, no scope id, no IDREF and no surface at all — so no
 * row can dangle and none needs a portal stood down.
 *
 * What the rows are about is the **absent** node. `card:root` is a flex column
 * with a `gap` (`_card.scss:27`), so a part placed around nothing is not an
 * invisible node but a gap row; four of the six below differ from one another
 * only by which parts the layer left out.
 */

import type { ReactElement } from "react";
import { BOLT, type ParityCase } from "../../composed.harness";
import {
  CardAction,
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardRoot,
  CardTitle,
} from "./card";
import { Card } from "./composed";

/** The control a card most often puts in the header's second column. */
const MORE: ReactElement = (
  <button type="button" aria-label="More actions">
    {BOLT}
  </button>
);

const PLAY: ReactElement = <button type="button">Play</button>;

/**
 * The heading-level correction of the last row, shared by both of its forms.
 * `useRender` clones what it is handed, so one element in two trees is safe — and
 * sharing it is what makes the two sides literally the same node rather than two
 * that happen to agree.
 */
// biome-ignore lint/a11y/useHeadingContent: the empty `h2` is a level correction handed to `useRender`, which fills it from the part's own children. The rule reads the literal, where the content arrives at render — and writing text into it here would be worse than useless: `CardTitle` has children, and they overwrite it.
const H2: ReactElement = <h2 />;

export const parity: readonly ParityCase[] = [
  /**
   * The full anatomy, every conditional part present at once, and the header's DOM
   * order pinned with it: only `card:action` is placed explicitly by the sheet —
   * column 2, spanning both rows (`_card.scss:104`) — so the title and the
   * description reach column 1 by auto-flow, which holds only while they precede
   * it. `variant` rides through the rest spread, and `glass` is the one value that
   * makes the root write a second attribute for its subtree to read.
   */
  {
    name: "card",
    composed: (
      <Card
        id="rooftop"
        variant="glass"
        title="Overtones"
        description="Recorded in one take on the rooftop."
        action={MORE}
        footer={PLAY}
      >
        Mixed the same night, mastered the week after.
      </Card>
    ),
    parts: (
      <CardRoot id="rooftop" variant="glass">
        <CardHeader>
          <CardTitle>Overtones</CardTitle>
          <CardDescription>Recorded in one take on the rooftop.</CardDescription>
          <CardAction>{MORE}</CardAction>
        </CardHeader>
        <CardBody>Mixed the same night, mastered the week after.</CardBody>
        <CardFooter>{PLAY}</CardFooter>
      </CardRoot>
    ),
  },
  /**
   * The body alone, with the header's three-way disjunction false: there is no
   * `card:header` node at all, rather than an empty one. A header around nothing
   * spends a stack gap and reserves no gutter either — the second column exists
   * only where `:has([data-part~="card:action"])` matches (`_card.scss:96`).
   */
  {
    name: "card",
    composed: <Card id="note">Mixed the same night, mastered the week after.</Card>,
    parts: (
      <CardRoot id="note">
        <CardBody>Mixed the same night, mastered the week after.</CardBody>
      </CardRoot>
    ),
  },
  /** One arm of that disjunction on its own: a heading with nothing under it. */
  {
    name: "card",
    composed: <Card id="draft" title="Untitled draft" />,
    parts: (
      <CardRoot id="draft">
        <CardHeader>
          <CardTitle>Untitled draft</CardTitle>
        </CardHeader>
      </CardRoot>
    ),
  },
  /**
   * The two arms a title-shaped reading of the guard would miss: the header is
   * placed for a description and an action with no heading above them, and
   * `card:footer` is placed with no `card:body` before it. The footer's
   * `margin-block-start: auto` (`_card.scss:132`) is what pins it to the bottom of
   * the surface, and it never depended on a body existing.
   */
  {
    name: "card",
    composed: (
      <Card
        id="storage"
        variant="filled"
        description="128 GB used of 256 GB"
        action={MORE}
        footer={PLAY}
      />
    ),
    parts: (
      <CardRoot id="storage" variant="filled">
        <CardHeader>
          <CardDescription>128 GB used of 256 GB</CardDescription>
          <CardAction>{MORE}</CardAction>
        </CardHeader>
        <CardFooter>{PLAY}</CardFooter>
      </CardRoot>
    ),
  },
  /**
   * `false` is absent, and this is the row that says so.
   * `children={rows.length > 0 && <Rows/>}` is the shape everybody writes, React
   * renders `false` as nothing, and a `!= null` guard alone would wrap it in
   * `card:body` — an empty box on a surface whose every gap is a real one. The
   * markup is the title-only row's, reached the other way round.
   */
  {
    name: "card",
    composed: (
      <Card id="quiet" title="Nothing to report" description={false} action={false} footer={false}>
        {false}
      </Card>
    ),
    parts: (
      <CardRoot id="quiet">
        <CardHeader>
          <CardTitle>Nothing to report</CardTitle>
        </CardHeader>
      </CardRoot>
    ),
  },
  /**
   * The rule no row above exercises: `parts` is applied **last**, so the
   * consumer's entry wins over what the layer defaulted. Every witness here is a
   * typed prop, and it has to be — `avatar` and `collapsible` flip a value their
   * machine wrote, and this component has none to flip: its getters write
   * `data-scope`, `data-part` and `data-variant` and nothing else, and React's
   * prop types carry no `data-*` index signature, so no entry can even spell one.
   *
   * What is left is what the *layer* chose, which is the half `parts` exists for.
   * `card:title` is an `h3` because a card is a repeated unit inside a page;
   * `parts.title.render` is how the level is corrected where the page outline
   * calls for an `h2`. And `id` is not omitted from any entry: each of these parts
   * is placed at most once per card, so a fixed id stays fixed rather than
   * repeating down a list.
   */
  {
    name: "card",
    composed: (
      <Card
        id="session"
        title="Now playing"
        description="Overtones — Liquid session"
        action={MORE}
        footer={PLAY}
        parts={{
          header: { className: "row" },
          title: { render: H2 },
          description: { className: "muted", lang: "en" },
          action: { className: "actions" },
          body: { id: "session:body", className: "prose" },
          footer: { className: "controls" },
        }}
      >
        Mixed the same night, mastered the week after.
      </Card>
    ),
    parts: (
      <CardRoot id="session">
        <CardHeader className="row">
          <CardTitle render={H2}>Now playing</CardTitle>
          <CardDescription className="muted" lang="en">
            Overtones — Liquid session
          </CardDescription>
          <CardAction className="actions">{MORE}</CardAction>
        </CardHeader>
        <CardBody id="session:body" className="prose">
          Mixed the same night, mastered the week after.
        </CardBody>
        <CardFooter className="controls">{PLAY}</CardFooter>
      </CardRoot>
    ),
  },
];
