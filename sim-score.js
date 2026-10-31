// Every non-boss stage must be clearable by chipping the board at a modest ×4.
// Fails when the threshold sits above that attainable score.
const BS = require("./core.js");

const asserts = [];
function ok(c, m) {
  asserts.push([!!c, m]);
  if (!c) console.error("FAIL", m);
}

const GOLD = { 1: 50, 2: 130, 3: 250, 4: 480, 5: 910, 6: 1730 };

function openStage(seed, stage, opts) {
  opts = opts || {};
  const run = BS.newRun(seed, { random: !!opts.random, safety: false });
  if (opts.frugal) run.cards = { frugal: 1 };
  if (stage > 1) {
    run.stage = stage;
    run.phase = "pick";
    run.offer = [];
    BS.pick(run, null);
  }
  return run;
}

const stages = [];
for (let s = 1; s <= 36; s++) if (!BS.isBossStage(s)) stages.push(s);
[40, 50, 80, 100, 200, 500, 1000].forEach((s) => stages.push(s));

const summary = [];
let worst = { ratio: 99, label: "" };
let short = 0;
let checked = 0;

function check(label, run) {
  if (BS.isBossStage(run.stage)) return;
  const budget = BS.attainableScore(run);
  const ratio = budget / Math.max(1, run.threshold);
  checked++;
  if (!(budget >= run.threshold)) {
    short++;
    ok(false, label + " short thr " + run.threshold + " attainable " + Math.round(budget));
  }
  if (ratio < worst.ratio) worst = { ratio: ratio, label: label, thr: run.threshold, budget: Math.round(budget), rule: run.rule || "classic" };
  return { thr: run.threshold, raw: BS.threshold({ cards: run.cards || {}, randomMode: !!run.randomMode, seed: run.seed, rule: run.rule }, run.stage), budget: budget, ratio: ratio, rule: run.rule || "classic" };
}

// Classic campaign numbers stay put.
for (let k = 1; k <= 6; k++) {
  let changed = 0;
  for (let i = 0; i < 20; i++) {
    const run = openStage("gold" + i, k, {});
    if (run.threshold !== GOLD[k]) changed++;
  }
  ok(changed === 0, "classic stage " + k + " threshold stays " + GOLD[k] + " (changed " + changed + "/20)");
}

function sweep(mode) {
  const lines = [];
  for (const st of stages) {
    let minR = 99, maxThr = 0, minThr = 1e15, raw = 0, below = 0;
    for (let i = 0; i < 8; i++) {
      const run = openStage(mode + i, st, { random: mode === "random" });
      const row = check(mode + " s" + st + " " + (run.rule || "classic") + " #" + i, run);
      raw = BS.threshold({ cards: {}, randomMode: false }, st);
      if (row.ratio < minR) minR = row.ratio;
      if (row.thr > maxThr) maxThr = row.thr;
      if (row.thr < minThr) minThr = row.thr;
      if (row.thr > row.budget) below++;
    }
    lines.push({ st: st, minR: minR, minThr: minThr, maxThr: maxThr, raw: raw, below: below });
    ok(minR >= 1.15, mode + " stage " + st + " min attainable/threshold " + minR.toFixed(2));
    if (st >= 10) ok(maxThr < raw, mode + " stage " + st + " fitted " + maxThr + " under raw " + raw);
  }
  return lines;
}

const classic = sweep("classic");
const random = sweep("random");

// Frugal relic on late stages still fits the smaller shot budget.
for (const st of [10, 30, 80, 200]) {
  for (let i = 0; i < 4; i++) {
    const run = openStage("fr" + i, st, { frugal: true });
    check("frugal-card s" + st + " #" + i, run);
    const runR = openStage("frr" + i, st, { random: true, frugal: true });
    check("frugal-card random s" + st + " " + (runR.rule || "") + " #" + i, runR);
  }
}

function show(title, lines) {
  console.log("\n" + title);
  console.log("stage  rawFormula  fittedThr        min attainable/thr");
  for (const row of lines) {
    if (![1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 50, 100, 200, 500, 1000].includes(row.st)) continue;
    console.log(String(row.st).padStart(5), String(row.raw).padStart(10), (row.minThr + "-" + row.maxThr).padStart(16), row.minR.toFixed(2).padStart(8));
  }
}
show("CLASSIC", classic);
show("RANDOM", random);
console.log("\nchecked", checked, "short", short, "worst", worst.label, "ratio", worst.ratio.toFixed(2), "thr", worst.thr, "budget", worst.budget, worst.rule);

ok(short === 0, "no stage under its attainable score");
ok(worst.ratio >= 1.15, "worst margin " + worst.ratio.toFixed(2));

const failed = asserts.filter((a) => !a[0]);
console.log(failed.length ? "FAILED " + failed.length : "ALL " + asserts.length + " ASSERTS PASSED");
process.exit(failed.length ? 1 : 0);
