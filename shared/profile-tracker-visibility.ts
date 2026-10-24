/** Summary stats follow the tracker feature; detailed cards have their own toggle. */
export function profileTrackerVisibility(trackEnabled:boolean,showOnProfile:boolean) {
  return {summary:trackEnabled,details:trackEnabled&&showOnProfile};
}
