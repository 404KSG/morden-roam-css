const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const bundle = fs.readFileSync(path.join(__dirname, "..", "roam.js"), "utf8");
const source = bundle.match(/\(\(\) => \{\n  const KEY = "__rrRoamScroll";[\s\S]*?\n\}\)\(\);/)[0];
const deskSelector = ".roam-body-main > .rm-article-wrapper:has(> .roam-article > .rm-desk-page)";

function fixture({ scrollEnd = true } = {}) {
  const nodes = [], observers = [], frames = new Map(), timers = new Map();
  const listeners = new Map();
  let nextId = 0;
  class Element {
    constructor(id = "") {
      this.id = id;
      this.isConnected = true;
      this.offsetWidth = 600;
      this.clientWidth = 596;
      const classes = new Set(), properties = new Map();
      this.classList = {
        add: (...names) => names.forEach((name) => classes.add(name)),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
        contains: (name) => classes.has(name),
      };
      this.style = {
        getPropertyValue: (name) => properties.get(name) || "",
        setProperty: (name, value) => properties.set(name, value),
        removeProperty: (name) => properties.delete(name),
      };
      nodes.push(this);
    }
    matches(selector) {
      return selector.startsWith("#") ? this.id === selector.slice(1) :
        selector.startsWith(".") && this.classList.contains(selector.slice(1));
    }
    querySelector() { return null; }
    remove() { this.isConnected = false; }
  }
  const right = new Element("roam-right-sidebar-content");
  const desk = new Element("desk-fixture");
  const nested = new Element("nested-fixture");
  const body = new Element("body-fixture");
  class Observer {
    constructor(callback) { this.callback = callback; this.connected = false; observers.push(this); }
    observe(target) { this.target = target; this.connected = true; }
    disconnect() { this.connected = false; }
    trigger(records = []) { if (this.connected) this.callback(records); }
  }
  const document = {
    body,
    head: { appendChild: (node) => { node.isConnected = true; } },
    getElementById: (id) => nodes.find((node) => node.isConnected && node.id === id) || null,
    createElement: () => new Element(),
    querySelector: (selector) => nodes.find((node) => node.isConnected && node.matches(selector)) || null,
    querySelectorAll: (selector) => nodes.filter((node) => node.isConnected && node.matches(selector)),
    documentElement: body,
    scrollingElement: body,
  };
  if (scrollEnd) document.onscrollend = null;
  const window = {
    addEventListener(type, fn, { signal }) {
      const handlers = listeners.get(type) || new Set();
      handlers.add(fn); listeners.set(type, handlers);
      signal.addEventListener("abort", () => handlers.delete(fn), { once: true });
    },
    requestAnimationFrame(fn) { const id = ++nextId; frames.set(id, fn); return id; },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout(fn) { const id = ++nextId; timers.set(id, fn); return id; },
    clearTimeout: (id) => timers.delete(id),
  };
  const context = vm.createContext({ window, document, Element, HTMLElement: Element,
    AbortController, MutationObserver: Observer, ResizeObserver: Observer, console: { info() {} } });
  const run = () => vm.runInContext(source, context);
  run();
  const drain = (queue) => { const callbacks = [...queue.values()]; queue.clear(); callbacks.forEach((fn) => fn()); };
  return { window, document, right, desk, nested, nodes, observers, frames, timers, listeners, run,
    emit(type, target) { for (const fn of listeners.get(type) || []) fn({ target }); },
    flushFrames: () => drain(frames),
    flushTimers: () => drain(timers),
    get css() { return document.getElementById("unified-precise-scrollbar-style")?.textContent || ""; },
  };
}

test("Desk receives scoped stable geometry before any scroll event", () => {
  const f = fixture();
  assert.ok(f.css.includes(deskSelector + " {\n  scrollbar-gutter: stable;\n}"));
  assert.ok(f.css.includes(`:is(.rr-scrollbar-managed, :where(${deskSelector}))::-webkit-scrollbar {`));
  assert.match(f.css, /width: var\(--sb-w\) !important;/);
  assert.match(f.css, /height: var\(--sb-w\) !important;/);
  assert.match(f.css, /--sb-w: 4px;/);
  assert.equal(f.desk.classList.contains("rr-scrollbar-managed"), false, "CSS, not a new eager observer, establishes geometry");
  assert.equal(f.right.classList.contains("rr-scrollbar-managed"), true);
  assert.equal(f.right.style.getPropertyValue("--rr-scrollbar-slot"), "4px");
});

test("first scroll paints the thumb, then scrollend hides only its activity class", () => {
  const f = fixture();
  f.emit("scroll", f.desk);
  assert.equal(f.desk.classList.contains("rr-scrollbar-managed"), true);
  assert.equal(f.desk.classList.contains("is-scrolling-local"), false);
  f.flushFrames();
  assert.equal(f.desk.classList.contains("is-scrolling-local"), true);
  f.emit("scrollend", f.desk); f.flushTimers();
  assert.equal(f.desk.classList.contains("is-scrolling-local"), false);
  assert.equal(f.desk.classList.contains("rr-scrollbar-managed"), true);
  assert.equal(f.desk.style.getPropertyValue("--rr-scrollbar-slot"), "");
});

test("the fallback timer still hides the thumb without scrollend support", () => {
  const f = fixture({ scrollEnd: false });
  f.emit("scroll", f.desk); f.flushFrames(); f.flushTimers();
  assert.equal(f.desk.classList.contains("is-scrolling-local"), false);
  assert.equal(f.desk.classList.contains("rr-scrollbar-managed"), true);
});

test("nested scroll events do not activate or compensate the outer Desk", () => {
  const f = fixture();
  f.emit("scroll", f.nested); f.flushFrames();
  assert.equal(f.nested.classList.contains("is-scrolling-local"), true);
  assert.equal(f.desk.classList.contains("rr-scrollbar-managed"), false);
  assert.equal(f.desk.style.getPropertyValue("--rr-scrollbar-slot"), "");
});

test("right-sidebar resizing retains its single-target slot compensation", () => {
  const f = fixture();
  f.right.clientWidth = 593;
  f.observers.find((observer) => observer.target === f.right).trigger();
  f.flushFrames();
  assert.equal(f.right.style.getPropertyValue("--rr-scrollbar-slot"), "7px");
  assert.equal(f.desk.style.getPropertyValue("--rr-scrollbar-slot"), "");
});

test("destroy clears owned styles, classes, listeners, frames, timers and slot", () => {
  const f = fixture();
  f.emit("scroll", f.desk); f.emit("scrollend", f.desk);
  f.window.__rrRoamScroll.destroy();
  assert.equal(f.css, "");
  assert.equal(f.window.__rrRoamScroll, undefined);
  assert.equal(f.frames.size, 0); assert.equal(f.timers.size, 0);
  assert.equal(f.observers.every((observer) => !observer.connected), true);
  assert.equal([...f.listeners.values()].every((handlers) => !handlers.size), true);
  assert.equal(f.right.style.getPropertyValue("--rr-scrollbar-slot"), "");
  for (const node of f.nodes) {
    assert.equal(node.classList.contains("rr-scrollbar-managed"), false);
    assert.equal(node.classList.contains("is-scrolling-local"), false);
    assert.equal(node.style.getPropertyValue("scrollbar-gutter"), "");
  }
});

test("reinjection replaces the previous helper instead of accumulating resources", () => {
  const f = fixture(); f.run();
  assert.equal(f.nodes.filter((node) => node.isConnected && node.id === "unified-precise-scrollbar-style").length, 1);
  assert.equal(f.listeners.get("scroll").size, 1);
  assert.equal(f.listeners.get("scrollend").size, 1);
  assert.equal(f.observers.filter((observer) => observer.connected).length, 2);
});
