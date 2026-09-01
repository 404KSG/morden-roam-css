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

test("reference sidebar blocks keep the 15px view and editor geometry contract", () => {
  const css = fs.readFileSync(stylesheetPath, "utf8");
  const referenceView = ".rm-sidebar-window .rm-block__input--view";
  const referenceStaticBlock = ".rm-sidebar-window .roam-block.dont-unfocus-block";
  const referenceBullet = ".rm-sidebar-window .rm-bullet__inner";

  const geometry = ruleContaining(css, referenceView);
  assert.match(geometry.prelude, /\.roam-article \.rm-block__input--view/);
  assert.match(geometry.prelude, /\.rm-sidebar-outline \.rm-block__input--view/);
  assert.match(geometry.prelude, new RegExp(referenceStaticBlock.replaceAll(".", "\\.")));
  assert.match(geometry.body, /line-height:\s*23px\s*!important/);
  assert.match(geometry.body, /min-height:\s*31px\s*!important/);

  const paint = ruleContaining(css, referenceView, 1);
  assert.match(paint.body, /transform:\s*translateY\(0\.5px\)\s*!important/);

  const bullet = ruleContaining(css, referenceBullet);
  assert.match(bullet.body, /top:\s*1\.125px\s*!important/);

  const active = ruleContaining(css, ".rm-sidebar-window .rm-block__input--active");
  assert.match(active.body, /line-height:\s*23px\s*!important/);
  assert.match(active.body, /min-height:\s*31px\s*!important/);

  assert.match(css, /font-size:\s*15px\s*;/);
  assert.doesNotMatch(css, /font-size:\s*15\.5px\s*;/);
  assert.doesNotMatch(css, /\.rm-sidebar-window \.rm-reference-container \.rm-block__input--view/);
});

test("page and block-reference counts share one integer-pixel geometry contract", () => {
  const css = fs.readFileSync(stylesheetPath, "utf8");
  const count = ruleContaining(css, ".roam-app sup:is(");
  const blockCount = ruleContaining(css, ".roam-app sup.rm-block__ref-count-footnote");
  const blockCountHover = ruleContaining(
    css,
    ".roam-app sup.rm-block__ref-count-footnote:hover",
  );

  assert.match(css, /--rr-reference-count-size:\s*12px/);
  assert.match(css, /--rr-reference-count-offset:\s*-3px/);
  assert.match(count.prelude, /\.ref-count-visible/);
  assert.match(count.prelude, /\.ref-count-hidden/);
  assert.match(count.prelude, /\.rm-block__ref-count-footnote/);
  assert.match(
    count.body,
    /font-size:\s*var\(--rr-reference-count-size\)\s*!important/,
  );
  assert.match(
    count.body,
    /top:\s*var\(--rr-reference-count-offset\)\s*!important/,
  );
  assert.match(count.body, /line-height:\s*0\s*!important/);
  assert.match(count.body, /vertical-align:\s*baseline\s*!important/);
  assert.match(count.body, /font-variant-numeric:\s*tabular-nums/);
  assert.match(count.body, /transition:\s*color 100ms ease, opacity 100ms ease\s*!important/);
  assert.match(blockCount.body, /color:\s*var\(--rr-block-reference-count-color\)\s*!important/);
  assert.match(
    blockCount.body,
    /opacity:\s*var\(--rr-block-reference-count-opacity\)\s*!important/,
  );
  assert.match(blockCountHover.body, /opacity:\s*1\s*!important/);
  assert.doesNotMatch(
    css,
    /\.rm-block__input--view:has\(sup:is\(\.ref-count-visible, \.ref-count-hidden\)/,
  );
});
