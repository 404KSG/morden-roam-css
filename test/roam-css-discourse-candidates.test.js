const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");

const stylesheet = readFileSync(
  new URL("../roam.css", `file://${__dirname}/`),
  "utf8",
);
const moduleStart = stylesheet.indexOf(
  "/* --------------------------------------------------------------------------\n * Module 35",
);

assert.notEqual(moduleStart, -1, "Discourse Graph candidate module should exist");

const css = stylesheet.slice(moduleStart);

function ruleContaining(source, selector, occurrence = 0) {
  let index = -1;
  for (let match = 0; match <= occurrence; match += 1) {
    index = source.indexOf(selector, index + 1);
  }
  assert.notEqual(index, -1, `missing selector: ${selector}`);
  const open = source.indexOf("{", index);
  const close = source.indexOf("}", open);
  assert.ok(open > index && close > open, `incomplete rule for: ${selector}`);
  return source.slice(open + 1, close);
}

// Live Literature Notes CSS ((4SQIvL090)) raw :block/string, 2026-09-11.
// Color-only candidate restyle; do not assert against the older repo Module 33.
const LIVE_LITERATURE_GEOMETRY = {
  uid: "4SQIvL090",
  source: "exuberantia roam/css datalog :block/string",
  rest: [
    "display: inline-flex !important;",
    "top: 0 !important;",
    "height: 22px !important;",
    "min-height: 22px !important;",
    "max-height: 22px !important;",
    "margin: 0 1px !important;",
    "padding: 1px 7px !important;",
    "border-radius: 6px !important;",
    "font-size: 14px !important;",
    "line-height: 18px !important;",
    "font-weight: 700 !important;",
    "overflow: visible !important;",
  ],
};

const candidates = [
  {
    tag: "clm-candidate",
    fg: "#7C3AED",
    fillStart: "#f5f3ff",
    fillEnd: "#ede9fe",
    border: "#ddd6fe",
    shadow: "rgba(124, 58, 237, 0.08)",
  },
  {
    tag: "que-candidate",
    fg: "#C2410C",
    fillStart: "#fff7ed",
    fillEnd: "#ffedd5",
    border: "#fed7aa",
    shadow: "rgba(194, 65, 12, 0.08)",
  },
  {
    tag: "evd-candidate",
    fg: "#0284C7",
    fillStart: "#f0f9ff",
    fillEnd: "#dbeafe",
    border: "#bae6fd",
    shadow: "rgba(2, 132, 199, 0.08)",
  },
  {
    tag: "src-candidate",
    fg: "#15803D",
    fillStart: "#f0fdf4",
    fillEnd: "#dcfce7",
    border: "#bbf7d0",
    shadow: "rgba(21, 128, 61, 0.08)",
  },
];

test("four candidate colors reuse the live Literature Notes token shape", () => {
  for (const candidate of candidates) {
    const tokens = ruleContaining(
      css,
      `span.rm-page-ref.rm-page-ref--tag[data-tag="${candidate.tag}"]`,
    );
    assert.equal(
      tokens.includes(`--dg-candidate-fg: ${candidate.fg};`),
      true,
      `${candidate.tag} foreground`,
    );
    assert.equal(
      tokens.includes(`--dg-candidate-fill-start: ${candidate.fillStart};`),
      true,
      `${candidate.tag} fill start`,
    );
    assert.equal(
      tokens.includes(`--dg-candidate-fill-end: ${candidate.fillEnd};`),
      true,
      `${candidate.tag} fill end`,
    );
    assert.equal(
      tokens.includes(`--dg-candidate-border: ${candidate.border};`),
      true,
      `${candidate.tag} border`,
    );
    assert.equal(
      tokens.includes(`--dg-candidate-shadow: ${candidate.shadow};`),
      true,
      `${candidate.tag} shadow`,
    );
  }

  const evdTokens = ruleContaining(
    css,
    'span.rm-page-ref.rm-page-ref--tag[data-tag="evd-candidate"]',
  );
  assert.equal(evdTokens.includes("--dg-candidate-fg: #0284C7;"), true);
  assert.equal(evdTokens.includes("--dg-candidate-border: #bae6fd;"), true);
  assert.equal(evdTokens.includes("--dg-candidate-fill-start: #f0f9ff;"), true);
  assert.equal(evdTokens.includes("--dg-candidate-fill-end: #dbeafe;"), true);
  assert.equal(evdTokens.includes("--dg-candidate-hover-start: #e0f2fe;"), true);
  assert.equal(evdTokens.includes("--dg-candidate-hover-end: #bfdbfe;"), true);
  assert.equal(
    evdTokens.includes("--dg-candidate-shadow: rgba(2, 132, 199, 0.08);"),
    true,
  );
  assert.equal(
    evdTokens.includes("--dg-candidate-shadow-hover: rgba(2, 132, 199, 0.12);"),
    true,
  );
});

test("candidate badges reuse live Literature Notes geometry from 4SQIvL090", () => {
  const rest = ruleContaining(
    css,
    'span.rm-page-ref.rm-page-ref--tag[data-tag="clm-candidate"],\nspan.rm-page-ref.rm-page-ref--tag[data-tag="que-candidate"],',
  );

  assert.equal(LIVE_LITERATURE_GEOMETRY.uid, "4SQIvL090");
  for (const property of LIVE_LITERATURE_GEOMETRY.rest) {
    assert.equal(rest.includes(property), true, property);
  }

  assert.match(rest, /background: linear-gradient\(/);
  assert.doesNotMatch(rest, /border-radius:\s*12px/);
  assert.doesNotMatch(rest, /border-radius:\s*999px/);
  assert.doesNotMatch(rest, /top: 0\.75px/);
  assert.doesNotMatch(rest, /min-height: 21\.5px/);
  assert.doesNotMatch(rest, /line-height: 17\.5px/);
  assert.doesNotMatch(rest, /font-weight: 600/);
  assert.doesNotMatch(css, /content:\s*["'][^"']*["']/);
});

test("hover, focus, and active keep the 22px live geometry", () => {
  const hover = ruleContaining(
    css,
    'span.rm-page-ref.rm-page-ref--tag[data-tag="clm-candidate"]:is(:hover, :focus, :focus-visible, :active),',
  );
  const focusVisible = ruleContaining(
    css,
    'span.rm-page-ref.rm-page-ref--tag[data-tag="clm-candidate"]:focus-visible,',
  );

  for (const property of [
    "height: 22px !important;",
    "min-height: 22px !important;",
    "max-height: 22px !important;",
    "margin: 0 1px !important;",
    "padding: 1px 7px !important;",
    "border-radius: 6px !important;",
    "font-size: 14px !important;",
    "line-height: 18px !important;",
    "font-weight: 700 !important;",
    "transform: none !important;",
  ]) {
    assert.equal(hover.includes(property), true, property);
  }

  for (const property of [
    "height: 22px !important;",
    "min-height: 22px !important;",
    "max-height: 22px !important;",
    "margin: 0 1px !important;",
    "padding: 1px 7px !important;",
    "border-radius: 6px !important;",
    "transform: none !important;",
  ]) {
    assert.equal(focusVisible.includes(property), true, property);
  }

  assert.equal(hover.includes("\n  top:"), false);
  assert.equal(focusVisible.includes("\n  top:"), false);
  assert.match(focusVisible, /0 0 0 2px color-mix/);
});

test("selectors stay exact and do not restyle other notes or formal nodes", () => {
  assert.match(
    css,
    /span\.rm-page-ref\.rm-page-ref--tag\[data-tag="clm-candidate"\]/,
  );
  assert.match(
    css,
    /span\.rm-page-ref\.rm-page-ref--tag\[data-tag="que-candidate"\]/,
  );
  assert.match(
    css,
    /span\.rm-page-ref\.rm-page-ref--tag\[data-tag="evd-candidate"\]/,
  );
  assert.match(
    css,
    /span\.rm-page-ref\.rm-page-ref--tag\[data-tag="src-candidate"\]/,
  );

  assert.doesNotMatch(css, /data-tag\*=/);
  assert.doesNotMatch(css, /data-tag\^=/);
  assert.doesNotMatch(css, /data-tag\$=/);
  assert.doesNotMatch(css, /:nth-(?:child|of-type)/);
  assert.doesNotMatch(
    css,
    /\[data-tag="(?:Literature|Fleeting|Instant|Evergreen|Project|Plateau|Relevant) Notes"\]/,
  );
  assert.doesNotMatch(
    css,
    /\[data-tag="(?:CLM|QUE|EVD|SRC|Claim|Question|Evidence|Source)"\]/,
  );
  assert.doesNotMatch(css, /rm-page-ref--link/);
});

test("menu dots map to the same candidate colors and leave selected state alone", () => {
  for (const candidate of candidates) {
    const body = ruleContaining(
      css,
      `.bp3-menu-item[data-tag="${candidate.tag}"] .bp3-icon > div,`,
    );
    assert.equal(
      body.includes(`background-color: ${candidate.fg} !important;`),
      true,
      candidate.tag,
    );
    assert.equal(
      css.includes(
        `.bp3-menu-item[data-tag="${candidate.tag}"] .rounded-full`,
      ),
      true,
      `${candidate.tag} rounded-full`,
    );
  }

  assert.doesNotMatch(css, /\.bp3-menu-item\.bp3-active/);
  assert.doesNotMatch(css, /\.bp3-active\s*\{/);
  assert.doesNotMatch(css, /nth-child\(\d+\)/);
});

const OVERLAY_FIXTURE = readFileSync(
  new URL("./fixtures/dg-candidate-overlay.html", `file://${__dirname}/`),
  "utf8",
);

function wrapperHoverMapsPaint(tag) {
  return (
    `span:has(> span.rm-page-ref.rm-page-ref--tag[data-tag="${tag}"]):is(:hover, :focus-within)\n` +
    `  > span.rm-page-ref.rm-page-ref--tag[data-tag="${tag}"]`
  );
}

test("DG overlay hover paints the candidate without inner :hover or killing pointer-events", () => {
  assert.match(OVERLAY_FIXTURE, /pointer-events:auto/);
  assert.match(OVERLAY_FIXTURE, /data-tag="clm-candidate"/);
  assert.match(OVERLAY_FIXTURE, /bp3-popover-target/);

  // Overlay is the hit target; inner candidate.matches(':hover') stays false.
  // Paint must come from wrapper:has(> candidate):hover, not from forcing inner :hover.
  for (const candidate of candidates) {
    assert.equal(
      css.includes(wrapperHoverMapsPaint(candidate.tag)),
      true,
      `${candidate.tag} wrapper hover mapping`,
    );
    assert.match(
      css,
      new RegExp(
        `span\\.rm-page-ref\\.rm-page-ref--tag\\[data-tag="${candidate.tag}"\\]:is\\(:hover, :focus, :focus-visible, :active\\)`,
      ),
    );
  }

  const hover = ruleContaining(
    css,
    'span.rm-page-ref.rm-page-ref--tag[data-tag="clm-candidate"]:is(:hover, :focus, :focus-visible, :active),',
  );
  assert.match(hover, /--dg-candidate-hover-start/);
  assert.match(hover, /height: 22px !important;/);
  assert.doesNotMatch(css, /pointer-events:\s*none/);
  assert.doesNotMatch(css, /pointer-events:\s*auto/);
});
