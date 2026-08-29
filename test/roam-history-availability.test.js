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
  let clicks = 0;

  return {
    nodeType: 1,
    selector,
    classList: {
      contains: (name) => classes.has(name),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      toggle: (name, force) => {
        if (force) classes.add(name);
        else classes.delete(name);
      },
    },
    click: () => {
      clicks += 1;
    },
    closest: () => null,
    matches: (value) => value.split(", ").includes(selector),
    querySelector: () => null,
    get clicks() {
      return clicks;
    },
  };
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
  const app = {
    isConnected: true,
    nodeType: 1,
    matches: () => false,
    querySelector: (selector) => {
      if (selector === buttonSelector) return back || forward;
      return null;
    },
  };
  const navigation = {
    canGoBack: false,
    canGoForward: true,
    addEventListener(type, listener) {
      navigationListeners.set(type, listener);
    },
    emit(type) {
      navigationListeners.get(type)?.();
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

test("uses the Navigation API only as a visual availability signal", () => {
  const source = fs.readFileSync(helperPath, "utf8");
  const result = runHelper(source);

  assert.equal(result.destroyed, 1, "the previous listener is stopped once");
  assert.equal(result.back.classList.contains("rm-history-unavailable"), true);
  assert.equal(result.forward.classList.contains("rm-history-unavailable"), false);

  result.back.click();
  assert.equal(result.back.clicks, 1, "the native first click remains untouched");

  result.navigation.canGoBack = true;
  result.navigation.canGoForward = false;
  result.navigation.emit("currententrychange");
  result.flushFrames();
  assert.equal(result.back.classList.contains("rm-history-unavailable"), false);
  assert.equal(result.forward.classList.contains("rm-history-unavailable"), true);
});

test("reapplies visual state when Roam rebuilds the top bar", () => {
  const source = fs.readFileSync(helperPath, "utf8");
  const result = runHelper(source);

  result.rebuild();
  assert.equal(result.back.classList.contains("rm-history-unavailable"), true);
  assert.equal(result.forward.classList.contains("rm-history-unavailable"), false);
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
});

test("the bundled first module keeps the same visual behavior", () => {
  const bundle = fs.readFileSync(bundlePath, "utf8");
  const firstHeader = bundle.indexOf(" * Module 01");
  const secondHeader = bundle.indexOf(" * Module 02");
  const firstBody = bundle.indexOf("*/", firstHeader) + 2;
  const secondSeparator = bundle.lastIndexOf("/* -----", secondHeader);

  assert.ok(firstHeader >= 0 && secondHeader > firstHeader);
  assert.ok(secondSeparator > firstBody);
  const result = runHelper(bundle.slice(firstBody, secondSeparator));
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
