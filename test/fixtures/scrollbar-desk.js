const bundle = await fetch("../../roam.js").then((response) => response.text());
const helper = bundle.match(/\(\(\) => \{\n  const KEY = "__rrRoamScroll";[\s\S]*?\n\}\)\(\);/)[0];
const managed = "rr-scrollbar-managed", active = "is-scrolling-local";
const frame = () => new Promise(requestAnimationFrame);
const settle = async () => { await frame(); await frame(); };
const until = async (condition) => {
  const deadline = performance.now() + 4000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for scrollbar state");
    await frame();
  }
};
const load = (source = helper) => new Function(source)();
function mount({ width = 640, count = 40, desk = true } = {}) {
  const shell = document.createElement("div"); shell.className = "roam-body-main";
  const wrapper = document.createElement("div"); wrapper.className = "rm-article-wrapper";
  wrapper.style.width = `${width}px`;
  const article = document.createElement("div"); article.className = "roam-article";
  const page = document.createElement("div"); page.className = desk ? "rm-desk-page" : "roam-log-container";
  const grid = document.createElement("div"); grid.className = "rm-desk-overview";
  const fill = (total) => {
    grid.replaceChildren(...Array.from({ length: total }, (_, i) => {
      const card = document.createElement("div"); card.className = "rm-desk-tile";
      card.textContent = `Card ${i + 1}`; return card;
    }));
  };
  fill(count); page.append(grid); article.append(page); wrapper.append(article); shell.append(wrapper);
  document.getElementById("stage").replaceChildren(shell);
  return { shell, wrapper, article, page, grid, fill };
}
const metric = ({ wrapper, grid }) => ({
  client: wrapper.clientWidth,
  slot: wrapper.offsetWidth - wrapper.clientWidth,
  gutter: getComputedStyle(wrapper).scrollbarGutter,
  bar: getComputedStyle(wrapper, "::-webkit-scrollbar").width,
  scrollTop: wrapper.scrollTop,
  tiles: [...grid.children].map((node) => {
    const r = node.getBoundingClientRect();
    return [r.x, r.y + wrapper.scrollTop, r.width, r.height];
  }),
});
const same = (a, b) => a.client === b.client && a.slot === b.slot &&
  JSON.stringify(a.tiles) === JSON.stringify(b.tiles);
const scroll = async (target, y = 70) => {
  target.scrollTop = y;
  await until(() => target.classList.contains(active));
  await settle();
};
async function probe(source = helper) {
  window.__rrRoamScroll?.destroy();
  const scene = mount(); load(source); await settle();
  const before = metric(scene); await scroll(scene.wrapper); const after = metric(scene);
  return { before, after, clientDelta: after.client - before.client, stable: same(before, after) };
}
async function run() {
  const results = [];
  const check = (name, pass, details = {}) => results.push({ name, pass: Boolean(pass), ...details });
  for (const width of [320, 420, 600, 700, 960, 1064]) {
    window.__rrRoamScroll?.destroy();
    const scene = mount({ width }); load(); await settle();
    const before = metric(scene);
    check(`mount ${width}: final 4px slot`, before.slot === 4 && before.bar === "4px" && before.gutter === "stable", { slot: before.slot });
    check(`mount ${width}: activity remains lazy`, !scene.wrapper.classList.contains(managed));
    await scroll(scene.wrapper);
    check(`first scroll ${width}: no card reflow`, same(before, metric(scene)));
  }
  let scene = mount(); await settle();
  let before = metric(scene); await scroll(scene.wrapper);
  await until(() => !scene.wrapper.classList.contains(active)); await settle();
  check("auto-hide retains geometry and managed class", same(before, metric(scene)) && scene.wrapper.classList.contains(managed));
  const oldWrapper = scene.wrapper;
  scene = mount(); await settle(); before = metric(scene);
  check("re-entry gets a fresh node with reserved geometry", scene.wrapper !== oldWrapper && before.slot === 4 && !scene.wrapper.classList.contains(managed));
  await scroll(scene.wrapper);
  check("re-entry first scroll has no reflow", same(before, metric(scene)));

  scene = mount({ count: 1 });
  // Exercise auto overflow, not just the native view's current overflow-y: scroll.
  scene.wrapper.style.overflowY = "auto"; await settle();
  before = metric(scene); scene.fill(40); await settle();
  const overflow = metric(scene);
  check("short to overflowing content keeps the same slot", before.slot === 4 && before.client === overflow.client && overflow.slot === 4);
  await scroll(scene.wrapper);
  check("overflow threshold then first scroll stays stable", same(overflow, metric(scene)));

  scene = mount(); await settle();
  const nested = document.createElement("div"); nested.className = "nested-scroll";
  nested.append(document.createElement("div")); scene.grid.firstElementChild.replaceChildren(nested);
  await settle(); before = metric(scene); await scroll(nested, 20);
  check("nested scrolling does not activate outer Desk", !scene.wrapper.classList.contains(managed));
  check("nested scrolling does not resize outer cards", same(before, metric(scene)));
  check("nested scroller receives no Desk gutter", getComputedStyle(nested).scrollbarGutter === "auto");

  const right = document.getElementById("roam-right-sidebar-content");
  await settle();
  check("sidebar compensation remains exactly one slot", right.style.getPropertyValue("--rr-scrollbar-slot") === "4px" && getComputedStyle(right.firstElementChild).paddingRight === "20px");
  right.style.width = "320px"; await settle(); await settle();
  check("sidebar resize keeps the compensation", right.style.getPropertyValue("--rr-scrollbar-slot") === "4px" && getComputedStyle(right.firstElementChild).paddingRight === "20px");
  check("Desk never borrows the sidebar slot variable", scene.wrapper.style.getPropertyValue("--rr-scrollbar-slot") === "");

  scene = mount({ desk: false }); await settle();
  check("Daily Notes does not gain eager geometry", metric(scene).slot === 0 && metric(scene).gutter === "auto" && !scene.wrapper.classList.contains(managed));
  const nestedDesk = document.createElement("div"); nestedDesk.className = "rm-desk-page"; scene.page.append(nestedDesk);
  await settle();
  check("a nested Desk surface cannot opt in the whole article", metric(scene).slot === 0);
  scene = mount(); await settle();
  const geometryCss = document.getElementById("unified-precise-scrollbar-style").textContent;
  check("base specificity preserves the activity color selector", geometryCss.includes(":is(.rr-scrollbar-managed, :where(") && geometryCss.includes(".rr-scrollbar-managed.is-scrolling-local::-webkit-scrollbar-thumb"));
  await scroll(scene.wrapper);
  window.__rrRoamScroll.destroy(); await settle();
  check("destroy removes helper style and Desk gutter", !document.getElementById("unified-precise-scrollbar-style") && metric(scene).gutter === "auto" && metric(scene).slot === 0);
  check("destroy leaves no managed classes or inline gutter", !document.querySelector(`.${managed}, .${active}`) && !scene.wrapper.style.getPropertyValue("scrollbar-gutter"));
  check("destroy removes sidebar compensation", !right.style.getPropertyValue("--rr-scrollbar-slot"));
  load(); load(); await settle();
  check("reinjection owns exactly one style", document.querySelectorAll("#unified-precise-scrollbar-style").length === 1 && metric(scene).slot === 4);
  const result = { passed: results.filter((entry) => entry.pass).length, total: results.length, results };
  document.getElementById("report").textContent = JSON.stringify(result, null, 2);
  return result;
}
load(); mount();
window.__scrollFixture = { run, probe };
