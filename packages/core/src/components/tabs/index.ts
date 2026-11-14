export { anatomy, parts, type TabsPart } from "./tabs.anatomy";
export { connect } from "./tabs.connect";
export {
  getContentEl,
  getContentId,
  getIndicatorId,
  getListEl,
  getListId,
  getRootEl,
  getRootId,
  getScrollbarId,
  getThumbId,
  getTriggerEl,
  getTriggerEls,
  getTriggerId,
  getTriggerValues,
} from "./tabs.dom";
export { machine } from "./tabs.machine";
export type {
  ResolvedTabsMachineProps,
  TabsActivationMode,
  TabsApi,
  TabsCloseDetails,
  TabsCloseTriggerProps,
  TabsContentProps,
  TabsFocusChangeDetails,
  TabsMachineProps,
  TabsSchema,
  TabsTriggerProps,
  TabsValueChangeDetails,
} from "./tabs.types";
