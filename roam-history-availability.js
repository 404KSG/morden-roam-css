(() => {
  const KEY = "__roamHistoryAvailability";
  window[KEY]?.destroy?.();

  const CLASS = "rm-history-unavailable";
  const BUTTON_SELECTOR =
    ".rm-electron-nav-back-btn, .rm-electron-nav-forward-btn";
  const NAV_ROOT_SELECTOR =
    "#app-header, .rm-electron-nav, .rm-topbar, header";
  const buttons = [
    [".rm-electron-nav-back-btn", "canGoBack"],
    [".rm-electron-nav-forward-btn", "canGoForward"],
  ];
  const controller = new AbortController();
  let frame = 0;
  let observedRoot = null;

  const sync = () => {
    const navigation = window.navigation;
    buttons.forEach(([selector, state]) => {
      const button = document.querySelector(selector);
      button?.classList.toggle(CLASS, navigation?.[state] === false);
    });
  };

  const getObservationRoot = () => {
    const navButton = document.querySelector(BUTTON_SELECTOR);
    const navRoot =
      navButton?.closest(NAV_ROOT_SELECTOR) ||
      document.querySelector(NAV_ROOT_SELECTOR);
    return (
      navRoot?.parentElement ||
      navRoot ||
      document.querySelector("#app") ||
      document.body
    );
  };

  const containsNav = (node) =>
    node?.nodeType === 1 &&
    (node.matches?.(BUTTON_SELECTOR) ||
      node.matches?.(NAV_ROOT_SELECTOR) ||
      node.querySelector?.(BUTTON_SELECTOR));

  const observer = new MutationObserver((mutations) => {
    const navChanged = mutations.some((mutation) =>
      [...mutation.addedNodes, ...mutation.removedNodes].some(containsNav),
    );
    if (navChanged) schedule();
  });

  const connectObserver = () => {
    const root = getObservationRoot();
    if (!root || root === observedRoot) return;

    observer.disconnect();
    observer.observe(root, { childList: true, subtree: true });
    observedRoot = root;
  };

  const schedule = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      sync();
      connectObserver();
    });
  };

  sync();
  connectObserver();
  window.navigation?.addEventListener("currententrychange", schedule, {
    signal: controller.signal,
  });
  window.addEventListener("popstate", schedule, { signal: controller.signal });
  window.addEventListener("hashchange", schedule, { signal: controller.signal });

  window[KEY] = {
    sync: schedule,
    destroy() {
      controller.abort();
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      document
        .querySelectorAll("." + CLASS)
        .forEach((element) => element.classList.remove(CLASS));
      delete window[KEY];
    },
  };
})();
