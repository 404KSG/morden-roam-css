const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");

const stylesheet = readFileSync(
  new URL("../roam.css", `file://${__dirname}/`),
  "utf8",
);
const moduleStart = stylesheet.indexOf(
  "/* --------------------------------------------------------------------------\n * Module 28",
);
const moduleEnd = stylesheet.indexOf(
  "/* --------------------------------------------------------------------------\n * Module 29",
  moduleStart,
);

assert.notEqual(moduleStart, -1, "Relevant Notes module should exist");
assert.notEqual(moduleEnd, -1, "Relevant Notes module should have an end");

const css = stylesheet.slice(moduleStart, moduleEnd);

test("standalone Relevant Notes is a complete capsule", () => {
  assert.match(
    css,
    /padding: 1px 8px !important;\n  border: 1px solid #dde1e7 !important;\n  border-right: 1px solid #dde1e7 !important;\n  border-radius: 6px !important;/,
  );
  assert.match(
    css,
    /span\.rm-page-ref\[data-tag="Relevant Notes"\]::after \{\n  content: none !important;\n  display: none !important;\n\}/,
  );
  assert.match(
    css,
    /span\.rm-page-ref\[data-tag="Relevant Notes"\]:focus-visible \{\n  box-shadow: inset 0 0 0 1px/,
  );
});

test("only a real linked target opens the composite seam", () => {
  assert.doesNotMatch(
    css,
    /span\.rm-page-ref\[data-tag="Relevant Notes"\] \+ span \{\n  display: none !important;/,
  );
  assert.match(
    css,
    /span\.rm-page-ref\[data-tag="Relevant Notes"\]:has\(\n    \+ span \+ span\[data-link-title\]\n  \)\n  \+ span \{\n  display: none !important;/,
  );
  assert.match(
    css,
    /Open the right seam only when a dynamic linked target is present\.[\s\S]*?padding: 1px 3px 1px 8px !important;\n  border-right: 0 !important;\n  border-radius: 6px 0 0 6px !important;/,
  );
  assert.match(
    css,
    /span\.rm-page-ref\[data-tag="Relevant Notes"\]:has\([\s\S]*?\)::after \{\n  content: "›" !important;/,
  );
});

test("interaction states preserve the existing 22px baseline geometry", () => {
  assert.doesNotMatch(css, /vertical-align: middle/);
  assert.match(css, /height: 22px !important;/);
  assert.match(css, /font-size: 14px !important;/);
  assert.match(css, /line-height: 18px !important;/);
  assert.match(css, /transition: none !important;/);

  const hoverRule = css.match(
    /\/\* Paint-only hover:[\s\S]*?\*\/([\s\S]*?)\/\* Inset keyboard focus/,
  );
  assert.ok(hoverRule, "paint-only hover section should exist");
  assert.doesNotMatch(
    hoverRule[1],
    /\b(?:height|padding|margin|border-radius|top|transform):/,
  );
});
