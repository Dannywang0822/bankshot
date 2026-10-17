// Trap + 1000-stage guarantees
const BS = require("./core.js");
const clone = (r) => JSON.parse(JSON.stringify(r));

function playShot(run, a) {
  BS.fire(run, a);
  let t = 0;
  while (run.phase === "fly") {
    BS.update(run, 1 / 60);
    t += 1 / 60;
    run.ev.length = 0;
    if (t > 30) throw new Error("infinite shot at stage " + run.stage);
  }
}

function angleTowardKeystone(run) {
  const k = BS.keystoneOf(run);
  if (!k) return Math.PI / 2;
  const q = BS.rect(k);
  const tx = q.x + q.w / 2, ty = q.y + q.h / 2;
  const dx = tx - run.launchX, dy = BS.LAUNCH_Y - ty;
  return BS.clampAngle(Math.atan2(dy, dx));
}

function angleAwayFromKeystone(run) {
  const k = BS.keystoneOf(run);
  // Aim opposite side / steep away
  if (!k) return 0.4;
  return k.c >= 3 ? 0.35 : Math.PI - 0.35;
}

function countKeystones(run) {
  return run.bricks.filter((b) => b.keystone && b.hp > 0).length;
}

function boardOk(run) {
  for (const b of run.bricks) {
    if (b.c < 0 || b.c + b.cw > BS.COLS) return false;
    if (b.r < 0 || b.r + b.ch > BS.ROWS + 2) return false;
    if (!isFinite(b.hp) || b.hp !== b.hp || b.hp <= 0) return false;
  }
  return true;
}

const asserts = [];
function ok(c, m) {
  asserts.push([!!c, m]);
  if (!c) console.error("FAIL", m);
}

console.log("BS", BS.VERSION, "patterns", BS.PATTERNS.length);
ok(BS.VERSION === "5", "VERSION 5");
ok(BS.PATTERNS.length >= 15, "pattern catalog >= 15");

// --- generate milestone stages ---
const milestones = [1, 2, 10, 50, 100, 500, 1000];
for (const n of milestones) {
  const run = BS.newRun("mile-" + n, {});
  run.stage = n;
  if (BS.isBossStage(n)) {
    // startStage boss path
    run.phase = "pick";
    BS.pick(run, null);
  } else {
    BS.buildTrapBoard(run, n <= 2 ? 4 : 5);
  }
  const thr = BS.threshold(run, n);
  ok(isFinite(thr) && thr === thr, "thr finite @" + n + " got " + thr);
  ok(thr < 1e7, "thr not insane @" + n + " got " + thr);
  ok(boardOk(run), "board fits @" + n);
  if (!BS.isBossStage(n)) {
    ok(countKeystones(run) === 1, "exactly 1 keystone @" + n + " got " + countKeystones(run));
    ok(!!BS.keystoneOf(run), "keystone reachable ref @" + n);
    const g = BS.keystoneOf(run);
    ok(g.type === "gate" || g.keystone, "keystone is gate @" + n);
    ok(run.bricks.some((b) => b.locked), "has locked cluster @" + n);
    ok(!!run.trapPattern && run.trapPattern !== "boss", "pattern set @" + n + " " + run.trapPattern);
  } else {
    ok(!!BS.bossOf(run) || run.bricks.some((b) => b.type === "boss"), "boss present @" + n);
  }
}

// Determinism: same seed+stage → same pattern & keystone col
{
  const a = BS.newRun("det-seed", {});
  a.stage = 42;
  BS.buildTrapBoard(a, 5);
  const b = BS.newRun("det-seed", {});
  b.stage = 42;
  BS.buildTrapBoard(b, 5);
  ok(a.trapPattern === b.trapPattern, "deterministic pattern");
  ok(BS.keystoneOf(a).c === BS.keystoneOf(b).c, "deterministic gate col");
}

// Pattern variety across 100 stages
{
  const seen = new Set();
  for (let n = 8; n <= 107; n++) {
    if (BS.isBossStage(n)) continue;
    const run = BS.newRun("var", {});
    run.stage = n;
    BS.buildTrapBoard(run, 5);
    seen.add(run.trapPattern);
  }
  ok(seen.size >= 10, "variety across 100 stages: " + seen.size);
  console.log("patterns seen", seen.size, [...seen].slice(0, 12).join(","));
}

// Dumb vs smart: opening gap first yields more score on a sealed board
{
  const mk = () => {
    const r = BS.newRun("gap-cmp", {});
    r.balls = 4;
    return r;
  };
  const smart = mk();
  const dumb = mk();
  // equalize boards
  dumb.bricks = clone(smart).bricks;
  dumb.rb = smart.rb;
  dumb.dirty = true;
  playShot(smart, angleTowardKeystone(smart));
  playShot(dumb, angleAwayFromKeystone(dumb));
  const smartOpened = !BS.isSealed(smart) || smart.breached;
  const dumbOpened = !BS.isSealed(dumb) || dumb.breached;
  console.log("gap cmp smartScore", smart.score, "dumbScore", dumb.score, "smartOpened", smartOpened, "dumbOpened", dumbOpened);
  ok(smart.score >= dumb.score || smartOpened, "smart toward gap >= dumb (or opened)");
  // Prefer: smart more likely to breach
  ok(smartOpened || smart.score > 0, "smart did something");
}

// Softlock: 50 short runs no infinite / empty pick hang
{
  let soft = 0;
  for (let i = 0; i < 50; i++) {
    const run = BS.newRun("soft-" + i, { safety: false });
    run.cards = { split: 1 }; run.balls = 5;
    let shots = 0;
    try {
      while (!["over", "win"].includes(run.phase) && shots < 40) {
        if (run.phase === "aim") {
          playShot(run, angleTowardKeystone(run) || Math.PI / 2);
          shots++;
        } else if (run.phase === "decide") BS.decide(run, true);
        else if (run.phase === "pick") {
          if (!run.offer) soft++;
          BS.pick(run, (run.offer && run.offer[0]) || null);
        } else break;
      }
    } catch (e) {
      soft++;
      console.error("softlock err", e.message);
    }
  }
  ok(soft === 0, "50 runs no softlock (soft=" + soft + ")");
}

// Competent bot stages 1-12ish progress
{
  let reached = 1;
  const run = BS.newRun("bot", {});
  run.balls = 5;
  let shots = 0;
  while (!["over", "win"].includes(run.phase) && shots < 120) {
    if (run.phase === "aim") {
      // sample a few angles bias keystone
      let bestA = angleTowardKeystone(run), bestV = -1e18;
      for (let i = 0; i < 10; i++) {
        const ang = (20 + (140 * i) / 9) * Math.PI / 180;
        const c = clone(run);
        playShot(c, ang);
        let v = c.score - (c.phase === "over" ? 1e9 : 0);
        if (!BS.isSealed(c)) v += 5000;
        if (v > bestV) { bestV = v; bestA = ang; }
      }
      playShot(run, bestA);
      shots++;
    } else if (run.phase === "decide") BS.decide(run, true);
    else if (run.phase === "pick") BS.pick(run, (run.offer && run.offer[0]) || null);
    else break;
    reached = Math.max(reached, run.stage);
  }
  console.log("bot reached stage", reached, "phase", run.phase, "why", run.why);
  ok(reached >= 3, "bot reaches at least stage 3 (got " + reached + ")");
}

// High N board still has 1 keystone & finite thr
{
  for (const n of [250, 750, 999, 1000]) {
    const run = BS.newRun("hi", {});
    run.stage = n;
    if (BS.isBossStage(n)) continue;
    BS.buildTrapBoard(run, 5);
    ok(countKeystones(run) === 1, "keystone@" + n);
    const t = BS.threshold(run, n);
    ok(isFinite(t) && t < 5e5, "thr@" + n + "=" + t);
  }
}

// Endless entry still works
{
  const run = BS.newRun("e", {});
  run.won = true; run.phase = "win"; run.stage = 7;
  run.marks = ["🟩", "🟩", "🟩", "🟩", "🟩", "🟩", "👑"];
  BS.continueEndless(run);
  ok(run.phase === "pick", "endless pick");
  BS.pick(run, (run.offer && run.offer[0]) || null);
  ok(run.stage === 8, "stage 8");
  ok(countKeystones(run) === 1, "endless wave keystone");
}

const failed = asserts.filter((a) => !a[0]);
console.log(failed.length ? "FAILED " + failed.length : "ALL " + asserts.length + " ASSERTS PASSED");
process.exit(failed.length ? 1 : 0);
