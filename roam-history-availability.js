(() => {
  const KEY = "__roamHistoryAvailability";
  window[KEY]?.destroy?.();

  const CLASS = "rm-history-unavailable";
  const BUTTON_SELECTOR =
    ".rm-electron-nav-back-btn, .rm-electron-nav-forward-btn";
  const NAV_ROOT_SELECTOR =
    "#app-header, .rm-electron-nav, .rm-topbar, header";
  const RETRY_DELAY = 250;
  const MAX_RETRIES = 20;
  const controller = new AbortController();
  const buttons = [
    [".rm-electron-nav-back-btn", "canGoBack"],
    [".rm-electron-nav-forward-btn", "canGoForward"],
  ];
  let observer = null;
  let retryTimer = 0;
  let retries = 0;

  const sync = () => {
    const nav = window.navigation;
    return buttons
      .map(([selector, state]) => {
        const button = document.querySelector(selector);
        button?.classList.toggle(CLASS, Boolean(nav && !nav[state]));
        return button;
      })
      .every(Boolean);
  };

  const findNavRoot = () => {
    const button = document.querySelector(BUTTON_SELECTOR);
    return (
      button?.closest(NAV_ROOT_SELECTOR) ||
      button?.parentElement ||
      document.querySelector(NAV_ROOT_SELECTOR)
    );
  };

  const clearRetry = () => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = 0;
  };

  const observeNav = () => {
    if (sync()) return;

    const root = findNavRoot();
    if (root) {
      observer = new MutationObserver(() => {
        if (sync()) {
          observer.disconnect();
          observer = null;
          clearRetry();
        }
      });
      observer.observe(root, { childList: true, subtree: true });
      return;
    }

    if (retries < MAX_RETRIES) {
      retries += 1;
      retryTimer = setTimeout(observeNav, RETRY_DELAY);
    }
  };

  observeNav();
  window.navigation?.addEventListener("currententrychange", sync, {
    signal: controller.signal,
  });

  window[KEY] = {
    destroy() {
      controller.abort();
      observer?.disconnect();
      clearRetry();
      document
        .querySelectorAll("." + CLASS)
        .forEach((element) => element.classList.remove(CLASS));
    },
  };
})();
