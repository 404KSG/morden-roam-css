/*
 * Morden Roam JS
 * Generated from 3 active JavaScript blocks in Roam Research.
 * Source order is preserved so later modules can build on earlier helpers.
 */

/* --------------------------------------------------------------------------
 * Module 01
 * -------------------------------------------------------------------------- */
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

/* --------------------------------------------------------------------------
 * Module 02
 * -------------------------------------------------------------------------- */
(() => {
  const KEY = "__rrLeftSidebarReferenceCounts";
  const SIDEBAR_SELECTOR = ".roam-sidebar-container";
  const WRAPPER_SELECTOR = ".starred-pages-wrapper";
  const ROW_SELECTOR = `${SIDEBAR_SELECTOR} .starred-pages .page`;
  const REFRESH_TTL_MS = 120000;
  const FALLBACK_REFRESH_MS = 300000;
  const DEBOUNCE_MS = 180;
  const QUERY = `[:find ?title (count ?block)\n                  :in $ [?title ...]\n                  :where\n                  [?page :node/title ?title]\n                  [?block :block/refs ?page]]`;

  window[KEY]?.destroy?.();

  const controller = new AbortController();
  let sidebarObserver = null;
  let starredObserver = null;
  let observedSidebar = null;
  let observedWrapper = null;
  let refreshTimer = null;
  let cancelIdle = null;
  let interval = null;
  let scheduledForce = false;
  let lastRefreshAt = 0;
  let lastTitlesKey = "";

  const getTitle = (row) => {
    const content = row.cloneNode(true);
    content.querySelectorAll(".rr-sidebar-ref-count").forEach((badge) => badge.remove());
    return content.textContent?.trim() || "";
  };

  const refresh = ({ force = false } = {}) => {
    if (document.hidden) return;

    const rows = Array.from(document.querySelectorAll(ROW_SELECTOR));
    if (!rows.length) return;

    const entries = rows
      .map((row) => ({ row, title: getTitle(row) }))
      .filter(({ title }) => Boolean(title));
    if (!entries.length) return;

    const titles = [...new Set(entries.map(({ title }) => title))];

    const titlesKey = JSON.stringify([...titles].sort());
    const now = Date.now();
    if (
      !force &&
      titlesKey === lastTitlesKey &&
      now - lastRefreshAt < REFRESH_TTL_MS
    ) return;

    let results = [];
    try {
      results = window.roamAlphaAPI.q(QUERY, titles) || [];
    } catch (error) {
      console.warn("[Left Sidebar Reference Counts] Query failed.", error);
      return;
    }

    lastRefreshAt = now;
    lastTitlesKey = titlesKey;
    const counts = new Map(results.map(([title, count]) => [title, Number(count)]));

    entries.forEach(({ row, title }) => {
      const count = counts.get(title) || 0;
      let badge = row.querySelector(":scope > .rr-sidebar-ref-count");
      if (count === 0) {
        badge?.remove();
        return;
      }

      if (!badge) {
        badge = document.createElement("span");
        badge.className = "rr-sidebar-ref-count";
        badge.setAttribute("aria-hidden", "true");
        row.appendChild(badge);
      }
      const label = count > 99 ? "99+" : String(count);
      const tooltip = `${count} 个引用`;
      if (badge.textContent !== label) badge.textContent = label;
      if (badge.title !== tooltip) badge.title = tooltip;
    });
  };

  const cancelScheduled = () => {
    window.clearTimeout(refreshTimer);
    refreshTimer = null;
    cancelIdle?.();
    cancelIdle = null;
  };

  const schedule = (force = false) => {
    scheduledForce ||= force;
    cancelScheduled();
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      const run = () => {
        cancelIdle = null;
        const shouldForce = scheduledForce;
        scheduledForce = false;
        refresh({ force: shouldForce });
      };

      if (typeof window.requestIdleCallback === "function") {
        const idleId = window.requestIdleCallback(run, { timeout: 1000 });
        cancelIdle = () => window.cancelIdleCallback?.(idleId);
      } else {
        const timeoutId = window.setTimeout(run, 0);
        cancelIdle = () => window.clearTimeout(timeoutId);
      }
    }, DEBOUNCE_MS);
  };

  const isBadgeOnlyMutation = (mutation) => {
    const target = mutation.target instanceof Element
      ? mutation.target
      : mutation.target.parentElement;
    if (target?.closest(".rr-sidebar-ref-count")) return true;
    if (mutation.type !== "childList") return false;

    const changedNodes = [
      ...Array.from(mutation.addedNodes),
      ...Array.from(mutation.removedNodes),
    ];
    return changedNodes.length > 0 && changedNodes.every((node) =>
      node instanceof Element && node.matches(".rr-sidebar-ref-count")
    );
  };

  const connectStarredObserver = () => {
    const wrapper = document.querySelector(WRAPPER_SELECTOR);
    if (wrapper === observedWrapper) return;

    starredObserver?.disconnect();
    starredObserver = null;
    observedWrapper = wrapper;

    if (wrapper) {
      starredObserver = new MutationObserver((mutations) => {
        const changed = mutations.some((mutation) =>
          !isBadgeOnlyMutation(mutation)
        );
        if (changed) schedule();
      });
      starredObserver.observe(wrapper, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    schedule(true);
  };

  const connectObservers = () => {
    const sidebar = document.querySelector(SIDEBAR_SELECTOR);
    if (sidebar !== observedSidebar) {
      sidebarObserver?.disconnect();
      sidebarObserver = null;
      observedSidebar = sidebar;

      if (sidebar) {
        sidebarObserver = new MutationObserver((mutations) => {
          const wrapperChanged = mutations.some((mutation) => {
            if (mutation.type !== "childList") return false;
            const target = mutation.target instanceof Element
              ? mutation.target
              : mutation.target.parentElement;
            if (target?.closest?.(WRAPPER_SELECTOR)) return true;
            return Array.from(mutation.addedNodes)
              .concat(Array.from(mutation.removedNodes))
              .some((node) =>
                node instanceof Element &&
                (node.matches(WRAPPER_SELECTOR) ||
                  node.querySelector(WRAPPER_SELECTOR))
              );
          });
          if (wrapperChanged) connectStarredObserver();
        });
        sidebarObserver.observe(sidebar, { childList: true, subtree: true });
      }
    }
    connectStarredObserver();
  };

  const wake = () => {
    connectObservers();
    schedule();
  };

  const forceRefresh = () => {
    connectObservers();
    schedule(true);
  };

  window.addEventListener("hashchange", forceRefresh, { signal: controller.signal });
  window.addEventListener("focus", forceRefresh, { signal: controller.signal });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) forceRefresh();
  }, { signal: controller.signal });

  interval = window.setInterval(() => {
    if (!document.hidden) wake();
  }, FALLBACK_REFRESH_MS);

  window[KEY] = {
    refresh: () => schedule(true),
    destroy() {
      controller.abort();
      sidebarObserver?.disconnect();
      starredObserver?.disconnect();
      cancelScheduled();
      window.clearInterval(interval);
      document.querySelectorAll(".rr-sidebar-ref-count").forEach((badge) => badge.remove());
      delete window[KEY];
    },
  };

  connectObservers();
  console.info("[Left Sidebar Reference Counts] Loaded.");
})();

/* --------------------------------------------------------------------------
 * Module 03
 * -------------------------------------------------------------------------- */
(() => {
  const KEY = "__rrRoamScroll";
  const CONFIG = {
    STYLE_ID: "unified-precise-scrollbar-style",
    MANAGED_CLASS: "rr-scrollbar-managed",
    ACTIVE_CLASS: "is-scrolling-local",
    HIDE_DELAY: 1200,
    COLOR_MAIN: "#80919F",
    COLOR_HOVER: "#5A6A78",
    WIDTH: "4px",
  };

  window[KEY]?.destroy?.();

  if (window.handleRoamScrollRef) {
    window.removeEventListener("scroll", window.handleRoamScrollRef, true);
    delete window.handleRoamScrollRef;
  }
  delete window.roamScrollTimers;

  const controller = new AbortController();
  const states = new Map();
  const supportsScrollEnd = "onscrollend" in document;
  const persistentTargetSelector = "#roam-right-sidebar-content";
  let persistentTarget = null;
  let persistentResizeObserver = null;
  let slotFrame = 0;

  const style = document.getElementById(CONFIG.STYLE_ID)
    || document.createElement("style");
  style.id = CONFIG.STYLE_ID;
  style.textContent = [
    ":root {",
    "  --sb-w: " + CONFIG.WIDTH + ";",
    "  --sb-m: " + CONFIG.COLOR_MAIN + ";",
    "  --sb-h: " + CONFIG.COLOR_HOVER + ";",
    "}",
    "." + CONFIG.MANAGED_CLASS + "::-webkit-scrollbar {",
    "  width: var(--sb-w) !important;",
    "  height: var(--sb-w) !important;",
    "}",
    "." + CONFIG.MANAGED_CLASS + "::-webkit-scrollbar-track {",
    "  background: transparent !important;",
    "}",
    "." + CONFIG.MANAGED_CLASS + "::-webkit-scrollbar-thumb {",
    "  background-color: transparent !important;",
    "  border: 0 !important;",
    "  border-radius: 12px !important;",
    "  transition: background-color 0.25s ease-in-out !important;",
    "}",
    "." + CONFIG.MANAGED_CLASS + "." + CONFIG.ACTIVE_CLASS
      + "::-webkit-scrollbar-thumb {",
    "  background-color: var(--sb-m) !important;",
    "}",
    "." + CONFIG.MANAGED_CLASS + "::-webkit-scrollbar-thumb:hover {",
    "  background-color: var(--sb-h) !important;",
    "  cursor: pointer;",
    "}",
  ].join("\n");
  if (!style.isConnected) document.head.appendChild(style);

  const syncPersistentSlot = (target = persistentTarget) => {
    if (!target?.isConnected) return;
    const slot = Math.max(0, target.offsetWidth - target.clientWidth);
    const value = `${slot}px`;
    if (target.style.getPropertyValue("--rr-scrollbar-slot") !== value) {
      target.style.setProperty("--rr-scrollbar-slot", value);
    }
  };

  const schedulePersistentSlotSync = (target = persistentTarget) => {
    if (!target?.isConnected || slotFrame) return;
    slotFrame = window.requestAnimationFrame(() => {
      slotFrame = 0;
      syncPersistentSlot(target);
    });
  };

  const observePersistentTarget = (target) => {
    if (persistentTarget === target) {
      schedulePersistentSlotSync(target);
      return;
    }

    persistentResizeObserver?.disconnect();
    persistentTarget?.style.removeProperty("--rr-scrollbar-slot");
    persistentTarget = target;
    persistentResizeObserver = new ResizeObserver(() => {
      schedulePersistentSlotSync(target);
    });
    persistentResizeObserver.observe(target);
    syncPersistentSlot(target);
    schedulePersistentSlotSync(target);
  };

  const resolveTarget = (eventTarget) => {
    if (eventTarget === document) {
      return document.scrollingElement || document.documentElement;
    }
    return eventTarget instanceof HTMLElement ? eventTarget : null;
  };

  const getState = (target) => {
    let state = states.get(target);
    if (!state) {
      state = { frame: 0, timer: 0 };
      states.set(target, state);
    }
    return state;
  };

  const scheduleHide = (target, state) => {
    window.clearTimeout(state.timer);
    state.timer = window.setTimeout(() => {
      state.timer = 0;
      target.classList.remove(CONFIG.ACTIVE_CLASS);
      if (!state.frame) states.delete(target);
    }, CONFIG.HIDE_DELAY);
  };

  const showScrollbar = (target, scheduleFallbackHide) => {
    const state = getState(target);

    if (!target.classList.contains(CONFIG.MANAGED_CLASS)) {
      target.classList.add(CONFIG.MANAGED_CLASS);
    }
    if (target.matches?.(persistentTargetSelector)) {
      schedulePersistentSlotSync(target);
    }

    if (!state.frame) {
      state.frame = window.requestAnimationFrame(() => {
        state.frame = 0;
        if (target.isConnected) target.classList.add(CONFIG.ACTIVE_CLASS);
      });
    }

    if (scheduleFallbackHide) scheduleHide(target, state);
  };

  const onScroll = (event) => {
    const target = resolveTarget(event.target);
    if (target) showScrollbar(target, !supportsScrollEnd);
  };

  const onScrollEnd = (event) => {
    const target = resolveTarget(event.target);
    if (!target) return;
    scheduleHide(target, getState(target));
  };

  window.addEventListener("scroll", onScroll, {
    capture: true,
    passive: true,
    signal: controller.signal,
  });

  if (supportsScrollEnd) {
    window.addEventListener("scrollend", onScrollEnd, {
      capture: true,
      passive: true,
      signal: controller.signal,
    });
  }

  const managePersistentTarget = (root = document) => {
    const target = root instanceof Element && root.matches(persistentTargetSelector)
      ? root
      : root.querySelector?.(persistentTargetSelector);
    if (!target) return;
    target.classList.add(CONFIG.MANAGED_CLASS);
    observePersistentTarget(target);
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches(persistentTargetSelector)
          || node.querySelector(persistentTargetSelector)) {
          managePersistentTarget(node);
          return;
        }
      }
    }
  });

  managePersistentTarget();
  observer.observe(document.body, { childList: true, subtree: true });

  window[KEY] = {
    destroy() {
      observer.disconnect();
      persistentResizeObserver?.disconnect();
      if (slotFrame) window.cancelAnimationFrame(slotFrame);
      persistentTarget?.style.removeProperty("--rr-scrollbar-slot");
      controller.abort();
      states.forEach((state, target) => {
        window.cancelAnimationFrame(state.frame);
        window.clearTimeout(state.timer);
        target.classList.remove(CONFIG.MANAGED_CLASS, CONFIG.ACTIVE_CLASS);
      });
      states.clear();
      document
        .querySelectorAll("." + CONFIG.MANAGED_CLASS)
        .forEach((target) => {
          target.classList.remove(CONFIG.MANAGED_CLASS, CONFIG.ACTIVE_CLASS);
        });
      style.remove();
      delete window[KEY];
    },
  };

  console.info("[Roam Scroll] Loaded.");
})();
