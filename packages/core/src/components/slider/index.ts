// Re-exported, not re-implemented: the arithmetic moved to `utils/range` when the
// component's own budget line was ratified, and `@standarui/core/slider` keeps
// naming it. `../../*` is external to the component's bundle, so the bytes went
// with it — they are budgeted on the `range arithmetic` line instead.
export {
  constrainValue,
  fromPercent,
  getPercentFromPoint,
  normalizeValues,
  resolveLargeStep,
  resolveMarks,
  roundToPrecision,
  setValueAtIndex,
  snapToStep,
  toPercent,
  toValueArray,
} from "../../utils/range";
export { anatomy, parts, type SliderPart } from "./slider.anatomy";
export { connect } from "./slider.connect";
export {
  getControlEl,
  getControlId,
  getHiddenInputId,
  getLabelId,
  getRootEl,
  getRootId,
  getThumbEl,
  getThumbId,
  hasPart,
} from "./slider.dom";
export { machine } from "./slider.machine";
export { getKeyIntent, resolveDirection, toAdjustEvent } from "./slider.props";
export type {
  ResolvedSliderMachineProps,
  SliderAdjustEvent,
  SliderAdjustment,
  SliderAdjustmentKind,
  SliderApi,
  SliderIntent,
  SliderMachineProps,
  SliderMarkerProps,
  SliderMarks,
  SliderPointOptions,
  SliderRange,
  SliderSchema,
  SliderThumbAlignment,
  SliderThumbProps,
  SliderValueChangeDetails,
  SliderValueTextDetails,
} from "./slider.types";
