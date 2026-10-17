/* 弹个痛快 BANKSHOT! — pure game logic (no DOM). Works in browser and node. */
(function (root) {
  "use strict";
  var W = 720, H = 1280, COLS = 7, CW = W / COLS, ROWH = 66, TOP = 150, ROWS = 13;
  var LINE_Y = TOP + ROWS * ROWH;      // bottom danger line (1008)
  var LAUNCH_Y = 1150, R = 11, SPEED = 950, SUB = 1 / 600, MINVY = 0.24;
  var MAX_SHOT_T = 14, MULT_CAP = 999, EMIT_GAP = 0.08;
  var PATTERNS = [
    "center", "left", "right", "funnel", "pocket",
    "twin", "zigzag", "stair", "fortress", "alley",
    "offset", "chevron", "gatehouse", "slalom", "breach_wide",
    "corner_L", "corner_R", "mid_shift", "deep_pocket", "narrow"
  ];
  var SCORE_CAP = 1e15, HIT_CAP = 1e9;
  function softCap(n, lo, hi, rate) {
    n = Math.max(0, n || 0);
    return lo + (hi - lo) * (1 - Math.exp(-rate * n));
  }
  function isBossStage(k) {
    // Campaign boss at 7; then a boss every 50 stages (57, 107, …) up through 1000+
    if (k === 7) return true;
    if (k > 7 && (k - 7) % 50 === 0) return true;
    return false;
  }

  function mulberry(s) { s = (s + 0x6D2B79F5) | 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return [s, ((t ^ (t >>> 14)) >>> 0) / 4294967296]; }
  function rnd(run, k) { var o = mulberry(run[k]); run[k] = o[0]; return o[1]; }
  function hashStr(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; }

  var CARDS = {
    split:   { kind: "ball",  name: "分裂弹", icon: "◎", desc: "每颗弹珠第一次撞墙时分裂成 2 颗" },
    fire:    { kind: "ball",  name: "火球",   icon: "🔥", desc: "打碎砖块时对周围 4 格溅射 1 伤害" },
    pierce:  { kind: "ball",  name: "穿透",   icon: "➶", desc: "每颗弹珠可直接穿过前 2 块砖" },
    boomer:  { kind: "relic", name: "回力镖", icon: "↺", desc: "撞顶墙时倍率 ×2（而不是 +1）" },
    billiard:{ kind: "relic", name: "台球手", icon: "🎱", desc: "首次撞墙前不计分；首次撞墙额外 +3 倍" },
    miser:   { kind: "relic", name: "守财奴", icon: "¥",  desc: "每持有 5 金币，弹珠起始倍率 +1" },
    lowfly:  { kind: "relic", name: "低空飞行", icon: "⚠", desc: "最低的砖越接近底线，起始倍率越高" },
    chain:   { kind: "relic", name: "连锁反应", icon: "✸", desc: "炸弹炸到炸弹会继续引爆，炸弹伤害 +3" },
    frugal:  { kind: "relic", name: "节俭",   icon: "✂", desc: "每关少 1 发，但门槛 -35%" },
    double:  { kind: "relic", name: "双响",   icon: "‼", desc: "每关第一发弹珠数量翻倍" },
    plusball:{ kind: "up",    name: "+2 弹珠", icon: "+2", desc: "本局永久多 2 颗弹珠", repeat: true },
    sight:   { kind: "up",    name: "鹰眼",   icon: "👁", desc: "瞄准线多预览一次反弹", repeat: true, max: 2 }
  };
  var BOSS_RULES = {
    armor: { name: "坚甲", desc: "只有撞过墙的弹珠才能伤到 Boss；先打破绽砖可破甲" },
    regen: { name: "再生", desc: "每发结束 Boss 回复 5% 血量；打破绽砖可禁疗一发" }
  };

  function threshold(run, k) {
    // Soft asymptotic growth → stage 1000 stays finite & playable.
    // Trap/keystone is the skill gate; numbers ramp gently then flatten.
    if (isBossStage(k)) return 0;
    var t;
    if (k <= 1) t = 50;
    else if (k <= 6) t = 70 * Math.pow(1.9, k - 1);
    else {
      // After campaign: ~2.4k → approaches ~160k by late game (not exponential blow-up)
      var n = k - 7;
      t = softCap(n, 2400, 160000, 0.0055);
    }
    if (run.cards && run.cards.frugal) t *= 0.65;
    if (!isFinite(t) || t !== t) t = 160000;
    return Math.max(10, Math.round(Math.min(t, 500000) / 10) * 10);
  }

  function newRun(seed, opts) {
    opts = opts || {};
    var run = {
      seed: seed, rb: hashStr("b" + seed), rc: hashStr("c" + seed), stage: 1, score: 0, total: 0, coins: 0,
      balls: 3, cards: {}, sight: 1, bricks: [], launchX: W / 2, nextX: null, flying: [], queue: 0, emitT: 0,
      phase: "aim", ev: [], maxMult: 1, marks: [], safety: opts.safety ? 1 : 0, shotT: 0, acc: 0,
      shotsLeft: 5, shotIdx: 0, shotPts: 0, reroll: 2, offer: null, bossRule: null, bricksBroken: 0, endless: false,
      daily: !!opts.daily, dirty: true, map: null, lostBy: 0, trapPattern: null, breached: false, bossWeak: false
    };
    run.threshold = threshold(run, 1);
    buildTrapBoard(run, 4);
    return run;
  }

  function hpFor(run) {
    var k = run.stage;
    var base = softCap(k, 1.4, 20, 0.011);
    var hp = Math.round(base * (0.8 + rnd(run, "rb") * 0.55));
    return Math.max(1, Math.min(36, hp));
  }
  function gateHp(run) {
    var k = run.stage;
    if (k <= 2) return 3 + Math.floor(rnd(run, "rb") * 2);
    if (k <= 4) return 5 + Math.floor(rnd(run, "rb") * 3);
    var g = softCap(k, 6, 22, 0.009) + rnd(run, "rb") * 2;
    return Math.max(3, Math.min(26, Math.round(g)));
  }
  function armorHp(run) {
    return Math.min(80, gateHp(run) * 3 + 4);
  }

  function pickPattern(run) {
    // Deterministic from run seed + stage → daily/replay stable, variety to 1000+
    var h = Math.abs(hashStr(String(run.seed) + "#trap#" + run.stage)) >>> 0;
    if (run.stage <= 2) return (h & 1) ? "center" : "left";
    if (run.stage === 3) return "right";
    if (run.stage === 4) return "funnel";
    if (run.stage === 5) return "pocket";
    if (run.stage === 6) return "fortress";
    return PATTERNS[h % PATTERNS.length];
  }

  function beginStageRng(run) {
    run.rb = hashStr("b" + String(run.seed) + ":s" + run.stage + ":v5");
  }

  function pushBrick(run, c, r, opts) {
    opts = opts || {};
    var hp = opts.hp != null ? opts.hp : hpFor(run);
    run.bricks.push({
      c: c, r: r, cw: opts.cw || 1, ch: opts.ch || 1,
      hp: hp, max: hp,
      type: opts.type || "n",
      flash: 0,
      locked: !!opts.locked,
      keystone: !!opts.keystone
    });
  }

  function fillLockedCluster(run, r0, r1, preferCols) {
    var k = run.stage;
    for (var r = r0; r <= r1; r++) {
      for (var c = 0; c < COLS; c++) {
        if (preferCols && preferCols.indexOf(c) < 0 && rnd(run, "rb") > 0.35) continue;
        if (rnd(run, "rb") < 0.12) continue;
        var type = "n", x = rnd(run, "rb"), hp = hpFor(run);
        if (x < 0.18) type = "gold";
        else if (k >= 2 && x < 0.34) type = "bomb";
        else if (k >= 2 && x < 0.44) { type = "plus"; hp = 1; }
        else if (k >= 4 && x < 0.52) type = "mult";
        // denser / slightly tankier behind the gate so breach feels rewarding
        if (type === "n") hp = Math.max(hp, Math.round(hp * 1.15));
        pushBrick(run, c, r, { type: type, hp: hp, locked: true });
      }
    }
  }

  function placeArmorWall(run, wallRow, gateCol) {
    for (var c = 0; c < COLS; c++) {
      if (c === gateCol) {
        pushBrick(run, c, wallRow, { type: "gate", hp: gateHp(run), keystone: true });
      } else {
        pushBrick(run, c, wallRow, { type: "armor", hp: armorHp(run) });
      }
    }
  }

  function fillAccessible(run, r0, r1) {
    for (var r = r0; r <= r1; r++) {
      var n = 1 + Math.floor(rnd(run, "rb") * 2); // 1–2 sparse
      var cols = [0, 1, 2, 3, 4, 5, 6];
      for (var i = cols.length - 1; i > 0; i--) {
        var j = Math.floor(rnd(run, "rb") * (i + 1)); var t = cols[i]; cols[i] = cols[j]; cols[j] = t;
      }
      for (i = 0; i < n; i++) {
        var c = cols[i], type = "n", x = rnd(run, "rb"), hp = Math.max(1, Math.round(hpFor(run) * 0.7));
        if (run.stage >= 2 && x < 0.12) { type = "plus"; hp = 1; }
        else if (x < 0.08) type = "gold";
        pushBrick(run, c, r, { type: type, hp: hp, locked: false });
      }
    }
  }

  /** Build a trap layout: exactly one keystone gate + locked high-value zone behind armor wall. */
  function buildTrapBoard(run, rows) {
    rows = rows || 4;
    beginStageRng(run);
    run.bricks = [];
    run.breached = false;
    var pat = pickPattern(run);
    run.trapPattern = pat;

    var gateCol = 3, wallRow = Math.min(2, Math.max(1, rows - 2));
    var prefer = null;
    var h = Math.abs(hashStr(String(run.seed) + "#g#" + run.stage)) >>> 0;

    if (pat === "left" || pat === "corner_L") gateCol = 1;
    else if (pat === "right" || pat === "corner_R") gateCol = 5;
    else if (pat === "center" || pat === "breach_wide") gateCol = 3;
    else if (pat === "offset" || pat === "mid_shift") gateCol = 2 + (h % 3); // 2,3,4
    else if (pat === "narrow") gateCol = 3;
    else if (pat === "alley" || pat === "slalom") gateCol = (h & 1) ? 2 : 4;
    else if (pat === "pocket" || pat === "deep_pocket") {
      gateCol = (h & 1) ? 1 : 5;
      prefer = gateCol <= 2 ? [0, 1, 2, 3] : [3, 4, 5, 6];
    } else if (pat === "twin" || pat === "gatehouse" || pat === "fortress") {
      gateCol = 3;
    } else if (pat === "zigzag" || pat === "stair" || pat === "chevron") {
      gateCol = 1 + (h % 5);
    } else if (pat === "funnel") {
      gateCol = 3;
    } else {
      gateCol = h % COLS;
    }

    // Funnel / fortress / twin side armor flavor (still exactly one keystone on wallRow)
    if (pat === "funnel" || pat === "fortress" || pat === "chevron") {
      wallRow = Math.min(2, rows - 2);
      if (wallRow >= 1) {
        var fr = wallRow - 1;
        pushBrick(run, 0, fr, { type: "armor", hp: armorHp(run), locked: true });
        pushBrick(run, 6, fr, { type: "armor", hp: armorHp(run), locked: true });
        if (rows >= 4 && (pat === "funnel" || pat === "fortress")) {
          pushBrick(run, 1, Math.max(0, fr - 1), { type: "armor", hp: armorHp(run), locked: true });
          pushBrick(run, 5, Math.max(0, fr - 1), { type: "armor", hp: armorHp(run), locked: true });
        }
      }
    } else if (pat === "twin" || pat === "gatehouse") {
      // Extra armor pillars flanking the gate column on wall row neighbors above
      if (wallRow >= 1) {
        var pc = Math.max(0, gateCol - 2), qc = Math.min(COLS - 1, gateCol + 2);
        pushBrick(run, pc, wallRow - 1, { type: "armor", hp: armorHp(run), locked: true });
        pushBrick(run, qc, wallRow - 1, { type: "armor", hp: armorHp(run), locked: true });
      }
    } else if (pat === "stair" || pat === "zigzag" || pat === "slalom") {
      if (wallRow >= 1) {
        var sc = (gateCol + 3) % COLS;
        pushBrick(run, sc, wallRow - 1, { type: "armor", hp: armorHp(run), locked: true });
      }
    } else if (pat === "alley" || pat === "narrow") {
      // Tall side walls forcing a corridor toward the gate
      for (var ar = 0; ar < wallRow; ar++) {
        if (gateCol > 0) pushBrick(run, 0, ar, { type: "armor", hp: armorHp(run), locked: true });
        if (gateCol < COLS - 1) pushBrick(run, COLS - 1, ar, { type: "armor", hp: armorHp(run), locked: true });
      }
    }

    // Locked cluster above the wall
    if (wallRow > 0) fillLockedCluster(run, 0, wallRow - 1, prefer);

    // Armor wall + single keystone gap
    placeArmorWall(run, wallRow, gateCol);

    // Sparse free zone below (approach lane)
    if (wallRow + 1 <= rows - 1) fillAccessible(run, wallRow + 1, rows - 1);

    // Stage 1: guarantee a gold in locked zone for the “爽清” moment
    if (run.stage === 1) {
      var locked = run.bricks.filter(function (b) { return b.locked && b.type === "n"; });
      if (locked.length) locked[Math.floor(rnd(run, "rb") * locked.length)].type = "gold";
    }

    // Safety: ensure exactly one keystone
    var keys = run.bricks.filter(function (b) { return b.keystone; });
    if (keys.length === 0) {
      pushBrick(run, gateCol, wallRow, { type: "gate", hp: gateHp(run), keystone: true });
    } else if (keys.length > 1) {
      for (var i = 1; i < keys.length; i++) { keys[i].keystone = false; keys[i].type = "armor"; }
    }

    run.dirty = true;
  }

  function keystoneOf(run) {
    for (var i = 0; i < run.bricks.length; i++) {
      var b = run.bricks[i];
      if (b.keystone && b.hp > 0) return b;
    }
    return null;
  }
  function isSealed(run) { return !!keystoneOf(run); }

  function unlockBoard(run) {
    var n = 0;
    for (var i = 0; i < run.bricks.length; i++) {
      if (run.bricks[i].locked) { run.bricks[i].locked = false; n++; }
    }
    run.breached = true;
    return n;
  }


  /** Boss stages: light side pressure only — never bury the weak point column. */
  function spawnBossPressure(run) {
    var wk = run.bricks.filter(function (b) { return b.type === "weak" && b.hp > 0; })[0];
    var forbid = {};
    if (wk) forbid[wk.c] = 1;
    // also keep columns under boss clear-ish
    var bo = run.bricks.filter(function (b) { return b.type === "boss"; })[0];
    if (bo) for (var dc = 0; dc < bo.cw; dc++) forbid[bo.c + dc] = 1;
    var n = run.shotIdx <= 2 ? (rnd(run, "rb") < 0.45 ? 1 : 0) : 1 + (rnd(run, "rb") < 0.35 ? 1 : 0);
    var cols = [0, 1, 2, 3, 4, 5, 6].filter(function (c) { return !forbid[c]; });
    for (var i = cols.length - 1; i > 0; i--) { var j = Math.floor(rnd(run, "rb") * (i + 1)); var t = cols[i]; cols[i] = cols[j]; cols[j] = t; }
    for (i = 0; i < n && i < cols.length; i++) {
      var hp = Math.max(1, Math.round(hpFor(run) * 0.7));
      pushBrick(run, cols[i], 0, { type: "n", hp: hp, locked: false });
    }
    run.dirty = true;
  }
  function spawnRow(run, r) {
    // During play: new top rows are unlocked pressure — lighter while sealed so trap stays fair
    var sealed = isSealed(run);
    var k = run.stage;
    var n = sealed
      ? 1 + (rnd(run, "rb") < 0.4 ? 1 : 0)
      : (k === 1 ? 2 + (rnd(run, "rb") < 0.4 ? 1 : 0) : Math.min(5, 2 + Math.floor(rnd(run, "rb") * (2 + Math.min(k, 6) / 4))));
    var cols = [0, 1, 2, 3, 4, 5, 6];
    for (var i = cols.length - 1; i > 0; i--) { var j = Math.floor(rnd(run, "rb") * (i + 1)); var t = cols[i]; cols[i] = cols[j]; cols[j] = t; }
    for (i = 0; i < n; i++) {
      var c = cols[i], hp = Math.max(1, Math.round(hpFor(run) * (sealed ? 0.75 : 1))), type = "n", x = rnd(run, "rb");
      if (x < 0.06) type = "gold";
      else if (!sealed && k >= 2 && x < 0.14) type = "bomb";
      else if (k >= 2 && x < 0.2) { type = "plus"; hp = 1; }
      else if (!sealed && k >= 4 && x < 0.25) type = "mult";
      pushBrick(run, c, r, { type: type, hp: hp, locked: false });
    }
    run.dirty = true;
  }
  function rect(b) { return { x: b.c * CW + 4, y: TOP + b.r * ROWH + 4, w: b.cw * CW - 8, h: b.ch * ROWH - 8 }; }

  function buildMap(run) {
    var m = {};
    for (var i = 0; i < run.bricks.length; i++) {
      var b = run.bricks[i]; if (b.hp <= 0) continue;
      for (var dr = 0; dr < b.ch; dr++) for (var dc = 0; dc < b.cw; dc++) m[(b.r + dr) * 8 + b.c + dc] = b;
    }
    run.map = m; run.dirty = false;
  }
  function at(run, c, r) { if (run.dirty) buildMap(run); return run.map[r * 8 + c]; }

  function startMult(run) {
    var m = 1;
    if (run.cards.miser) m += Math.floor(run.coins / 5);
    if (run.cards.lowfly) { var lr = lowestRow(run); if (lr >= 5) m += (lr - 4) * 2; }
    return m;
  }
  function lowestRow(run) { var lr = -1; for (var i = 0; i < run.bricks.length; i++) { var b = run.bricks[i]; if (b.hp > 0) lr = Math.max(lr, b.r + b.ch - 1); } return lr; }

  function clampAngle(a) { var lo = 13 * Math.PI / 180, hi = Math.PI - lo; return Math.max(lo, Math.min(hi, a)); }
  function fire(run, angle) {
    if (run.phase !== "aim") return false;
    angle = clampAngle(angle);
    run.angle = angle; run.phase = "fly"; run.shotT = 0; run.shotPts = 0; run.emitT = 0; run.recalled = false;
    run.queue = run.balls * (run.cards.double && run.shotIdx === 0 ? 2 : 1);
    run.sm = startMult(run); run.nextX = null; run.shotMax = 1;
    return true;
  }

  function emit(run) {
    var a = run.angle;
    run.flying.push({ x: run.launchX, y: LAUNCH_Y, vx: Math.cos(a) * SPEED, vy: -Math.sin(a) * SPEED, mult: run.sm,
      walls: 0, clone: false, pierce: run.cards.pierce ? 2 : 0, ign: null, trail: [],
      fire: !!run.cards.fire, split: !!run.cards.split, piercer: !!run.cards.pierce });
    run.queue--;
  }

  function addMult(run, ball, v, times) {
    ball.mult = Math.min(MULT_CAP, times ? ball.mult * v : ball.mult + v);
    if (ball.mult > run.shotMax) run.shotMax = ball.mult;
    if (ball.mult > run.maxMult) { var old = run.maxMult; run.maxMult = ball.mult;
      [16, 32, 64, 128].forEach(function (th) { if (old < th && ball.mult >= th) run.ev.push({ t: "big", m: th }); }); }
  }

  function damage(run, b, ball, dmg, src) {
    if (b.hp <= 0) return;
    if (b.type === "boss" && run.bossRule === "armor" && !run.bossWeak && ball && ball.walls === 0 && src === "ball") {
      run.ev.push({ t: "clank", x: ball.x, y: ball.y }); b.flash = 0.5; return;
    }
    // Locked zone: area effects chip only while sealed (physical wall is main gate; this stops cheese clears)
    if (b.locked && isSealed(run) && (src === "bomb" || src === "fire")) {
      dmg = Math.min(1, dmg);
    }
    // Armor / gate resist full bomb wipes
    if ((b.type === "armor" || b.type === "gate") && src === "bomb") {
      dmg = Math.min(3, dmg);
    }
    // Boss HP: ball hits deal real chunk damage (v4 bug: only scored base=6 but HP -= 1 → unwinnable for humans)
    var hpDmg = dmg;
    if (b.type === "boss" && src === "ball") hpDmg = run.bossWeak ? 10 : 6;
    else if (b.type === "weak" && src === "ball") hpDmg = Math.max(dmg, 3);
    else if (b.type === "boss" && (src === "bomb" || src === "fire")) hpDmg = Math.max(dmg, run.bossWeak ? 10 : 6);
    hpDmg = Math.min(hpDmg, b.hp);
    var mult = ball ? ball.mult : 1;
    var base = b.type === "boss" ? (run.bossWeak ? 10 : 6) : (b.type === "gate" || b.type === "armor" ? Math.max(2, Math.min(b.hp, dmg + 1)) : b.hp);
    var pts = ball && run.cards.billiard && ball.walls === 0 ? 0 : Math.round(base * mult * Math.max(1, hpDmg) / Math.max(1, hpDmg));
    // Gate hits score a bit extra so aiming the gap feels rewarded
    if (b.type === "gate" && src === "ball") pts = Math.round(pts * 1.5);
    b.hp -= hpDmg; b.flash = 1;
    if (!isFinite(pts) || pts !== pts || pts < 0) pts = 0;
    pts = Math.min(HIT_CAP, pts);
    run.score = Math.min(SCORE_CAP, run.score + pts);
    run.total = Math.min(SCORE_CAP, run.total + pts);
    run.shotPts = Math.min(HIT_CAP, run.shotPts + pts);
    var rc = rect(b);
    run.ev.push({ t: "hit", x: ball ? ball.x : rc.x + rc.w / 2, y: ball ? ball.y : rc.y + rc.h / 2, pts: pts, mult: mult, type: b.type,
      fire: !!(ball && ball.fire), split: !!(ball && ball.split), piercer: !!(ball && ball.piercer), src: src });
    if (b.type === "mult" && ball && src === "ball") { addMult(run, ball, 2, true); run.ev.push({ t: "x2", x: ball.x, y: ball.y }); }
    if (b.hp <= 0) {
      b.hp = 0; run.dirty = true; run.bricksBroken++;
      if (ball) addMult(run, ball, 0.5);
      run.ev.push({ t: "break", x: rc.x + rc.w / 2, y: rc.y + rc.h / 2, type: b.type, w: rc.w, h: rc.h,
        fire: !!(ball && ball.fire), split: !!(ball && ball.split), piercer: !!(ball && ball.piercer) });
      if (b.type === "gold") { run.coins += 2; run.ev.push({ t: "coin", x: rc.x + rc.w / 2, y: rc.y, n: 2 }); }
      if (b.type === "plus") { run.balls += 1; run.ev.push({ t: "plus", x: rc.x + rc.w / 2, y: rc.y }); }
      if (b.type === "bomb") explode(run, b, ball, 0);
      if (b.keystone) {
        var unlocked = unlockBoard(run);
        run.ev.push({ t: "breach", x: rc.x + rc.w / 2, y: rc.y + rc.h / 2, unlocked: unlocked });
      }
      if (b.type === "weak") {
        run.bossWeak = true;
        run.ev.push({ t: "weakBreak", x: rc.x + rc.w / 2, y: rc.y + rc.h / 2 });
      }
      if (run.cards.fire && src === "ball") {
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
          var nb = at(run, b.c + d[0], b.r + d[1]);
          if (nb && nb !== b) damage(run, nb, ball, 1, "fire");
        });
      }
    }
  }
  function explode(run, b, ball, depth) {
    run.ev.push({ t: "boom", x: rect(b).x + CW / 2, y: rect(b).y + ROWH / 2 });
    var dmgBoss = run.cards.chain ? 8 : 5;
    var hit = [];
    for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
      var nb = at(run, b.c + dc, b.r + dr);
      if (nb && nb !== b && nb.hp > 0 && hit.indexOf(nb) < 0) hit.push(nb);
    }
    hit.forEach(function (nb) {
      if (nb.type === "boss") { damage(run, nb, ball, dmgBoss, "bomb"); return; }
      if (nb.type === "bomb" && run.cards.chain && depth < 20) { var h = nb.hp; damage(run, nb, ball, h, "bomb"); return; }
      var t0 = nb.type; if (t0 === "bomb") nb.type = "n";
      damage(run, nb, ball, nb.hp, "bomb");
    });
  }

  function wallBounce(run, ball, side) {
    ball.walls++;
    if (side === "top" && run.cards.boomer) addMult(run, ball, 2, true); else addMult(run, ball, 1);
    if (ball.walls === 1 && run.cards.billiard) addMult(run, ball, 3);
    run.ev.push({ t: "wall", x: ball.x, y: ball.y, mult: ball.mult, fire: !!ball.fire, split: !!ball.split, piercer: !!ball.piercer });
    if (ball.walls === 1 && run.cards.split && !ball.clone) {
      var a = Math.atan2(ball.vy, ball.vx) + 0.35;
      var nb = { x: ball.x, y: ball.y, vx: Math.cos(a) * SPEED, vy: Math.sin(a) * SPEED, mult: ball.mult, walls: ball.walls, clone: true, pierce: ball.pierce, ign: null, trail: [],
        fire: !!ball.fire, split: true, piercer: !!ball.piercer };
      fixVy(nb); run.flying.push(nb); run.ev.push({ t: "split", x: ball.x, y: ball.y, fire: !!ball.fire, piercer: !!ball.piercer });
    }
  }
  function fixVy(ball) {
    var s = Math.hypot(ball.vx, ball.vy) || SPEED, min = MINVY * SPEED;
    if (Math.abs(ball.vy) < min) { ball.vy = (ball.vy > 0 ? 1 : -1) * min; var sx = Math.sqrt(Math.max(0, SPEED * SPEED - min * min)); ball.vx = (ball.vx >= 0 ? 1 : -1) * sx; }
    else if (Math.abs(s - SPEED) > 1) { ball.vx *= SPEED / s; ball.vy *= SPEED / s; }
  }

  function moveBall(run, ball, dt, ghost) {
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    var bounced = null;
    if (ball.x < R) { ball.x = R; ball.vx = Math.abs(ball.vx); bounced = "side"; }
    else if (ball.x > W - R) { ball.x = W - R; ball.vx = -Math.abs(ball.vx); bounced = "side"; }
    if (ball.y < TOP + R) { ball.y = TOP + R; ball.vy = Math.abs(ball.vy); bounced = "top"; }
    if (bounced) { if (!ghost) wallBounce(run, ball, bounced); fixVy(ball); return bounced; }
    if (ball.recall) return null;
    var c0 = Math.floor((ball.x - R) / CW), c1 = Math.floor((ball.x + R) / CW);
    var r0 = Math.floor((ball.y - R - TOP) / ROWH), r1 = Math.floor((ball.y + R - TOP) / ROWH);
    var best = null, bd = 1e9, bcx = 0, bcy = 0, seen = [];
    if (ball.ign) { var ir = rect(ball.ign); var ox = Math.max(ir.x, Math.min(ball.x, ir.x + ir.w)), oy = Math.max(ir.y, Math.min(ball.y, ir.y + ir.h)); if (ball.ign.hp <= 0 || Math.hypot(ball.x - ox, ball.y - oy) > R) ball.ign = null; }
    for (var r = Math.max(0, r0); r <= Math.min(ROWS + 2, r1); r++) for (var c = Math.max(0, c0); c <= Math.min(COLS - 1, c1); c++) {
      var b = at(run, c, r); if (!b || b.hp <= 0 || seen.indexOf(b) >= 0 || b === ball.ign) continue; seen.push(b);
      var q = rect(b), cx = Math.max(q.x, Math.min(ball.x, q.x + q.w)), cy = Math.max(q.y, Math.min(ball.y, q.y + q.h));
      var d = Math.hypot(ball.x - cx, ball.y - cy);
      if (d < R && d < bd) { bd = d; best = b; bcx = cx; bcy = cy; }
    }
    if (!best) return null;
    if (!ghost && ball.pierce > 0 && best.type !== "boss" && best.type !== "armor") {
      ball.pierce--; ball.ign = best;
      run.ev.push({ t: "pierce", x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy });
      damage(run, best, ball, 1, "ball"); return "pierce";
    }
    var nx, ny;
    if (bd > 1e-6) { nx = (ball.x - bcx) / bd; ny = (ball.y - bcy) / bd; }
    else { var q2 = rect(best); var dl = ball.x - q2.x, dr2 = q2.x + q2.w - ball.x, dt2 = ball.y - q2.y, db = q2.y + q2.h - ball.y, m = Math.min(dl, dr2, dt2, db);
      nx = m === dl ? -1 : m === dr2 ? 1 : 0; ny = nx ? 0 : (m === dt2 ? -1 : 1); bcx = ball.x; bcy = ball.y; if (nx) bcx = nx < 0 ? q2.x : q2.x + q2.w; else bcy = ny < 0 ? q2.y : q2.y + q2.h; }
    ball.x = bcx + nx * (R + 0.01); ball.y = bcy + ny * (R + 0.01);
    var dot = ball.vx * nx + ball.vy * ny;
    if (dot < 0) { ball.vx -= 2 * dot * nx; ball.vy -= 2 * dot * ny; }
    fixVy(ball);
    if (!ghost) damage(run, best, ball, 1, "ball");
    return "brick";
  }

  function preview(run, angle, bounces) {
    angle = clampAngle(angle);
    var g = { x: run.launchX, y: LAUNCH_Y, vx: Math.cos(angle) * SPEED, vy: -Math.sin(angle) * SPEED, walls: 0 };
    var pts = [[g.x, g.y]], n = 0, after = 0, dt = 1 / 900;
    for (var i = 0; i < 6000; i++) {
      var res = moveBall(run, g, dt, true);
      if (res) { pts.push([g.x, g.y]); n++; }
      if (n > bounces) { pts.pop(); pts.push([g.x, g.y]); break; }
      if (n === bounces) { after += SPEED * dt; if (after > 260) { pts.push([g.x, g.y]); break; } }
      if (g.y > LAUNCH_Y) { pts.push([g.x, g.y]); break; }
    }
    return pts;
  }

  function update(run, dt) {
    if (run.phase !== "fly") return;
    run.acc += dt;
    while (run.acc >= SUB && run.phase === "fly") { run.acc -= SUB; tick(run, SUB); }
  }
  function tick(run, dt) {
    run.shotT += dt;
    if (run.queue > 0) { run.emitT -= dt; if (run.emitT <= 0) { emit(run); run.emitT = EMIT_GAP; } }
    if (run.shotT > MAX_SHOT_T && !run.recalled) recall(run);
    for (var i = run.flying.length - 1; i >= 0; i--) {
      var b = run.flying[i];
      moveBall(run, b, dt, false);
      if (b.y >= LAUNCH_Y && b.vy > 0) {
        if (run.nextX === null) run.nextX = Math.max(30, Math.min(W - 30, b.x));
        run.flying.splice(i, 1);
      }
    }
    for (var k = 0; k < run.bricks.length; k++) if (run.bricks[k].flash > 0) run.bricks[k].flash -= dt * 6;
    if (run.queue <= 0 && run.flying.length === 0) endShot(run);
  }
  function recall(run) {
    run.recalled = true; run.queue = 0;
    run.flying.forEach(function (b) { b.recall = true; b.vx = 0; b.vy = SPEED * 1.6; });
    run.ev.push({ t: "recall" });
  }

  function endShot(run) {
    run.phase = "after";
    run.bricks = run.bricks.filter(function (b) { return b.hp > 0; });
    run.shotsLeft--; run.shotIdx++;
    if (run.nextX !== null) run.launchX = run.nextX;
    run.ev.push({ t: "shotEnd", pts: run.shotPts, max: run.shotMax });
    var boss = run.bricks.filter(function (b) { return b.type === "boss"; })[0];
    if (isBossStage(run.stage) && !boss) { return winBoss(run); }
    if (isBossStage(run.stage)) {
      // Boss stays put so weak point stays bank-reachable; only clutter drops lightly
      run.bricks.forEach(function (b) {
        if (b.type !== "boss" && b.type !== "weak") b.r++;
      });
      spawnBossPressure(run);
      run.bricks = run.bricks.filter(function (b) {
        if (b.type === "boss" || b.type === "weak") return true;
        if (b.r + b.ch - 1 >= ROWS) return false;
        return !overlapBoss(run, b);
      });
      // Keep weak exposed: never let clutter sit on its cell
      var wk = run.bricks.filter(function (b) { return b.type === "weak"; })[0];
      if (wk) {
        run.bricks = run.bricks.filter(function (b) {
          if (b === wk || b.type === "boss") return true;
          return !(b.c === wk.c && b.r === wk.r);
        });
      }
    } else {
      var drops = 1 + (run.stage === 6 && run.shotIdx % 3 === 0 ? 1 : 0) + (run.endless && run.shotIdx % 3 === 0 ? 1 : 0);
      for (var d = 0; d < drops; d++) {
        run.bricks.forEach(function (b) { b.r++; });
        spawnRow(run, 0);
      }
    }
    if (boss && run.bossRule === "regen" && !run.bossWeak) {
      boss.hp = Math.min(boss.max, boss.hp + Math.round(boss.max * 0.05));
      run.ev.push({ t: "regen" });
    }
    run.dirty = true;
    var lr = lowestRow(run);
    if (lr >= ROWS) {
      if (run.safety > 0) {
        run.safety = 0; run.bricks = run.bricks.filter(function (b) { return b.type === "boss" || b.type === "weak" || b.r + b.ch - 1 < ROWS - 1; }); run.dirty = true;
        run.ev.push({ t: "safety" });
        if (lowestRow(run) >= ROWS) return lose(run, "crush");
      } else return lose(run, "crush");
    }
    if (isBossStage(run.stage)) {
      // Mercy: tiny leftover HP with no shots = still clear (no soft-feel brick)
      if (!boss) return winBoss(run);
      if (run.shotsLeft <= 0) {
        if (boss.hp <= Math.max(10, Math.round(boss.max * 0.12))) return winBoss(run);
        return lose(run, "boss");
      }
      run.phase = "aim"; return;
    }
    if (run.score >= run.threshold) {
      if (run.shotsLeft <= 0) return clearStage(run, false);
      if (!run.greedy) { run.phase = "decide"; return; }
    } else if (run.shotsLeft <= 0) return lose(run, "score");
    run.phase = "aim";
  }
  function overlapBoss(run, b) { var bs = run.bricks.filter(function (x) { return x.type === "boss"; })[0]; return bs && b.c >= bs.c && b.c < bs.c + bs.cw && b.r >= bs.r && b.r < bs.r + bs.ch; }

  function decide(run, cashOut) {
    if (run.phase !== "decide") return;
    if (cashOut) clearStage(run, true); else { run.greedy = true; run.phase = "aim"; }
  }
  function clearStage(run, cashOut) {
    var gain = 0, mark;
    if (cashOut) { gain = 3 * run.shotsLeft; mark = "🟩"; }
    else {
      var thr = Math.max(1, run.threshold || 1);
      var ex = run.score - run.threshold;
      gain = Math.min(12, Math.round(ex / thr * 6));
      if (!isFinite(gain) || gain < 0) gain = 0;
      mark = run.greedy ? "🟨" : "🟥";
    }
    run.coins += gain;
    run.marks.push(mark);
    run.ev.push({ t: "clear", coins: gain, stage: run.stage });
    run.stage++;
    run.offer = makeOffer(run); run.reroll = 2;
    if (!run.offer || !run.offer.length) { run.phase = "pick"; pick(run, null); return; }
    run.phase = "pick";
  }
  function available(run) {
    var nb = 0, nr = 0;
    Object.keys(run.cards).forEach(function (k) { if (CARDS[k].kind === "ball") nb++; if (CARDS[k].kind === "relic") nr++; });
    return Object.keys(CARDS).filter(function (k) {
      var c = CARDS[k]; if (c.repeat) return !(c.max && (run.cards[k] || 0) >= c.max);
      if (run.cards[k]) return false; if (c.kind === "ball" && nb >= 3) return false; if (c.kind === "relic" && nr >= 5) return false; return true;
    });
  }
  function makeOffer(run) {
    var pool = available(run), out = [];
    if (run.stage === 2 && pool.indexOf("split") >= 0 && run.marks.length === 1 && !run.rerolled) { out.push("split"); pool.splice(pool.indexOf("split"), 1); }
    while (out.length < 3 && pool.length) { var i = Math.floor(rnd(run, "rc") * pool.length); out.push(pool.splice(i, 1)[0]); }
    if (!out.length && CARDS.plusball) out.push("plusball");
    return out;
  }
  function doReroll(run) {
    if (run.phase !== "pick" || run.coins < run.reroll) return false;
    run.coins -= run.reroll; run.reroll++; run.rerolled = true; run.offer = makeOffer(run); return true;
  }
  function pick(run, key) {
    if (run.phase !== "pick") return;
    if (key) {
      run.cards[key] = (run.cards[key] || 0) + 1;
      if (key === "plusball") run.balls += 2;
      if (key === "sight") run.sight++;
    }
    startStage(run);
  }
  function startStage(run) {
    var k = run.stage;
    run.score = 0; run.greedy = false; run.shotIdx = 0; run.offer = null; run.rerolled = false;
    run.shotsLeft = run.cards.frugal ? 4 : 5;
    run.threshold = threshold(run, k);
    run.bossWeak = false;
    // Always reset flight / launcher so stage transitions never inherit dead state
    run.flying = []; run.queue = 0; run.emitT = 0; run.acc = 0; run.nextX = null; run.recalled = false;
    if (!isFinite(run.launchX) || run.launchX !== run.launchX) run.launchX = W / 2;
    run.launchX = Math.max(30, Math.min(W - 30, run.launchX));
    if (isBossStage(k)) {
      beginStageRng(run);
      var keys = Object.keys(BOSS_RULES); run.bossRule = keys[Math.floor(rnd(run, "rb") * keys.length)];
      // Stage 7 ≈ 48; late bosses soft-cap ~100
      var hp = Math.round(softCap(k, 48, 100, 0.01));
      run.bricks = [];
      run.bricks.push({ c: 2, r: 1, cw: 3, ch: 2, hp: hp, max: hp, type: "boss", flash: 0, locked: false, keystone: false });
      // Weak point: right side, one row below boss top — clear bank path from bottom-right
      var wh = Math.max(3, Math.min(8, Math.round(softCap(k, 3, 8, 0.012))));
      pushBrick(run, 5, 3, { type: "weak", hp: wh, keystone: false });
      run.shotsLeft = run.cards.frugal ? 6 : 7;
      run.threshold = 0;
      run.trapPattern = "boss";
      run.breached = true;
      run.endless = k > 7 ? true : run.endless;
    } else {
      run.bossRule = null;
      // Fresh trap every stage — never inherit debris. Rows soft-cap at 6.
      var rows = k <= 2 ? 4 : 5;
      if (k >= 8) rows = Math.min(6, 4 + Math.floor(softCap(k - 7, 0, 2, 0.01)));
      buildTrapBoard(run, rows);
      if (k > 7) run.endless = true;
    }
    run.dirty = true; run.phase = "aim";
    run.ev.push({ t: "stage", stage: k, pattern: run.trapPattern });
  }
  function refreshBoard(run, rows) { buildTrapBoard(run, rows || 4); }

  function winBoss(run) {
    run.marks.push("👑");
    // First campaign boss (stage 7) → victory screen. Later bosses (57, 107…) clear like a normal stage.
    if (run.stage === 7 && !run.endless) {
      run.phase = "win"; run.won = true; run.ev.push({ t: "win" });
      return;
    }
    run.coins += 5;
    run.ev.push({ t: "clear", coins: 5, stage: run.stage });
    run.stage++;
    run.offer = makeOffer(run); run.reroll = 2;
    if (!run.offer || !run.offer.length) { run.phase = "pick"; pick(run, null); return; }
    run.phase = "pick";
  }
  function continueEndless(run) {
    run.endless = true;
    run.stage = 8;
    run.bossRule = null;
    run.bossWeak = false;
    run.bricks = [];
    run.dirty = true;
    run.offer = makeOffer(run); run.reroll = 2;
    if (!run.offer || !run.offer.length) { run.phase = "pick"; pick(run, null); return; }
    run.phase = "pick";
  }
  function lose(run, why) {
    run.phase = "over"; run.why = why; run.lostBy = Math.max(0, run.threshold - run.score);
    if (!run.won) run.marks.push("⬛");
    run.ev.push({ t: "lose", why: why });
  }
  function bossOf(run) { return run.bricks.filter(function (b) { return b.type === "boss" && b.hp > 0; })[0]; }

  function shanghaiDate(d) { var t = new Date((d || new Date()).getTime() + 8 * 3600 * 1000); return t.toISOString().slice(0, 10); }
  function shareText(run, dateStr) {
    var grid = run.marks.join("") + "⬜".repeat(Math.max(0, 7 - run.marks.length));
    var build = Object.keys(run.cards).filter(function (k) { return CARDS[k].kind !== "up"; }).map(function (k) { return CARDS[k].name; }).slice(0, 4).join(" + ") || "裸打";
    var head = run.daily ? "弹个痛快 · 每日 " + dateStr.slice(5).replace("-", "/") : "弹个痛快 BANKSHOT!";
    var res = run.why ? ("倒在第 " + run.stage + " 关") : (run.won && !run.endless ? "通关战役！" : ("第 " + run.stage + " 关"));
    return head + "\n" + grid + " " + res + "\n最高倍率 ×" + fmtMult(run.maxMult) + " | 得分 " + run.total.toLocaleString("en-US") + "\n流派：" + build;
  }
  function fmtMult(m) { return m % 1 ? m.toFixed(1) : String(m); }
  function fmtScore(n) {
    if (!isFinite(n) || n !== n) return "0";
    n = Math.max(0, Math.min(SCORE_CAP, n));
    if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.00$/, "") + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.00$/, "") + "M";
    if (n >= 10000) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return Math.round(n).toLocaleString("en-US");
  }

  var API = { W: W, H: H, COLS: COLS, CW: CW, ROWH: ROWH, TOP: TOP, ROWS: ROWS, LINE_Y: LINE_Y, LAUNCH_Y: LAUNCH_Y, R: R, SPEED: SPEED,
    CARDS: CARDS, BOSS_RULES: BOSS_RULES, PATTERNS: PATTERNS, newRun: newRun, fire: fire, update: update, preview: preview, decide: decide, pick: pick,
    reroll: doReroll, continueEndless: continueEndless, rect: rect, lowestRow: lowestRow, bossOf: bossOf, shanghaiDate: shanghaiDate,
    shareText: shareText, fmtMult: fmtMult, fmtScore: fmtScore, hashStr: hashStr, clampAngle: clampAngle, startMult: startMult, recall: recall,
    threshold: threshold, buildTrapBoard: buildTrapBoard, keystoneOf: keystoneOf, isSealed: isSealed, refreshBoard: refreshBoard,
    isBossStage: isBossStage, softCap: softCap, VERSION: "6" };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.BS = API;
})(this);
