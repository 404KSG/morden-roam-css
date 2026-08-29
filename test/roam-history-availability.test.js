const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const helperPath = path.join(root, "roam-history-availability.js");
const bundlePath = path.join(root, "roam.js");
const stylesheetPath = path.join(root, "roam.css");

const buttonSelector =
  ".rm-electron-nav-back-btn, .rm-electron-nav-forward-btn";

const makeButton = (selector) => {
  const classes = new Set();
  const listeners = new Map();
  let nativeClicks = 0;

  const button = {
    nodeType: 1,
    selector,
    addEventListener(type, listener, options = {}) {
      const handlers = listeners.get(type) ?? [];
      handlers.push(listener);
      listeners.set(type, handlers);
      options.signal?.addEventListener(
        "abort",
        () => {
          listeners.set(
            type,
            (listeners.get(type) ?? []).filter((handler) => handler !== listener),
          );
        },
        { once: true },
      );
    },
    classList: {
      contains: (name) => classes.has(name),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      toggle: (name, force) => {
        if (force) classes.add(name);
        else classes.delete(name);
      },
    },
    click: () => {
      const event = {
        defaultPrevented: false,
        immediatePropagationStopped: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        stopImmediatePropagation() {
          this.immediatePropagationStopped = true;
        },
      };
      for (const listener of listeners.get("click") ?? []) {
        listener(event);
        if (event.immediatePropagationStopped) break;
      }
      if (!event.immediatePropagationStopped) nativeClicks += 1;
      return event;
    },
    closest: () => null,
    matches: (value) => value.split(", ").includes(selector),
    querySelector: () => null,
    get nativeClicks() {
      return nativeClicks;
    },
  };

  return button;
};

const runHelper = (source) => {
  let back = makeButton(".rm-electron-nav-back-btn");
  let forward = makeButton(".rm-electron-nav-forward-btn");
  let destroyed = 0;
  let nextFrameId = 1;
  const frames = new Map();
  const observers = [];
  const navigationListeners = new Map();
  const windowListeners = new Map();
  const traversals = [];
  const app = {
    isConnected: true,
    nodeType: 1,
    matches: () => false,
    querySelector: (selector) => {
      if (selector === buttonSelector) return back || forward;
      return null;
    },
  };
  const makeEntries = (urls) =>
    urls.map((url, index) => ({ index, key: `entry-${index}`, url }));
  let entries = makeEntries([
    "https://roamresearch.com/#/app/exuberantia/page/a",
    "https://roamresearch.com/#/app/exuberantia/page/b",
  ]);
  const navigation = {
    currentEntry: entries[0],
    entries: () => entries,
    addEventListener(type, listener) {
      navigationListeners.set(type, listener);
    },
    emit(type) {
      navigationListeners.get(type)?.();
    },
    setEntries(urls, currentIndex) {
      entries = makeEntries(urls);
      this.currentEntry = entries[currentIndex];
    },
    traverseTo(key) {
      traversals.push(key);
      this.currentEntry = entries.find((entry) => entry.key === key);
      this.emit("currententrychange");
      return { finished: Promise.resolve() };
    },
  };
  const window = {
    __roamHistoryAvailability: {
      destroy: () => {
        destroyed += 1;
      },
    },
    addEventListener(type, listener) {
      windowListeners.set(type, listener);
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    navigation,
    requestAnimationFrame(callback) {
      const id = nextFrameId;
      nextFrameId += 1;
      frames.set(id, callback);
      return id;
    },
  };

  const document = {
    body: app,
    querySelector(selector) {
      if (selector === ".rm-electron-nav-back-btn") return back;
      if (selector === ".rm-electron-nav-forward-btn") return forward;
      if (selector === buttonSelector) return back || forward;
      if (selector === "#app") return app;
      return null;
    },
    querySelectorAll(selector) {
      assert.equal(selector, ".rm-history-unavailable");
      return [back, forward].filter((button) =>
        button?.classList.contains("rm-history-unavailable"),
      );
    },
  };

  class MutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.connected = false;
      observers.push(this);
    }

    disconnect() {
      this.connected = false;
    }

    observe() {
      this.connected = true;
    }

    trigger(nodes) {
      if (!this.connected) return;
      this.callback([{ addedNodes: nodes, removedNodes: [] }]);
    }
  }

  vm.runInNewContext(source, {
    AbortController,
    document,
    MutationObserver,
    URL,
    window,
  });

  return {
    get back() {
      return back;
    },
    get forward() {
      return forward;
    },
    get destroyed() {
      return destroyed;
    },
    navigation,
    observers,
    traversals,
    get pendingFrames() {
      return frames.size;
    },
    flushFrames() {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback());
    },
    rebuild() {
      back = makeButton(".rm-electron-nav-back-btn");
      forward = makeButton(".rm-electron-nav-forward-btn");
      const topbar = {
        nodeType: 1,
        matches: () => false,
        querySelector: (selector) => {
          if (selector === buttonSelector) return back;
          return null;
        },
      };
      observers.at(-1).trigger([topbar]);
      this.flushFrames();
    },
    triggerMutation(nodes) {
      observers.at(-1).trigger(nodes);
    },
    window,
    windowListeners,
  };
};

test("uses one semantic history source for both availability and traversal", () => {
  const source = fs.readFileSync(helperPath, "utf8");
  const result = runHelper(source);

  assert.equal(result.destroyed, 1, "the previous listener is stopped once");
  assert.equal(result.back.classList.contains("rm-history-unavailable"), true);
  assert.equal(result.forward.classList.contains("rm-history-unavailable"), false);

  const unavailableClick = result.back.click();
  assert.equal(unavailableClick.defaultPrevented, true);
  assert.equal(result.back.nativeClicks, 0);
  assert.deepEqual(result.traversals, []);

  const forwardClick = result.forward.click();
  assert.equal(forwardClick.defaultPrevented, true);
  assert.equal(result.forward.nativeClicks, 0);
  assert.deepEqual(result.traversals, ["entry-1"]);
  result.flushFrames();
  assert.equal(result.back.classList.contains("rm-history-unavailable"), false);
  assert.equal(result.forward.classList.contains("rm-history-unavailable"), true);
});

test("skips adjacent entries with the same visible Roam destination", () => {
  const source = fs.readFileSync(helperPath, "utf8");
  const result = runHelper(source);
  const pageA = "https://roamresearch.com/#/app/exuberantia/page/a";
  const pageB = "https://roamresearch.com/#/app/exuberantia/page/b";
  const pageC = "https://roamresearch.com/#/app/exuberantia/page/c";

  result.navigation.setEntries([pageA, pageB, pageB, pageC], 2);
  result.navigation.emit("currententrychange");
  result.flushFrames();

  result.back.click();
  assert.deepEqual(result.traversals, ["entry-0"]);
  assert.equal(result.back.nativeClicks, 0);

  result.flushFrames();
  result.forward.click();
  assert.deepEqual(result.traversals, ["entry-0", "entry-1"]);
  assert.equal(result.forward.nativeClicks, 0);

  result.flushFrames();
  result.forward.click();
  assert.deepEqual(result.traversals, ["entry-0", "entry-1", "entry-3"]);
  assert.equal(result.forward.nativeClicks, 0);
});

test("marks a direction unavailable when it contains only duplicate destinations", () => {
  const source = fs.readFileSync(helperPath, "utf8");
  const result = runHelper(source);
  const pageA = "https://roamresearch.com/#/app/exuberantia/page/a";

  result.navigation.setEntries([pageA, pageA, pageA], 2);
  result.navigation.emit("currententrychange");
  result.flushFrames();

  assert.equal(result.back.classList.contains("rm-history-unavailable"), true);
  const click = result.back.click();
  assert.equal(click.defaultPrevented, true);
  assert.deepEqual(result.traversals, []);
  assert.equal(result.back.nativeClicks, 0);
});

test("leaves Roam's native click untouched when semantic navigation is unavailable", () => {
  const source = fs.readFileSync(helperPath, "utf8");
  const result = runHelper(source);

  result.navigation.entries = undefined;
  result.rebuild();
  const click = result.forward.click();

  assert.equal(click.defaultPrevented, false);
  assert.equal(result.forward.nativeClicks, 1);
  assert.deepEqual(result.traversals, []);
});

test("falls back to Roam's native click when semantic traversal cannot start", () => {
  const source = fs.readFileSync(helperPath, "utf8");
  const result = runHelper(source);

  result.navigation.traverseTo = () => {
    throw new Error("Traversal unavailable");
  };
  const click = result.forward.click();

  assert.equal(click.defaultPrevented, false);
  assert.equal(result.forward.nativeClicks, 1);
  assert.deepEqual(result.traversals, []);
});

test("reapplies visual state when Roam rebuilds the top bar", () => {
  const source = fs.readFileSync(helperPath, "utf8");
  const result = runHelper(source);

  result.rebuild();
  assert.equal(result.back.classList.contains("rm-history-unavailable"), true);
  assert.equal(result.forward.classList.contains("rm-history-unavailable"), false);

  result.forward.click();
  assert.deepEqual(result.traversals, ["entry-1"]);
  assert.equal(result.forward.nativeClicks, 0);
});

test("ignores unrelated Roam mutations and never polls", () => {
  const source = fs.readFileSync(helperPath, "utf8");
  const result = runHelper(source);
  const unrelatedBlock = {
    nodeType: 1,
    matches: () => false,
    querySelector: () => null,
  };

  result.triggerMutation([unrelatedBlock]);
  assert.equal(result.pendingFrames, 0);
  assert.doesNotMatch(source, /setInterval|setTimeout/);
});

test("destroy removes visual state and all helper observers", () => {
  const source = fs.readFileSync(helperPath, "utf8");
  const result = runHelper(source);

  result.window.__roamHistoryAvailability.destroy();
  assert.equal(result.back.classList.contains("rm-history-unavailable"), false);
  assert.equal(result.forward.classList.contains("rm-history-unavailable"), false);
  assert.equal("__roamHistoryAvailability" in result.window, false);
  assert.equal(result.observers.every((observer) => !observer.connected), true);

  result.forward.click();
  assert.equal(result.forward.nativeClicks, 1, "destroy restores the native click");
});

test("the bundled first module keeps the same visual behavior", () => {
  const bundle = fs.readFileSync(bundlePath, "utf8");
  const firstHeader = bundle.indexOf(" * Module 01");
  const secondHeader = bundle.indexOf(" * Module 02");
  const firstBody = bundle.indexOf("*/", firstHeader) + 2;
  const secondSeparator = bundle.lastIndexOf("/* -----", secondHeader);

  assert.ok(firstHeader >= 0 && secondHeader > firstHeader);
  assert.ok(secondSeparator > firstBody);
  const firstModule = bundle.slice(firstBody, secondSeparator).trim();
  assert.equal(firstModule, fs.readFileSync(helperPath, "utf8").trim());
  const result = runHelper(firstModule);
  assert.equal(result.destroyed, 1);
  assert.equal(result.back.classList.contains("rm-history-unavailable"), true);
  assert.equal(result.forward.classList.contains("rm-history-unavailable"), false);
});

test("history styling supports the visual hint without blocking clicks", () => {
  const stylesheet = fs.readFileSync(stylesheetPath, "utf8");
  const start = stylesheet.indexOf("/* Match Electron history icons");
  const end = stylesheet.indexOf("\n\n/* ----------", start);
  const module = stylesheet.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(module, /:disabled/);
  assert.match(module, /\[aria-disabled="true"\]/);
  assert.match(module, /rm-history-unavailable/);
  assert.doesNotMatch(module, /pointer-events/);
});
