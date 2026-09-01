const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const stylesheetPath = path.join(__dirname, "..", "roam.css");

function ruleContaining(css, selector, occurrence = 0) {
  let index = -1;
  for (let match = 0; match <= occurrence; match += 1) {
    index = css.indexOf(selector, index + 1);
  }
  assert.notEqual(index, -1, `missing selector: ${selector}`);
  const open = css.indexOf("{", index);
  const close = css.indexOf("}", open);
  assert.ok(open > index && close > open, `incomplete rule for: ${selector}`);
  return {
    prelude: css.slice(css.lastIndexOf("}", index) + 1, open),
    body: css.slice(open + 1, close),
  };
}

test("linked-reference checkbox restores Roam's native offset locally", () => {
  const css = fs.readFileSync(stylesheetPath, "utf8");
  const scopedSelector =
    ".rm-ref-page-view .rm-block__input--view .check-container";
  const breadcrumbSelector =
    ".rm-reference-container .rm-zoom-item-content .check-container";
  const scoped = ruleContaining(css, scopedSelector);
  const breadcrumb = ruleContaining(css, breadcrumbSelector);

  assert.match(scoped.body, /position:\s*relative\s*!important/);
  assert.match(scoped.body, /top:\s*1px\s*!important/);
  assert.match(breadcrumb.prelude, new RegExp(scopedSelector.replaceAll(".", "\\.")));
  assert.match(breadcrumb.body, /position:\s*relative\s*!important/);
  assert.match(breadcrumb.body, /top:\s*1px\s*!important/);
  assert.doesNotMatch(
    scoped.body,
    /(?:width|height|min-height|line-height|margin|padding|transform|vertical-align)\s*:/,
  );
  assert.doesNotMatch(
    breadcrumb.body,
    /(?:width|height|min-height|line-height|margin|padding|transform|vertical-align)\s*:/,
  );

  const global = ruleContaining(css, ".check-container");
  assert.match(global.body, /top:\s*0\s*;/);
  assert.match(css, /\.checkmark\s*\{[\s\S]*?transform:\s*scale\(1\.2\)/);
  assert.doesNotMatch(
    css,
    /\.rm-block__input--active[^{}]*\.check-container\s*\{/,
  );
  assert.doesNotMatch(
    css,
    /\.roam-article \.rm-block__input--view \.check-container\s*\{/,
  );
});
