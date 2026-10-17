// Headless: clear main run if possible, enter endless, play a few waves — assert no softlock
const BS = require("./core.js");
const clone = r => JSON.parse(JSON.stringify(r));
function playShot(run, a) {
  BS.fire(run, a); let t = 0;
  while (run.phase === "fly") {
    BS.update(run, 1 / 60); t += 1 / 60; run.ev.length = 0;
    if (t > 30) throw new Error("infinite shot");
  }
}
function aimBest(run, N) {
  let bestA = Math.PI / 2, bestV = -1e18;
  for (let i = 0; i < N; i++) {
    const ang = (14 + (152 * i) / (N - 1)) * Math.PI / 180;
    const c = clone(run); playShot(c, ang);
    let v = c.score - (c.phase === "over" ? 1e9 : 0) - Math.max(0, BS.lowestRow(c) - 8) * (run.threshold || 1000) * 0.2;
    if (run.stage === 7) {
      const bo = BS.bossOf(c);
      v = (bo ? -bo.hp * 1e3 : 1e12) + c.total;
      if (c.phase === "win") v = 2e12;
    }
    if (v > bestV) { bestV = v; bestA = ang; }
  }
  return bestA;
}
function drive(run, limit) {
  let n = 0;
  while (!["over", "win"].includes(run.phase) && n++ < limit) {
    if (run.phase === "aim") playShot(run, aimBest(run, run.stage === 7 ? 24 : 12));
    else if (run.phase === "decide") BS.decide(run, true);
    else if (run.phase === "pick") {
      if (!run.offer || !run.offer.length) throw new Error("empty offer softlock at stage " + run.stage);
      BS.pick(run, run.offer[0]);
    } else throw new Error("bad phase " + run.phase);
  }
}
function fabEndless() {
  const run = BS.newRun("sim-e", {});
  run.cards = { split: 1, boomer: 1 }; run.balls = 5; run.coins = 8;
  run.won = true; run.phase = "win"; run.stage = 7; run.marks = ["🟩","🟩","🟩","🟩","🟩","🟩","👑"];
  run.bricks = [{ c: 3, r: 12, cw: 1, ch: 1, hp: 99, max: 99, type: "n", flash: 0 }];
  run.dirty = true; run.total = 20000;
  return run;
}

console.log("BS", BS.VERSION);
const asserts = [];
function ok(c, m) { asserts.push([!!c, m]); if (!c) console.error("FAIL", m); }

// 1) thresholds sane
ok(BS.threshold({ cards: {} }, 8) === 14330, "stage8 thr 14330");
ok(BS.threshold({ cards: {} }, 7) === 0, "boss thr 0");
ok(BS.threshold({ cards: {} }, 8) < 20000, "stage8 < 20k");

// 2) endless entry refreshes board, clears debris
const run = fabEndless();
BS.continueEndless(run);
ok(run.phase === "pick", "endless -> pick");
ok(run.offer && run.offer.length > 0, "offer nonempty");
ok(run.bricks.length === 0, "debris cleared before pick");
BS.pick(run, run.offer[0]);
ok(run.phase === "aim", "started aim");
ok(run.stage === 8, "stage 8");
ok(run.bricks.length >= 8, "board refreshed with rows");
ok(BS.lowestRow(run) <= 4, "fresh board not near danger line");
ok(run.threshold === 14330 || run.threshold === Math.round(14330 * 0.65 / 10) * 10, "thr after start");

// 3) play several endless waves without softlock / infinite shot
let wavesCleared = 0;
for (let w = 0; w < 3; w++) {
  const st = run.stage;
  let shots = 0;
  while (run.stage === st && run.phase !== "over" && run.phase !== "pick" && shots < 10) {
    if (run.phase === "aim") { playShot(run, aimBest(run, 16)); shots++; }
    else if (run.phase === "decide") BS.decide(run, true);
    else break;
  }
  if (run.phase === "pick") { wavesCleared++; BS.pick(run, (run.offer && run.offer[0]) || null); }
  else break;
}
ok(wavesCleared >= 1, "cleared at least 1 endless wave (got " + wavesCleared + ")");
console.log("wavesCleared", wavesCleared, "final stage", run.stage, "phase", run.phase, "why", run.why);

// 4) recall unsticks flying balls
const r2 = BS.newRun("rec", {});
r2.phase = "aim";
BS.fire(r2, Math.PI / 2);
ok(r2.phase === "fly", "flying");
BS.recall(r2);
ok(r2.recalled, "recalled");
let t = 0;
while (r2.phase === "fly" && t < 5) { BS.update(r2, 1 / 60); t += 1 / 60; r2.ev.length = 0; }
ok(r2.phase !== "fly", "recall ends shot, phase=" + r2.phase);

const failed = asserts.filter(a => !a[0]);
console.log(failed.length ? "FAILED " + failed.length : "ALL " + asserts.length + " ASSERTS PASSED");
process.exit(failed.length ? 1 : 0);
