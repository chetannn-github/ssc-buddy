const LIGHT_PAGE_LOADER_KEY = "cbt-show-light-page-loader";

export function requestLightPageLoader(shouldShow: boolean) {
  if (typeof window === "undefined") return;
  if (shouldShow) sessionStorage.setItem(LIGHT_PAGE_LOADER_KEY, "true");
  else sessionStorage.removeItem(LIGHT_PAGE_LOADER_KEY);
}

export function consumeLightPageLoader() {
  if (typeof window === "undefined") return false;
  const shouldShow = sessionStorage.getItem(LIGHT_PAGE_LOADER_KEY) === "true";
  sessionStorage.removeItem(LIGHT_PAGE_LOADER_KEY);
  return shouldShow;
}
