(() => {
  const KEY = "__roamHistoryAvailability";
  window[KEY]?.destroy?.();

  const CLASS = "rm-history-unavailable";
  const BUTTON_SELECTOR =
    ".rm-electron-nav-back-btn, .rm-electron-nav-forward-btn";
  const NAV_ROOT_SELECTOR =
    "#app-header, .rm-electron-nav, .rm-topbar, header";
  const buttons = [
    [".rm-electron-nav-back-btn", -1, "canGoBack"],
    [".rm-electron-nav-forward-btn", 1, "canGoForward"],
  ];
  const controller = new AbortController();
  const boundButtons = new WeakSet();
  let frame = 0;
  let observedRoot = null;

  const normalizeDestination = (url) => {
    try {
      const base = window.location?.href;
      const destination = base ? new URL(url, base) : new URL(url);
      return `${destination.origin}${destination.pathname}${destination.search}${destination.hash}`;
    } catch {
      return String(url ?? "");
    }
  };

  // `null` means that the semantic history is supported but contains no
  // visually distinct target. `undefined` keeps Roam native behavior as a
  // compatibility fallback when the Navigation API is unavailable.
  const getDistinctTarget = (direction) => {
    const navigation = window.navigation;
    if (
      typeof navigation?.entries !== "function" ||
      typeof navigation?.traverseTo !== "function" ||
      !navigation.currentEntry
    ) {
      return undefined;
    }

    const entries = navigation.entries();
    const current = navigation.currentEntry;
    let currentIndex = current.index;
    if (
      !Number.isInteger(currentIndex) ||
      entries[currentIndex]?.key !== current.key
    ) {
      currentIndex = entries.findIndex((entry) => entry.key === current.key);
    }
    if (currentIndex < 0) return undefined;

    const currentDestination = normalizeDestination(current.url);
    for (
      let index = currentIndex + direction;
      index >= 0 && index < entries.length;
      index += direction
    ) {
      if (normalizeDestination(entries[index].url) !== currentDestination) {
        return entries[index];
      }
    }
    return null;
  };

  const stopNativeTraversal = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const bindButton = (button, direction) => {
    if (!button || boundButtons.has(button)) return;
    boundButtons.add(button);
    button.addEventListener(
      "click",
      (event) => {
        const target = getDistinctTarget(direction);
        if (target === undefined) return;
        if (target === null) {
          stopNativeTraversal(event);
          return;
        }

        try {
          const transition = window.navigation.traverseTo(target.key);
          stopNativeTraversal(event);
          transition?.finished?.catch(() => {}).finally(schedule);
        } catch {
          // If traversal cannot start, leave the event untouched so the Roam
          // native Electron handler remains the final fallback.
        }
      },
      { capture: true, signal: controller.signal },
    );
  };

  const sync = () => {
    const navigation = window.navigation;
    buttons.forEach(([selector, direction, fallbackState]) => {
      const button = document.querySelector(selector);
      const target = getDistinctTarget(direction);
      const unavailable =
        target === null ||
        (target === undefined && navigation?.[fallbackState] === false);
      button?.classList.toggle(CLASS, unavailable);
      bindButton(button, direction);
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
