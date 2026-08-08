#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const getArgument = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const graph = getArgument("--graph");
const uid = getArgument("--uid");
const output = resolve(getArgument("--output") ?? "roam.css");

if (!graph || !uid) {
  console.error(
    "Usage: node scripts/export-theme.mjs --graph <graph> --uid <theme-block-uid> [--output roam.css]",
  );
  process.exit(1);
}

const response = execFileSync(
  "npx",
  [
    "-y",
    "@roam-research/roam-cli@latest",
    "get-block",
    "--uid",
    uid,
    "--graph",
    graph,
  ],
  { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
);

const { markdown } = JSON.parse(response);
const normalized = markdown.replaceAll("\\n", "\n");
const blocks = [...normalized.matchAll(/```css\n([\s\S]*?)```/g)].map(
  (match) =>
    match[1]
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .trim(),
);

if (blocks.length === 0) {
  console.error("No CSS code blocks were found under the supplied Roam block.");
  process.exit(1);
}

const header = `/*
 * Morden Roam CSS
 * Generated from ${blocks.length} active CSS blocks in Roam Research.
 * Source order is preserved so later rules retain their original precedence.
 */`;

const stylesheet = [
  header,
  ...blocks.map(
    (block, index) =>
      `/* --------------------------------------------------------------------------\n * Module ${String(index + 1).padStart(2, "0")}\n * -------------------------------------------------------------------------- */\n${block}`,
  ),
].join("\n\n") + "\n";

writeFileSync(output, stylesheet, "utf8");
console.log(`Exported ${blocks.length} CSS blocks to ${output}`);
