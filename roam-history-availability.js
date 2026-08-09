(() => {
  const KEY = "__roamHistoryAvailability";
  window[KEY]?.destroy?.();

  const CLASS = "rm-history-unavailable";
  const controller = new AbortController();
  const buttons = [
    [".rm-electron-nav-back-btn", "canGoBack"],
    [".rm-electron-nav-forward-btn", "canGoForward"],
  ];

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

  const observer = new MutationObserver(() => sync() && observer.disconnect());
  if (!sync()) observer.observe(document.body, { childList: true, subtree: true });
  window.navigation?.addEventListener("currententrychange", sync, {
    signal: controller.signal,
  });

  window[KEY] = {
    destroy() {
      controller.abort();
      observer.disconnect();
      document
        .querySelectorAll(`.${CLASS}`)
        .forEach((element) => element.classList.remove(CLASS));
    },
  };
})();
