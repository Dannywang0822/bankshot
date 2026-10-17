// v5 boss clear-rate harness
const BS = require("./core.js");
const clone = r => JSON.parse(JSON.stringify(r));
function playShot(run, a) {
  BS.fire(run, a); let t = 0;
  while (run.phase === "fly") {
    BS.update(run, 1 / 60); t += 1 / 60; run.ev.length = 0;
    if (t > 20) { BS.recall(run); while (run.phase === "fly" && t < 25) { BS.update(run, 1/60); t += 1/60; } break; }
  }
}
function startBoss(seed, cards) {
  const run = BS.newRun(seed, {});
  run.stage = 7; run.cards = Object.assign({}, cards || {});
  run.balls = 3 + 2 * (run.cards.plusball || 0);
  if (run.cards.sight) run.sight = 1 + run.cards.sight;
  run.phase = "pick"; run.offer = []; BS.pick(run, null);
  return run;
}
function aimAngle(run, tx, ty) {
  return BS.clampAngle(Math.atan2(-(ty - BS.LAUNCH_Y), tx - run.launchX));
}
function bestAim(run, N) {
  const boss = BS.bossOf(run);
  const weak = run.bricks.find(b => b.type === "weak" && b.hp > 0);
  const cands = [];
  for (let i = 0; i < N; i++) cands.push((14 + (152 * i) / Math.max(1, N - 1)) * Math.PI / 180);
  if (weak) {
    const rc = BS.rect(weak);
    cands.push(aimAngle(run, rc.x + rc.w / 2, rc.y + rc.h / 2));
    cands.push(aimAngle(run, rc.x + rc.w / 2 + 20, BS.TOP + 40));
    cands.push(aimAngle(run, BS.W - 25, BS.TOP + 80));
  }
  if (boss) {
    const rc = BS.rect(boss);
    cands.push(aimAngle(run, rc.x + rc.w / 2, rc.y + rc.h));
    cands.push(aimAngle(run, 25, BS.TOP + 60));
    cands.push(aimAngle(run, BS.W - 25, BS.TOP + 60));
  }
  let best = -1e18, bestA = Math.PI / 2;
  for (const ang of cands) {
    const c = clone(run);
    const hp0 = (BS.bossOf(c) || { hp: 0 }).hp;
    const w0 = (c.bricks.find(b => b.type === "weak") || { hp: 0 }).hp;
    playShot(c, ang);
    const boss2 = BS.bossOf(c);
    const hp1 = boss2 ? boss2.hp : 0;
    const w1 = (c.bricks.find(b => b.type === "weak" && b.hp > 0) || { hp: 0 }).hp;
    let v = (hp0 - hp1) * 10 + (w0 - w1) * 40;
    if (c.bossWeak && !run.bossWeak) v += 250;
    if (!boss2 || c.phase === "win") v += 1e6;
    if (c.phase === "over") v -= 1e9;
    if (v > best) { best = v; bestA = ang; }
  }
  return bestA;
}
function humanAim(run) {
  const boss = BS.bossOf(run);
  const weak = run.bricks.find(b => b.type === "weak" && b.hp > 0);
  let a;
  if (weak && !run.bossWeak) {
    const rc = BS.rect(weak);
    // bank off right wall into weak (reachable from bottom)
    a = aimAngle(run, BS.W - 30, BS.TOP + 100);
    // also mix direct
    if (Math.random() < 0.4) a = aimAngle(run, rc.x + rc.w / 2, rc.y + rc.h / 2);
  } else if (boss) {
    const rc = BS.rect(boss);
    if (run.bossRule === "armor" && !run.bossWeak) a = aimAngle(run, 28, BS.TOP + 70);
    else a = aimAngle(run, run.bossRule === "armor" ? 30 : rc.x + rc.w / 2, run.bossRule === "armor" ? BS.TOP + 70 : rc.y + rc.h);
  } else a = Math.PI / 2;
  a += (Math.random() - 0.5) * 10 * Math.PI / 180;
  return BS.clampAngle(a);
}
function fight(seed, cards, mode) {
  const run = startBoss(seed, cards);
  let shots = 0;
  while (run.phase === "aim" && shots < 12) {
    const a = mode === "smart" ? bestAim(run, 20) : humanAim(run);
    playShot(run, a); shots++;
    if (run.phase === "win" || run.phase === "over") break;
  }
  return { phase: run.phase, why: run.why, hp: (BS.bossOf(run) || { hp: 0 }).hp, rule: run.bossRule, bossWeak: run.bossWeak, shots, balls: run.balls, max: (run.bricks.find(b=>b.type==="boss")||{}).max || 0 };
}

console.log("BS", BS.VERSION);
const r0 = startBoss("inspect", {});
const bo = BS.bossOf(r0);
const wk = r0.bricks.find(b => b.type === "weak");
console.log("stage7 hp", bo.hp, "weak", { c: wk.c, r: wk.r, hp: wk.hp }, "shots", r0.shotsLeft, "rule", r0.bossRule);

const builds = {
  weak: {},
  medium: { split: 1, plusball: 1 },
  strong: { split: 1, plusball: 1, pierce: 1, boomer: 1 }
};
for (const mode of ["smart", "human"]) {
  for (const [name, cards] of Object.entries(builds)) {
    let w = 0, n = 40, crush = 0, mercy = 0;
    for (let i = 0; i < n; i++) {
      const r = fight(mode + name + i, cards, mode);
      if (r.phase === "win") { w++; if (r.hp === 0 && r.shots >= 7) mercy++; }
      else if (r.why === "crush") crush++;
    }
    console.log(mode, name, "clear", (w / n * 100).toFixed(0) + "%", w + "/" + n, "crush", crush);
  }
}

// sanity: weak always present & reachable-ish at start
let ok = true;
for (let i = 0; i < 30; i++) {
  const run = startBoss("w" + i, {});
  const w = run.bricks.find(b => b.type === "weak" && b.hp > 0);
  const b = BS.bossOf(run);
  if (!w || !b) { ok = false; console.log("missing", i); }
  if (w && w.r < b.r) { ok = false; console.log("weak above boss?", i, w, b); }
}
console.log("weak placement ok", ok);
