// headless sim: novice (random aims) vs smart (best of N sampled angles via cloned rollout)
const BS = require("./core.js");
const clone = r => JSON.parse(JSON.stringify(r));
function playShot(run, a) { BS.fire(run, a); let t = 0; while (run.phase === "fly") { BS.update(run, 1 / 60); t += 1 / 60; run.ev.length = 0; if (t > 30) throw new Error("infinite shot"); } return t; }
const PRIO = ["split", "plusball", "boomer", "pierce", "fire", "chain", "double", "lowfly", "miser", "sight", "billiard", "frugal"];
function play(seed, mode, N) {
  const run = BS.newRun(seed, { safety: false }); let maxT = 0, shots = 0;
  while (run.phase !== "over" && run.phase !== "win" && shots < 200) {
    if (run.phase === "aim") {
      let a;
      if (mode === "novice") a = (30 + Math.random() * 120) * Math.PI / 180;
      else { let best = -1e18; for (let i = 0; i < N; i++) { const ang = mode === "medium" ? (20 + Math.random() * 140) * Math.PI / 180 : (14 + (152 * i) / (N - 1)) * Math.PI / 180; const c = clone(run); playShot(c, ang);
          const v = c.score - (c.phase === "over" ? 1e9 : 0) - Math.max(0, BS.lowestRow(c) - 8) * run.threshold * 0.3; if (v > best) { best = v; a = ang; } } }
      maxT = Math.max(maxT, playShot(run, a)); shots++;
    } else if (run.phase === "decide") BS.decide(run, true);
    else if (run.phase === "pick") { const o = run.offer; let k = mode === "novice" ? o[Math.floor(Math.random() * o.length)] : o.slice().sort((x, y) => PRIO.indexOf(x) - PRIO.indexOf(y))[0]; BS.pick(run, k); }
    else throw new Error("phase " + run.phase);
  }
  return { stage: run.won ? 8 : run.stage, why: run.why, maxT, maxMult: run.maxMult, total: run.total, marks: run.marks.join("") };
}
const mode = process.argv[2] || "smart", n = +process.argv[3] || 20, N = +process.argv[4] || 16;
const res = []; for (let i = 0; i < n; i++) res.push(play("s" + i, mode, N));
const dist = {}; res.forEach(r => dist[r.stage] = (dist[r.stage] || 0) + 1);
console.log(mode, "reached-stage dist", dist, "why", res.map(r => r.why || "win").join(","));
console.log("maxShotTime", Math.max(...res.map(r => r.maxT)).toFixed(1), "avgMaxMult", (res.reduce((s, r) => s + r.maxMult, 0) / n).toFixed(1), "sample", res.slice(0, 4).map(r => r.marks + " " + r.total).join(" | "));
