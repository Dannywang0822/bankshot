// Headless: endless entry + waves — assert no softlock (v4 thresholds)
const BS = require("./core.js");
const clone = (r) => JSON.parse(JSON.stringify(r));
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
    if (!BS.isSealed(c)) v += 3000;
    if (BS.isBossStage(run.stage)) {
      const bo = BS.bossOf(c);
      v = (bo ? -bo.hp * 1e3 : 1e12) + c.total;
      if (c.phase === "win" || c.phase === "pick") v = 2e12;
    }
    if (v > bestV) { bestV = v; bestA = ang; }
  }
  return bestA;
}

console.log("BS", BS.VERSION);
const asserts = [];
function ok(c, m) { asserts.push([!!c, m]); if (!c) console.error("FAIL", m); }

ok(BS.VERSION === "4", "v4");
ok(BS.threshold({ cards: {} }, 7) === 0, "boss thr 0");
ok(BS.threshold({ cards: {} }, 8) < 5000, "stage8 soft");
ok(BS.threshold({ cards: {} }, 1000) < 200000, "stage1000 softcap");
ok(isFinite(BS.threshold({ cards: {} }, 1000)), "stage1000 finite");

const run = BS.newRun("sim-e", {});
run.cards = { split: 1, boomer: 1 }; run.balls = 5; run.coins = 8;
run.won = true; run.phase = "win"; run.stage = 7;
run.marks = ["🟩","🟩","🟩","🟩","🟩","🟩","👑"];
run.bricks = [{ c: 3, r: 12, cw: 1, ch: 1, hp: 99, max: 99, type: "n", flash: 0, locked: false, keystone: false }];
run.dirty = true; run.total = 20000;
BS.continueEndless(run);
ok(run.phase === "pick", "endless -> pick");
ok(run.offer && run.offer.length > 0, "offer nonempty");
BS.pick(run, run.offer[0]);
ok(run.stage === 8, "stage 8");
ok(run.bricks.filter((b) => b.keystone && b.hp > 0).length === 1, "wave keystone");
ok(BS.lowestRow(run) <= 5, "fresh board");

let wavesCleared = 0;
for (let w = 0; w < 3; w++) {
  const st = run.stage;
  let shots = 0;
  while (run.stage === st && run.phase !== "over" && run.phase !== "pick" && shots < 12) {
    if (run.phase === "aim") { playShot(run, aimBest(run, 14)); shots++; }
    else if (run.phase === "decide") BS.decide(run, true);
    else break;
  }
  if (run.phase === "pick") { wavesCleared++; BS.pick(run, (run.offer && run.offer[0]) || null); }
  else break;
}
ok(wavesCleared >= 1, "cleared >=1 wave got " + wavesCleared);
console.log("wavesCleared", wavesCleared, "stage", run.stage);

const r2 = BS.newRun("rec", {});
BS.fire(r2, Math.PI / 2);
BS.recall(r2);
let t = 0;
while (r2.phase === "fly" && t < 5) { BS.update(r2, 1 / 60); t += 1 / 60; r2.ev.length = 0; }
ok(r2.phase !== "fly", "recall ends");

const failed = asserts.filter((a) => !a[0]);
console.log(failed.length ? "FAILED " + failed.length : "ALL " + asserts.length + " ASSERTS PASSED");
process.exit(failed.length ? 1 : 0);
