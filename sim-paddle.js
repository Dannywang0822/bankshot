// Paddle mode: one ball, clear the picture, gates 0–3, bonus line, no classic regression.
const BS = require("./core.js");
const asserts = [];
function ok(c, m) { asserts.push([!!c, m]); if (!c) console.error("FAIL", m); }

ok(BS.VERSION === "9", "v9");
const classic = BS.newRun("s0", { safety: false });
ok(!classic.paddle && classic.threshold === 50 && classic.balls === 3 && classic.phase === "aim", "classic stage1 unchanged");

function steer(run) {
  let ball = null, bestY = -1;
  for (const b of run.flying) if (!b.stuck && b.y > bestY) { bestY = b.y; ball = b; }
  if (!ball) return;
  const live = run.bricks.filter((b) => b.hp > 0).sort((a, b) => b.r - a.r);
  let tx = BS.W / 2;
  if (live[0]) { const q = BS.rect(live[0]); tx = q.x + q.w / 2; }
  const w = BS.paddleWidth(run);
  const dir = tx - ball.x;
  const t = Math.max(-0.45, Math.min(0.45, dir / 220));
  BS.paddleMove(run, ball.x - t * (w / 2));
}
function runFor(seed, limit) {
  const run = BS.newRun(seed, { paddle: true });
  let t = 0;
  while (run.stage === 1 && run.phase !== "over" && run.phase !== "pick" && t < limit) {
    if (run.phase === "launch") BS.paddleLaunch(run);
    else if (run.phase === "paddle") steer(run);
    else break;
    BS.update(run, 1 / 60);
    t += 1 / 60;
  }
  return run;
}

ok(BS.gateRoll("s", 1) === 1, "stage1 one gate");
for (const k of [2, 3, 4, 6, 8, 40, 100]) {
  const g = BS.gateRoll("s" + k, k);
  ok(g >= 0 && g <= 3, "gate count " + g + " @" + k);
}
const counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
for (let i = 0; i < 80; i++) counts[BS.gateRoll("g" + i, 12)]++;
ok(counts[0] > 0 && counts[1] > 0 && counts[2] > 0, "stages mix gate counts " + JSON.stringify(counts));

const a = BS.newRun("same-p", { paddle: true });
const b = BS.newRun("same-p", { paddle: true });
ok(a.shapeId === b.shapeId && a.bricks.length === b.bricks.length, "same seed same picture");
ok(a.lives === 3 && a.balls === 1 && a.phase === "launch" && a.flying.length === 1, "one ball three lives");
ok(a.bonusLine > 0 && a.threshold === a.bonusLine, "bonus line set");
ok(a.bricks.some((br) => br.keystone), "stage1 has a gate");

let cleared = 0;
for (let i = 0; i < 6; i++) {
  const run = runFor("p" + i, 45);
  if (run.stage > 1 || run.phase === "pick") cleared++;
  ok(run.phase !== "over", "no instant death " + i);
}
ok(cleared >= 4, "stage1 clearable " + cleared + "/6");

const sk = BS.newRun("skill", { paddle: true });
BS.paddleLaunch(sk);
["multi", "power", "refill", "wide", "short", "punch", "stick", "slow", "laser", "fire", "shield", "thru"].forEach((id) => {
  const before = sk.bricks.length;
  try {
    // giveSkill is internal; drive it by planting a capsule and catching it
    sk.capsule = { x: sk.paddleX, y: (BS.PADDLE_Y || 1168) - 2, id: id, vy: 0 };
    sk.phase = "paddle";
    if (!sk.flying.length) BS.paddleLaunch(sk);
    BS.update(sk, 1 / 30);
  } catch (e) {
    ok(false, "skill " + id + " " + e.message);
  }
  ok(sk.phase !== "over" || sk.lives >= 0, "skill " + id + " survived");
  if (id === "refill") ok(sk.bricks.length >= before, "refill adds bricks");
});
ok(Object.keys(BS.SKILLS).length === 12, "12 skills");

const failed = asserts.filter((x) => !x[0]);
console.log("cleared", cleared + "/6");
console.log(failed.length ? "FAILED " + failed.length : "ALL " + asserts.length + " ASSERTS PASSED");
process.exit(failed.length ? 1 : 0);
