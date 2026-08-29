const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const helperPath = path.join(root, "roam-history-availability.js");
const bundlePath = path.join(root, "roam.js");
const stylesheetPath = path.join(root, "roam.css");

const makeButton = () => {
  const classes = new Set(["rm-history-unavailable"]);
  let clicks = 0;

  return {
    classList: {
      contains: (name) => classes.has(name),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
    },
    click: () => {
      clicks += 1;
    },
    get clicks() {
      return clicks;
    },
  };
};

const runHelper = (source) => {
  const back = makeButton();
  const forward = makeButton();
  let destroyed = 0;
  const window = {
    __roamHistoryAvailability: {
      destroy: () => {
        destroyed += 1;
      },
    },
  };

  Object.defineProperty(window, "navigation", {
    get() {
      throw new Error("The helper must not read the renderer Navigation API");
    },
  });

  const document = {
    querySelectorAll(selector) {
      assert.equal(selector, ".rm-history-unavailable");
      return [back, forward];
    },
  };

  vm.runInNewContext(source, { document, window });
  return { back, destroyed, forward, window };
};

test("retires the legacy state helper without touching native navigation", () => {
  const source = fs.readFileSync(helperPath, "utf8");
  const result = runHelper(source);

  assert.equal(result.destroyed, 1, "the previous listener is stopped once");
  assert.equal(result.back.classList.contains("rm-history-unavailable"), false);
  assert.equal(result.forward.classList.contains("rm-history-unavailable"), false);
  assert.equal("__roamHistoryAvailability" in result.window, false);

  result.back.click();
  assert.equal(result.back.clicks, 1, "the native first click remains untouched");
});

test("the bundled first module keeps the same compatibility behavior", () => {
  const bundle = fs.readFileSync(bundlePath, "utf8");
  const firstHeader = bundle.indexOf(" * Module 01");
  const secondHeader = bundle.indexOf(" * Module 02");
  const firstBody = bundle.indexOf("*/", firstHeader) + 2;
  const secondSeparator = bundle.lastIndexOf("/* -----", secondHeader);

  assert.ok(firstHeader >= 0 && secondHeader > firstHeader);
  assert.ok(secondSeparator > firstBody);
  const result = runHelper(bundle.slice(firstBody, secondSeparator));
  assert.equal(result.destroyed, 1);
  assert.equal(result.back.classList.contains("rm-history-unavailable"), false);
  assert.equal(result.forward.classList.contains("rm-history-unavailable"), false);
  assert.equal("__roamHistoryAvailability" in result.window, false);
});

test("history styling follows only native disabled signals", () => {
  const stylesheet = fs.readFileSync(stylesheetPath, "utf8");
  const start = stylesheet.indexOf("/* Match Electron history icons");
  const end = stylesheet.indexOf("\n\n/* ----------", start);
  const module = stylesheet.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(module, /:disabled/);
  assert.match(module, /\[aria-disabled="true"\]/);
  assert.doesNotMatch(module, /rm-history-unavailable/);
  assert.doesNotMatch(module, /pointer-events/);
});
