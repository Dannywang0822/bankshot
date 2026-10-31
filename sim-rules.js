// Random-mode rules: determinism, unlocks, no softlock, clearable, classic unchanged.
const BS = require("./core.js");
const clone = (r) => JSON.parse(JSON.stringify(r));

const asserts = [];
function ok(c, m) {
  asserts.push([!!c, m]);
  if (!c) console.error("FAIL", m);
}

function playShot(run, a) {
  BS.fire(run, a);
  let t = 0;
  let mirrorOut = 0;
  while (run.phase === "fly") {
    BS.update(run, 1 / 60);
    t += 1 / 60;
    if (run.rule === "mirror") {
      for (const b of run.flying) if (b.x < -1 || b.x > BS.W + 1) mirrorOut++;
    }
    run.ev.length = 0;
    if (t > 26) throw new Error("infinite shot rule=" + run.rule + " stage=" + run.stage);
  }
  playShot.mirrorOut = (playShot.mirrorOut || 0) + mirrorOut;
  return t;
}

function brickSig(run) {
  return run.bricks.map((b) => [b.c, b.r, b.cw, b.ch, b.hp, b.type, b.locked ? 1 : 0, b.keystone ? 1 : 0].join(",")).join("|");
}

function aimGate(run) {
  const g = BS.keystoneOf(run);
  if (!g) return Math.PI / 2;
  const q = BS.rect(g);
  return BS.clampAngle(Math.atan2(BS.LAUNCH_Y - (q.y + q.h / 2), (q.x + q.w / 2) - run.launchX));
}

function bestAim(run) {
  const angs = [];
  const nw = run.rule === "nowalls";
  const lo = nw ? 28 : 16;
  const hi = nw ? 152 : 164;
  const N = nw ? 10 : 8;
  for (let i = 0; i < N; i++) angs.push(((lo + ((hi - lo) * i) / Math.max(1, N - 1)) * Math.PI) / 180);
  angs.push(aimGate(run));
  if (nw) angs.push(Math.PI / 2);
  const sealed = BS.isSealed(run);
  let best = -1e18;
  let bestA = Math.PI / 2;
  for (const ang of angs) {
    const c = clone(run);
    playShot(c, ang);
    const ks0 = BS.keystoneOf(run);
    const ks = BS.keystoneOf(c);
    const dmg = ks0 ? ks0.hp - (ks ? ks.hp : 0) : 0;
    let v = sealed ? dmg * 1e5 + c.score : c.score;
    if (!BS.isSealed(c)) v += 5e5;
    if (c.threshold && c.score >= c.threshold) v += 5e6;
    if (c.phase === "decide" || c.phase === "pick" || c.phase === "win") v += 1e7;
    if (c.phase === "over") v -= 1e9;
    v -= Math.max(0, BS.lowestRow(c) - 9) * 2000;
    if (v > best) { best = v; bestA = ang; }
  }
  return bestA;
}

function begin(seed, stage, balls) {
  const run = BS.newRun(seed, { random: true, safety: false });
  if (stage <= 1) {
    if (balls) run.balls = balls;
    return run;
  }
  run.stage = stage;
  run.phase = "pick";
  run.offer = [];
  BS.pick(run, null);
  if (balls) run.balls = balls;
  return run;
}

function ballsFor(stage) {
  if (stage <= 2) return 3;
  if (stage <= 4) return 4;
  return 5;
}

function findSeeds(rule, stage, n, limit) {
  const out = [];
  const cap = limit || 160;
  for (let i = 0; i < cap && out.length < n; i++) {
    const seed = "r" + i;
    if (BS.ruleAt({ randomMode: true, seed: seed }, stage) === rule) out.push(seed);
  }
  return out;
}

function earliestStage(rule) {
  for (let stage = 2; stage <= 12; stage++) {
    if (BS.isBossStage(stage)) continue;
    if (findSeeds(rule, stage, 1, 80).length) return stage;
  }
  return 0;
}

// ---------- classic regression (snapshot from before random rules) ----------
const GOLD_S0 = "0,0,1,1,2,n,1,0|1,0,1,1,2,n,1,0|2,0,1,1,1,n,1,0|3,0,1,1,2,n,1,0|4,0,1,1,1,n,1,0|5,0,1,1,2,n,1,0|6,0,1,1,1,gold,1,0|0,1,1,1,2,n,1,0|1,1,1,1,2,n,1,0|2,1,1,1,1,n,1,0|3,1,1,1,2,n,1,0|4,1,1,1,2,n,1,0|5,1,1,1,1,gold,1,0|6,1,1,1,2,gold,1,0|0,2,1,1,16,armor,0,0|1,2,1,1,3,gate,0,1|2,2,1,1,13,armor,0,0|3,2,1,1,13,armor,0,0|4,2,1,1,13,armor,0,0|5,2,1,1,13,armor,0,0|6,2,1,1,13,armor,0,0|1,3,1,1,1,n,0,0";
const classic = BS.newRun("s0", { safety: false });
ok(classic.randomMode === false && classic.rule == null, "classic has no rule");
ok(brickSig(classic) === GOLD_S0, "classic stage1 board unchanged");
ok(classic.threshold === 50 && classic.shotsLeft === 5, "classic stage1 numbers");
{
  const t = playShot(classic, Math.PI / 2);
  ok(Math.abs(t - 1.85) < 0.03 && classic.score === 6 && classic.shotsLeft === 4 && classic.rb === -1156294401, "classic straight shot unchanged t=" + t.toFixed(3) + " score=" + classic.score);
}
ok(BS.threshold({ cards: {} }, 6) === 1730, "classic thr 6");
ok(BS.threshold({ cards: { frugal: 1 } }, 6) === 1130, "classic frugal thr 6");
ok(BS.threshold({ cards: {} }, 1000) < 200000 && isFinite(BS.threshold({ cards: {} }, 1000)), "classic thr 1000");
{
  const warm = BS.newRun("s0", { random: true });
  const plain = BS.newRun("s0", {});
  ok(warm.rule === "warmup" && brickSig(warm) === brickSig(plain), "warmup board == classic");
  ok(warm.threshold === 50 && warm.shotsLeft === 5, "warmup numbers");
}

// ---------- schedule / reproducibility ----------
ok(BS.RULE_POOL.length === 10, "10 rules");
const early = ["goldrain", "slowmo", "bombtide"];
for (let i = 0; i < 30; i++) {
  const seed = "u" + i;
  const run = { randomMode: true, seed: seed };
  ok(BS.ruleAt(run, 1) === "warmup", "stage1 warmup " + seed);
  const r2 = BS.ruleAt(run, 2);
  ok(early.indexOf(r2) >= 0, "stage2 early pool " + r2);
  ok(BS.unlockedRules(2).length === 3, "unlock 3 at stage 2");
  ok(BS.unlockedRules(5).indexOf("nowalls") < 0, "nowalls locked before 6");
  ok(BS.unlockedRules(6).length === 10, "full pool at 6");
  for (let k = 1; k <= 40; k++) {
    const a = BS.ruleAt(run, k);
    const b = BS.ruleAt(run, k + 1);
    if (a && b) ok(a !== b, "no adjacent repeat " + seed + " @" + k + " " + a);
    if (BS.isBossStage(k)) ok(a == null, "boss draws no rule @" + k);
  }
}
{
  const seq = (seed) => {
    const xs = [];
    for (let k = 1; k <= 60; k++) xs.push(BS.ruleAt({ randomMode: true, seed: seed }, k) || "-");
    return xs.join(",");
  };
  ok(seq("daily-2026-10-31") === seq("daily-2026-10-31"), "daily rule seq stable");
  ok(seq("daily-2026-10-31") !== seq("daily-2026-11-01"), "different days differ");
}
for (const k of [7, 57, 107]) {
  ok(BS.ruleAt({ randomMode: true, seed: "boss" }, k) == null, "ruleAt boss " + k);
  const run = begin("boss-" + k, k, 3);
  ok(run.rule == null, "live boss rule null " + k);
  ok(run.bossRule === "armor" || run.bossRule === "regen", "boss rule kept " + k + " " + run.bossRule);
  ok(run.bricks.some((b) => b.type === "boss"), "boss brick " + k);
  ok(!run.bricks.some((b) => b.loot), "boss has no loot flag");
}

// newly unlocked rules show up often on their unlock stage
{
  let nw = 0;
  const N = 80;
  for (let i = 0; i < N; i++) if (BS.ruleAt({ randomMode: true, seed: "w" + i }, 6) === "nowalls") nw++;
  ok(nw >= 16, "nowalls unlock bias " + nw + "/" + N);
  let fresh = 0;
  for (let i = 0; i < N; i++) {
    const r = BS.ruleAt({ randomMode: true, seed: "w" + i }, 3);
    if (r === "ceiling" || r === "frugal") fresh++;
  }
  ok(fresh >= 40, "stage3 new-rule bias " + fresh + "/" + N);
}

// ---------- per-rule mechanics ----------
{
  const seed = findSeeds("frugal", 3, 1)[0];
  const run = begin(seed, 3, 3);
  ok(run.rule === "frugal" && run.shotsLeft === 4, "frugal shots 4");
  ok(run.threshold === BS.threshold({ cards: { frugal: 1 } }, 3), "frugal thr matches relic once");
  run.cards = { frugal: 1 };
  const both = begin(seed, 3, 3);
  both.cards.frugal = 1;
  // restart stage with the card already owned
  both.phase = "pick";
  both.offer = [];
  both.stage = 3;
  BS.pick(both, null);
  ok(both.shotsLeft === 4, "frugal does not stack shots");
  ok(both.threshold === BS.threshold({ cards: { frugal: 1 } }, 3), "frugal does not stack threshold");
}
{
  const seed = findSeeds("goldrain", 2, 1)[0];
  const plain = BS.newRun(seed, {});
  plain.stage = 2;
  BS.buildTrapBoard(plain, 4);
  const rain = begin(seed, 2, 3);
  const cg = plain.bricks.filter((b) => b.type === "gold").length;
  const rg = rain.bricks.filter((b) => b.type === "gold").length;
  ok(rain.rule === "goldrain" && rg >= Math.min(cg * 2, cg + 8) && rg > cg, "goldrain about doubled " + cg + "→" + rg);
}
{
  const seed = findSeeds("bombtide", 2, 1)[0];
  const plain = BS.newRun(seed, {});
  plain.stage = 2;
  BS.buildTrapBoard(plain, 4);
  const tide = begin(seed, 2, 3);
  const cb = plain.bricks.filter((b) => b.type === "bomb").length;
  const rb = tide.bricks.filter((b) => b.type === "bomb").length;
  ok(tide.rule === "bombtide" && rb >= cb + 2, "bombtide increased " + cb + "→" + rb);
}
{
  const seed = findSeeds("hardgate", 4, 1)[0];
  const plain = BS.newRun(seed, {});
  plain.stage = 4;
  BS.buildTrapBoard(plain, 5);
  const hard = begin(seed, 4, 4);
  const hp0 = plain.bricks.filter((b) => b.keystone)[0].hp;
  const hp1 = hard.bricks.filter((b) => b.keystone)[0].hp;
  ok(hard.rule === "hardgate" && hp1 === Math.round(hp0 * 1.8), "hardgate hp ×1.8 " + hp0 + "→" + hp1);
  ok(hard.bricks.some((b) => b.loot) && !plain.bricks.some((b) => b.loot), "hardgate loot only on that rule");
}
{
  const run = BS.newRun("drop", { random: true, safety: false });
  run.rule = "doubledrop";
  const arm = run.bricks.filter((b) => b.type === "armor")[0];
  const r0 = arm.r;
  const c0 = arm.c;
  playShot(run, Math.PI / 2);
  const arm2 = run.bricks.filter((b) => b.type === "armor" && b.c === c0)[0];
  ok(arm2 && arm2.r === r0 + 2, "doubledrop moves 2 rows " + (arm2 && arm2.r - r0));
}

// billiard: penalty once, whether from the card, the rule, or both
function multAfterWalls(setup, angle) {
  const run = BS.newRun("bill", { random: true, safety: false });
  run.bricks = [];
  run.dirty = true;
  run.cards = setup.cards || {};
  run.rule = setup.rule || "warmup";
  BS.fire(run, angle);
  let guard = 0;
  while (run.phase === "fly" && guard < 500) {
    BS.update(run, 1 / 60);
    const b = run.flying[0];
    if (b && b.walls >= 2) return b.mult;
    guard++;
    run.ev.length = 0;
  }
  return null;
}
{
  const ang = (28 * Math.PI) / 180;
  const card = multAfterWalls({ cards: { billiard: 1 }, rule: "warmup" }, ang);
  const rule = multAfterWalls({ rule: "billiard" }, ang);
  const both = multAfterWalls({ cards: { billiard: 1 }, rule: "billiard" }, ang);
  const none = multAfterWalls({ rule: "warmup" }, ang);
  ok(card != null && card === rule && rule === both, "billiard does not double " + [none, card, rule, both].join("/"));
  ok(none != null && card > none, "billiard adds mult " + none + "→" + card);
}
{
  // brick in the way: no points before the first wall
  const run = BS.newRun("pre", { random: true });
  run.rule = "billiard";
  run.cards = {};
  run.bricks = [{ c: 3, r: 8, cw: 1, ch: 1, hp: 30, max: 30, type: "n", flash: 0, locked: false, keystone: false }];
  run.dirty = true;
  BS.fire(run, Math.PI / 2);
  let guard = 0;
  let sawHit = false;
  while (run.phase === "fly" && guard < 200) {
    BS.update(run, 1 / 60);
    if (run.score > 0 && run.flying.some((b) => b.walls === 0)) sawHit = true;
    const bounced = run.flying.some((b) => b.walls > 0);
    if (bounced) break;
    guard++;
    run.ev.length = 0;
  }
  ok(!sawHit && run.score === 0, "billiard scores 0 before first wall");
}

// ceiling ×2, and ×4 with boomerang (side +1 then top)
function multAt(rule, cards) {
  const run = BS.newRun("ceil", { random: true });
  run.rule = rule;
  run.cards = cards || {};
  run.bricks = [];
  run.dirty = true;
  // ~58°: side wall first, then the ceiling (32° hits the far wall before the top).
  return multAfterWalls({ cards: run.cards, rule: run.rule }, (58 * Math.PI) / 180);
}
{
  const base = multAt("warmup");
  const ceil = multAt("ceiling");
  const boom = multAt("warmup", { boomer: 1 });
  const both = multAt("ceiling", { boomer: 1 });
  ok(ceil > base, "ceiling beats +1 " + base + "→" + ceil);
  ok(both > boom && both > ceil, "ceiling × boomerang stacks " + [base, ceil, boom, both].join("/"));
}

// slowmo: 0.6× speed, ×2 points, longer timeout cap
{
  const mk = (rule) => {
    const run = BS.newRun("slow", { random: true });
    run.rule = rule;
    run.bricks = [{ c: 3, r: 6, cw: 1, ch: 1, hp: 8, max: 8, type: "n", flash: 0, locked: false, keystone: false }];
    run.dirty = true;
    return run;
  };
  const slow = mk("slowmo");
  const norm = mk("warmup");
  BS.fire(slow, Math.PI / 2);
  BS.update(slow, 1 / 60);
  const vy = slow.flying[0].vy;
  ok(Math.abs(vy - (-BS.SPEED * 0.6)) < 30, "slowmo speed " + vy.toFixed(1));
  while (slow.phase === "fly") { BS.update(slow, 1 / 60); slow.ev.length = 0; }
  BS.fire(norm, Math.PI / 2);
  while (norm.phase === "fly") { BS.update(norm, 1 / 60); norm.ev.length = 0; }
  ok(slow.score === norm.score * 2 || Math.abs(slow.score - norm.score * 2) <= 1, "slowmo score ×2 " + norm.score + "→" + slow.score);
}

// nowalls: some angle hits the centered gate; side exits end the shot
{
  const seeds = findSeeds("nowalls", 6, 4);
  ok(seeds.length === 4, "found nowalls seeds");
  let hits = 0;
  for (const seed of seeds) {
    const run = begin(seed, 6, 4);
    ok(run.rule === "nowalls", "nowalls rolled");
    const g = BS.keystoneOf(run);
    ok(g && g.c === 3, "nowalls gate centered");
    const below = run.bricks.some((b) => b.c === g.c && b.r > g.r && !b.keystone);
    ok(!below, "lane under gate is open");
    const hp0 = g.hp;
    const t = playShot(run, aimGate(clone(begin(seed, 6, 4))));
    // re-fire on a fresh board — playShot above consumed a different run
    const fresh = begin(seed, 6, 4);
    const hpBefore = BS.keystoneOf(fresh).hp;
    playShot(fresh, aimGate(fresh));
    const hpAfter = BS.keystoneOf(fresh) ? BS.keystoneOf(fresh).hp : 0;
    if (hpAfter < hpBefore) hits++;
    ok(t < 16, "nowalls shot ends");
    ok(hp0 > 0, "gate exists");
  }
  ok(hits >= 3, "nowalls direct aim hits gate " + hits + "/4");
}

// mirror stays inside the screen
{
  playShot.mirrorOut = 0;
  const seed = findSeeds("mirror", 5, 1)[0];
  const run = begin(seed, 5, 4);
  ok(run.rule === "mirror", "mirror rolled");
  for (let i = 0; i < 3 && run.phase === "aim"; i++) playShot(run, (30 + i * 40) * Math.PI / 180);
  ok((playShot.mirrorOut || 0) === 0, "mirror balls stay in bounds");
}

// ---------- clear + no softlock across seeds ----------
const clearReport = [];
for (const rule of BS.RULE_POOL) {
  const stage = earliestStage(rule);
  ok(stage >= 2, rule + " appears by stage " + stage);
  const seeds = findSeeds(rule, stage, 4);
  ok(seeds.length === 4, rule + " four seeds @" + stage);
  let cleared = 0;
  let soft = 0;
  for (const seed of seeds) {
    const run = begin(seed, stage, ballsFor(stage));
    ok(run.rule === rule, rule + " active on " + seed);
    let shots = 0;
    let maxT = 0;
    try {
      while (run.stage === stage && run.phase !== "over" && run.phase !== "win" && shots < 8) {
        if (run.phase === "aim") {
          const ang = run.rule === "nowalls" && BS.isSealed(run) ? aimGate(run) : bestAim(run);
          maxT = Math.max(maxT, playShot(run, ang));
          shots++;
        } else if (run.phase === "decide") BS.decide(run, true);
        else break;
      }
    } catch (e) {
      soft++;
      console.error("soft", rule, seed, e.message);
    }
    const cap = rule === "slowmo" ? 25 : 16;
    if (maxT > cap) soft++;
    const won = run.stage !== stage || run.phase === "win";
    if (won) cleared++;
  }
  clearReport.push(rule + "@" + stage + " " + cleared + "/4");
  ok(soft === 0, rule + " no softlock");
  ok(cleared >= 2, rule + " clearable " + cleared + "/4 @" + stage);
}
console.log("clears", clearReport.join(" | "));

// same seed plays out the same
function digest(seed) {
  const run = BS.newRun(seed, { random: true, safety: false });
  const rules = [run.rule];
  let shots = 0;
  while (shots < 6 && run.phase !== "over" && run.phase !== "win") {
    if (run.phase === "aim") { playShot(run, Math.PI / 2); shots++; }
    else if (run.phase === "decide") BS.decide(run, true);
    else if (run.phase === "pick") {
      rules.push(BS.ruleAt(run, run.stage));
      BS.pick(run, (run.offer && run.offer[0]) || null);
      rules.push(run.rule);
    } else break;
  }
  return [run.score, run.total, run.stage, run.phase, rules.join(".")].join("#");
}
ok(digest("rep-1") === digest("rep-1"), "same seed play matches");
ok(digest("rep-1") !== digest("rep-2"), "different seeds diverge");

const failed = asserts.filter((a) => !a[0]);
console.log(failed.length ? "FAILED " + failed.length : "ALL " + asserts.length + " ASSERTS PASSED");
process.exit(failed.length ? 1 : 0);
