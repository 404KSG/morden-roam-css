(() => {
  const KEY = "__roamHistoryAvailability";
  window[KEY]?.destroy?.();

  const CLASS = "rm-history-unavailable";
  let retryTimer = null;
  let retries = 0;

  const sync = () => {
    const back = document.querySelector(".rm-electron-nav-back-btn");
    const forward = document.querySelector(".rm-electron-nav-forward-btn");

    if (!back || !forward) {
      if (retries < 20) {
        retries += 1;
        clearTimeout(retryTimer);
        retryTimer = setTimeout(sync, 250);
      }
      return;
    }

    retries = 0;
    const nav = window.navigation;
    back.classList.toggle(CLASS, Boolean(nav && !nav.canGoBack));
    forward.classList.toggle(CLASS, Boolean(nav && !nav.canGoForward));
  };

  const schedule = () => requestAnimationFrame(sync);
  window.navigation?.addEventListener("currententrychange", schedule);
  window.addEventListener("popstate", schedule);
  window.addEventListener("hashchange", schedule);
  sync();

  window[KEY] = {
    destroy() {
      window.navigation?.removeEventListener("currententrychange", schedule);
      window.removeEventListener("popstate", schedule);
      window.removeEventListener("hashchange", schedule);
      clearTimeout(retryTimer);
      document
        .querySelectorAll(`.${CLASS}`)
        .forEach((element) => element.classList.remove(CLASS));
    },
  };
})();
