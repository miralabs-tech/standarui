export { anatomy, parts, type SplitterPart } from "./splitter.anatomy";
export { connect } from "./splitter.connect";
export { getHandleEl, getHandleId, getPanelEl, getPanelId } from "./splitter.dom";
export { machine } from "./splitter.machine";
export { getKeyIntent, isAdjustable, resolveGrowth, type SplitterGrowth } from "./splitter.props";
export type {
  ResolvedSplitterMachineProps,
  SplitterApi,
  SplitterCollapsedChangeDetails,
  SplitterMachineProps,
  SplitterPanelSide,
  SplitterSchema,
  SplitterSizeChangeDetails,
  SplitterUnit,
  SplitterValueTextDetails,
} from "./splitter.types";
