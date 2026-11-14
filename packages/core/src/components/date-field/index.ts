// `DateFieldMachineProps.min` and `.max` are `DateValue`, so a consumer of this barrel
// could not name the type of a bound it was passing. `calendar/index.ts` already
// re-exports it from the same module, for the same reason.
export type { DateValue } from "../../utils/plain-date";
export { anatomy, type DateFieldPart, parts } from "./date-field.anatomy";
export { connect } from "./date-field.connect";
export {
  getControlEl,
  getControlId,
  getHiddenInputEl,
  getHiddenInputId,
  getRootId,
  getSegmentEl,
  getSegmentId,
} from "./date-field.dom";
export { machine } from "./date-field.machine";
export {
  buildSegments,
  composeDateValue,
  editableSegments,
  type SegmentContext,
  toISOValue,
  toSegmentValues,
} from "./date-field.segments";
export type {
  DateFieldApi,
  DateFieldMachineProps,
  DateFieldSchema,
  DateFieldValue,
  DateFieldValueChangeDetails,
  DateGranularity,
  DateHourCycle,
  DateSegment,
  DateSegmentType,
  DateSegmentUnit,
  DateSegmentValues,
  ResolvedDateFieldMachineProps,
} from "./date-field.types";
