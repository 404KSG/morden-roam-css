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
const output = resolve(getArgument("--output") ?? "roam.js");

if (!graph || !uid) {
  console.error(
    "Usage: node scripts/export-javascript.mjs --graph <graph> --uid <js-root-uid> [--output roam.js]",
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
  { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
);

const { markdown } = JSON.parse(response);

// Some CLI responses store every code-block line break as a literal `\\n`
// sequence. Decode those separators only for a fence that has no physical
// line breaks, and only outside quoted JavaScript strings. This keeps real
// escapes such as `"\\n"` inside the source intact.
const decodeEscapedLineBreaks = (source) => {
  let output = "";
  let quote = null;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (quote) {
      output += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      output += character;
    } else if (character === "\\" && source[index + 1] === "n") {
      output += "\n";
      index += 1;
    } else {
      output += character;
    }
  }

  return output;
};

const markdownText = String(markdown ?? "");
const blocks = [];
const openingFence = /```(?:javascript|js)(?:\\n|\r?\n)/g;
let openingMatch;

while ((openingMatch = openingFence.exec(markdownText))) {
  const bodyStart = openingFence.lastIndex;
  const closingFence = markdownText.indexOf("```", bodyStart);
  if (closingFence === -1) break;

  const rawBody = markdownText.slice(bodyStart, closingFence);
  const body = rawBody.includes("\n")
    ? rawBody
    : decodeEscapedLineBreaks(rawBody);

  blocks.push(
    body
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .join("\n")
      .trim(),
  );
  openingFence.lastIndex = closingFence + 3;
}

if (blocks.length === 0) {
  console.error("No JavaScript code blocks were found under the supplied Roam block.");
  process.exit(1);
}

const header = [
  "/*",
  " * Morden Roam JS",
  ` * Generated from ${blocks.length} active JavaScript blocks in Roam Research.`,
  " * Source order is preserved so later modules can build on earlier helpers.",
  " */",
].join("\n");

const script = [
  header,
  ...blocks.map(
    (block, index) =>
      `/* --------------------------------------------------------------------------\n * Module ${String(index + 1).padStart(2, "0")}\n * -------------------------------------------------------------------------- */\n${block}`,
  ),
].join("\n\n") + "\n";

writeFileSync(output, script, "utf8");
console.log(`Exported ${blocks.length} JavaScript blocks to ${output}`);
