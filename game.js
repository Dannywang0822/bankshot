/* 弹个痛快 BANKSHOT! — rendering, input, audio, UI */
(function () {
  "use strict";
  var B = window.BS, W = B.W, H = B.H;
  var cv = document.getElementById("c"), ctx = cv.getContext("2d");
  var $ = function (id) { return document.getElementById(id); };
  var run = null, scale = 1, ox = 0, oy = 0, dpr = 1;
  var aiming = false, aimA = Math.PI / 2, aimPt = null, fast = false;
  var parts = [], floats = [], shake = 0, flash = 0, flashCol = "#fff", big = null, banner = null, tutT = 0, shotPop = null, lastT = 0;
  var today = B.shanghaiDate();

  // ---------- storage ----------
  function ld(k, d) { try { var v = localStorage.getItem("bs_" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function sv(k, v) { try { localStorage.setItem("bs_" + k, JSON.stringify(v)); } catch (e) {} }

  // ---------- audio (lazy unlock on first gesture) ----------
  var ac = null;
  function audio() { if (!ac) { try { var A = window.AudioContext || window.webkitAudioContext; if (A) ac = new A(); } catch (e) {} } if (ac && ac.state === "suspended") ac.resume(); return ac; }
  function tone(f, dur, type, g, slide) {
    if (!ac) return; try {
      var t = ac.currentTime, o = ac.createOscillator(), gn = ac.createGain();
      o.type = type || "triangle"; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      gn.gain.setValueAtTime(g || 0.06, t); gn.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(gn); gn.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }
  var PENTA = [0, 2, 4, 7, 9], lastSnd = 0;
  function pitch(m) { var i = Math.min(30, Math.floor(m) - 1), oct = Math.floor(i / 5); return 261.63 * Math.pow(2, oct + PENTA[i % 5] / 12); }
  function vib(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

  // ---------- layout ----------
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    var w = window.innerWidth, h = window.innerHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    scale = Math.min(w / W, h / H); ox = (w - W * scale) / 2; oy = (h - H * scale) / 2;
  }
  window.addEventListener("resize", resize); resize();
  function toLogical(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left - ox) / scale, y: (e.clientY - r.top - oy) / scale }; }

  // ---------- game flow ----------
  function startRun(daily) {
    audio();
    var runs = ld("runs", 0);
    var seed = daily ? "daily-" + today : "free-" + Date.now() + "-" + Math.random();
    run = B.newRun(seed, { daily: daily, safety: runs < 2 });
    sv("runs", runs + 1);
    if (daily) { var st = ld("streak", { last: "", n: 0 }); if (st.last !== today) { var y = B.shanghaiDate(new Date(Date.now() - 864e5)); st.n = st.last === y ? st.n + 1 : 1; st.last = today; sv("streak", st); } }
    parts = []; floats = []; big = null; fast = false; aiming = false;
    hideAll();
    banner = { t: 2.4, a: "第 1 关", b: "先打门闩缺口 · 目标 " + run.threshold + " 分" };
  }
  function hideAll() { ["menu", "decide", "pick", "over"].forEach(function (i) { $(i).classList.add("hidden"); }); }
  function showMenu() {
    hideAll(); $("menu").classList.remove("hidden"); run = null;
    $("dDate").textContent = today.slice(5).replace("-", "/");
    var st = ld("streak", { n: 0 }), db = ld("daily_" + today, null);
    $("stats").innerHTML = "最高分 " + ld("best", 0).toLocaleString() + " · 最高倍率 ×" + B.fmtMult(ld("bestMult", 1)) +
      "<br>通关 " + ld("wins", 0) + " 次 · 每日连续 " + (st.n || 0) + " 天" + (db != null ? "<br>今日每日挑战：" + db.toLocaleString() + " 分" : "");
  }
  $("bDaily").onclick = function () { startRun(true); };
  $("bFree").onclick = function () { startRun(false); };
  $("bCash").onclick = function () { if (!run || run.phase !== "decide") return; B.decide(run, true); $("decide").classList.add("hidden"); };
  $("bGreed").onclick = function () { if (!run || run.phase !== "decide") return; B.decide(run, false); $("decide").classList.add("hidden"); };
  $("bReroll").onclick = function () { if (B.reroll(run)) { tone(660, 0.1, "square", 0.05); renderPick(); } };
  $("bSkip").onclick = function () { $("pick").classList.add("hidden"); B.pick(run, null); };
  $("bAgain").onclick = function () { startRun(!!(run && run.daily)); };
  $("bHome").onclick = showMenu;
  $("bEndless").onclick = function () {
    if (!run || run.phase !== "win") return;
    B.continueEndless(run);
    $("over").classList.add("hidden");
    // Force pick UI even if prevPhase edge-case skipped a frame transition
    setTimeout(function () {
      if (run && run.phase === "pick") { renderPick(); $("pick").classList.remove("hidden"); }
      else if (run && run.phase === "aim") { /* empty offer auto-started */ }
    }, 100);
  };
  function showRecall() { var b = $("bRecall"); if (b) b.classList.remove("hidden"); }
  function hideRecall() { var b = $("bRecall"); if (b) b.classList.add("hidden"); }
  $("bRecall").onclick = function (e) {
    e.preventDefault(); e.stopPropagation();
    if (run && run.phase === "fly" && !run.recalled) { B.recall(run); tone(200, 0.15, "sawtooth", 0.05); hideRecall(); }
  };
  $("bShare").onclick = function () {
    var txt = B.shareText(run, today) + "\n" + location.href.split("?")[0];
    var done = function () { toast("战绩已复制，去群里晒一下！"); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt); done(); });
    else { fallbackCopy(txt); done(); }
  };
  function fallbackCopy(t) { var ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove(); }
  function toast(s) { var el = $("toast"); el.textContent = s; el.classList.remove("hidden"); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.add("hidden"); }, 1800); }

  function renderPick() {
    var p = $("cards"); p.innerHTML = "";
    var kinds = { ball: "弹珠", relic: "遗物", up: "强化" };
    $("pickTitle").textContent = "第 " + (run.stage - 1) + " 关通过！";
    var hint = "";
    if (B.isBossStage(run.stage)) hint = " · 下一关是 Boss！";
    else hint = " · 下一关目标 " + B.fmtScore(B.threshold(run, run.stage)) + " 分";
    $("pickSub").textContent = "三选一 · 金币 " + run.coins + hint;
    var offer = run.offer || [];
    if (!offer.length) p.innerHTML = '<p class="sub">没有新卡可拿，点击跳过继续</p>';
    offer.forEach(function (k) {
      var c = B.CARDS[k]; if (!c) return;
      var d = document.createElement("div");
      d.className = "card " + c.kind;
      d.innerHTML = '<div class="ic">' + c.icon + '</div><div><div class="nm">' + c.name + '<span class="kd">' + kinds[c.kind] + '</span></div><div class="ds">' + c.desc + "</div></div>";
      d.onclick = function () { tone(880, 0.12, "triangle", 0.07); $("pick").classList.add("hidden"); hideRecall(); B.pick(run, k); };
      p.appendChild(d);
    });
    var rb = $("bReroll"); rb.textContent = "刷新（" + run.reroll + " 金币）"; rb.disabled = run.coins < run.reroll || !offer.length;
  }

  function finish() {
    var cleared = !!run.won;
    var endlessDead = cleared && run.endless && run.why;
    $("ovTitle").textContent = endlessDead ? "无尽终结" : cleared ? "通关！👑" : run.why === "crush" ? "被砖墙压垮了" : "差一点！";
    var sub = "";
    if (endlessDead && run.why === "score") sub = "第 " + run.stage + " 关还差 <b>" + B.fmtScore(run.lostBy) + "</b> 分 · 总分 " + B.fmtScore(run.total);
    else if (endlessDead && run.why === "crush") sub = "第 " + run.stage + " 关被压垮 · 总分 " + B.fmtScore(run.total);
    else if (endlessDead) sub = "总分 " + B.fmtScore(run.total);
    else if (!cleared && run.why === "score") sub = "还差 <b>" + B.fmtScore(run.lostBy) + "</b> 分就过关";
    else if (!cleared && run.why === "boss") { var bo = B.bossOf(run); sub = "Boss 还剩 <b>" + (bo ? bo.hp : 0) + "</b> 血"; }
    else if (!cleared) sub = "砖块压到了红线（第 " + run.stage + " 关）";
    else sub = "总分 " + B.fmtScore(run.total) + " · 可继续挑战至 1000+ 关";
    $("ovSub").innerHTML = sub;
    $("ovShare").textContent = B.shareText(run, today);
    $("bEndless").classList.toggle("hidden", !(cleared && !run.endless && !run.why));
    if (run.total > ld("best", 0)) sv("best", run.total);
    if (run.maxMult > ld("bestMult", 1)) sv("bestMult", run.maxMult);
    if (cleared && !run.endless) sv("wins", ld("wins", 0) + 1);
    if (run.daily) { var db = ld("daily_" + today, null); if (db == null || run.total > db) sv("daily_" + today, run.total); }
    setTimeout(function () { $("over").classList.remove("hidden"); }, cleared && !endlessDead ? 900 : 700);
  }

  // ---------- events -> juice ----------
  function burst(x, y, col, n, sp) { for (var i = 0; i < n; i++) { var a = Math.random() * 6.283, s = (0.3 + Math.random()) * (sp || 300); parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 100, life: 0.5 + Math.random() * 0.4, col: col, sz: 4 + Math.random() * 6 }); } }
  function fl(x, y, txt, col, sz) { floats.push({ x: x, y: y, txt: txt, col: col || "#fff", sz: sz || 30, life: 0.9 }); }
  var BCOL = { n: "#5b8cff", gold: "#ffcc33", bomb: "#ff4d5e", plus: "#39e58c", mult: "#b45bff", boss: "#ff3d8b", gate: "#e8c36a", armor: "#6a6578", weak: "#ff7ad9" };
  function drain() {
    var now = performance.now();
    run.ev.forEach(function (e) {
      switch (e.t) {
        case "wall": if (now - lastSnd > 25) { tone(pitch(e.mult), 0.12, "triangle", 0.05); lastSnd = now; } burst(e.x, e.y, multCol(e.mult), 3, 150); break;
        case "hit": if (e.pts > 0) fl(e.x, e.y - 10, "+" + e.pts, multCol(e.mult), 24 + Math.min(20, Math.log2(e.pts + 1) * 2)); if (now - lastSnd > 20) { tone(pitch(e.mult) * 2, 0.06, "sine", 0.035); lastSnd = now; } break;
        case "break": burst(e.x, e.y, BCOL[e.type] || "#fff", 12, 380); tone(1400 + Math.random() * 400, 0.05, "square", 0.025); vib(10); shake = Math.max(shake, 4); break;
        case "coin": fl(e.x, e.y, "+" + e.n + " ¥", "#ffcc33", 34); tone(1568, 0.15, "triangle", 0.07); setTimeout(function () { tone(2093, 0.18, "triangle", 0.06); }, 70); break;
        case "plus": fl(e.x, e.y, "+1 弹珠", "#39e58c", 34); tone(990, 0.2, "sine", 0.07, 1500); break;
        case "x2": fl(e.x, e.y - 30, "×2!", "#d58bff", 40); tone(700, 0.15, "sawtooth", 0.04, 1400); break;
        case "boom": burst(e.x, e.y, "#ff8a3d", 26, 600); tone(120, 0.35, "sawtooth", 0.12, 40); vib(30); shake = Math.max(shake, 14); break;
        case "split": burst(e.x, e.y, "#3fd4ff", 8, 250); break;
        case "clank": if (now - lastSnd > 40) { tone(180, 0.08, "square", 0.04); lastSnd = now; } break;
        case "big": big = { m: e.m, t: 1.3 }; flash = 0.6; flashCol = multCol(e.m); shake = 22; vib([30, 40, 60]); [0, 1, 2, 3].forEach(function (i) { setTimeout(function () { tone(pitch(8 + i * 2 + Math.log2(e.m)) * 1.0, 0.25, "triangle", 0.08); }, i * 70); }); break;
        case "recall": toast("超时，弹珠收回"); break;
        case "shotEnd": fast = false; if (e.pts > 0) shotPop = { pts: e.pts, max: e.max, t: 1.4 }; break;
        case "safety": banner = { t: 2, a: "新手保护", b: "清掉了最低一行（仅一次）" }; flash = 0.4; flashCol = "#39e58c"; break;
        case "breach":
          banner = { t: 1.6, a: "破阵！", b: "缺口已开，大片清除就绪" };
          flash = 0.55; flashCol = "#ffd84a"; shake = Math.max(shake, 16); vib([20, 30, 40]);
          burst(e.x, e.y, "#ffd84a", 28, 520); fl(e.x, e.y - 20, "破阵！", "#ffd84a", 48);
          tone(520, 0.12); setTimeout(function () { tone(780, 0.18); }, 80);
          break;
        case "weakBreak":
          fl(e.x, e.y, "破绽！", "#ff7ad9", 40); burst(e.x, e.y, "#ff7ad9", 16, 400);
          banner = { t: 1.4, a: "破绽击破", b: run.bossRule === "armor" ? "坚甲已破，直击生效" : "再生已抑制" };
          tone(660, 0.15, "triangle", 0.07);
          break;
        case "regen": fl(W / 2, B.TOP + 60, "Boss 回血 +5%", "#ff3d8b", 30); break;
        case "clear": tone(523, 0.12); setTimeout(function () { tone(659, 0.12); }, 90); setTimeout(function () { tone(784, 0.2); }, 180); vib([20, 40, 20, 40, 60]); break;
        case "stage":
          if (B.isBossStage(e.stage)) banner = { t: 3, a: "BOSS · " + B.BOSS_RULES[run.bossRule].name, b: B.BOSS_RULES[run.bossRule].desc + " · " + run.shotsLeft + " 发内击破" };
          else {
            var tip = e.stage <= 2 ? " · 先打门闩缺口！" : (e.stage === 6 ? " · 砖块每 3 发多降一行！" : "");
            var pat = e.pattern && e.pattern !== "boss" ? " · 阵型 " + e.pattern : "";
            banner = { t: 2.2, a: "第 " + e.stage + " 关", b: "目标 " + B.fmtScore(run.threshold) + " 分 · " + run.shotsLeft + " 发" + tip };
          }
          break;
        case "win": flash = 1; flashCol = "#ffd84a"; shake = 26; vib([50, 50, 50, 50, 200]); [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { tone(f, 0.3, "triangle", 0.08); }, i * 120); }); for (var i = 0; i < 6; i++) burst(Math.random() * W, 300 + Math.random() * 500, ["#ffd84a", "#ff3d8b", "#3fd4ff"][i % 3], 20, 500); break;
        case "lose": tone(300, 0.5, "sawtooth", 0.07, 80); vib(200); shake = 18; break;
      }
    });
    run.ev.length = 0;
  }
  function multCol(m) { return m < 3 ? "#ffffff" : m < 6 ? "#fff36b" : m < 12 ? "#ffb13d" : m < 24 ? "#ff5a3d" : m < 48 ? "#ff3d8b" : "#c06bff"; }

  // ---------- input ----------
  var activeId = null;
  cv.addEventListener("pointerdown", function (e) {
    e.preventDefault(); audio();
    if (!run) return;
    if (run.phase === "aim") { activeId = e.pointerId; try { cv.setPointerCapture(e.pointerId); } catch (x) {} aiming = true; aimFrom(toLogical(e)); }
    else if (run.phase === "fly") { fast = !fast; }
  }, { passive: false });
  cv.addEventListener("pointermove", function (e) { if (aiming && e.pointerId === activeId) { e.preventDefault(); aimFrom(toLogical(e)); } }, { passive: false });
  function release(e) {
    if (!aiming || e.pointerId !== activeId) return;
    aiming = false; activeId = null;
    if (e.type === "pointerup" && aimPt && aimPt.ok && run.phase === "aim") {
      if (B.fire(run, aimA)) { tone(440, 0.08, "square", 0.04, 880); vib(8); if (!ld("tut", false)) { sv("tut", true); tutT = 3.5; } if (!ld("trapTut", false)) sv("trapTut", true); }
    }
    aimPt = null;
  }
  cv.addEventListener("pointerup", release); cv.addEventListener("pointercancel", release);
  function aimFrom(p) {
    var dy = B.LAUNCH_Y - p.y, dx = p.x - run.launchX;
    aimPt = { x: p.x, y: p.y, ok: dy > 30 };
    if (aimPt.ok) aimA = B.clampAngle(Math.atan2(dy, dx));
  }
  ["touchstart", "touchmove", "touchend"].forEach(function (t) { document.addEventListener(t, function (e) { if (e.target === cv && e.cancelable) e.preventDefault(); }, { passive: false }); });
  document.addEventListener("gesturestart", function (e) { e.preventDefault(); });
  document.addEventListener("dblclick", function (e) { e.preventDefault(); });

  // ---------- render ----------
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function txt(s, x, y, sz, col, al, wt) { ctx.font = (wt || "800") + " " + sz + "px system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif"; ctx.fillStyle = col; ctx.textAlign = al || "center"; ctx.textBaseline = "middle"; ctx.fillText(s, x, y); }

  function draw(dt) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#14121f"; ctx.fillRect(0, 0, cv.width, cv.height);
    var sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0;
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, (ox + sx * scale) * dpr, (oy + sy * scale) * dpr);
    ctx.fillStyle = "#14121f"; ctx.fillRect(0, 0, W, H);
    // grid backdrop
    ctx.strokeStyle = "rgba(255,255,255,0.035)"; ctx.lineWidth = 1;
    for (var c = 1; c < B.COLS; c++) { ctx.beginPath(); ctx.moveTo(c * B.CW, B.TOP); ctx.lineTo(c * B.CW, B.LINE_Y); ctx.stroke(); }
    // walls glow
    ctx.fillStyle = "#2a2446"; ctx.fillRect(0, B.TOP - 6, W, 6);
    if (!run) { drawIdle(dt); return; }
    var lr = B.lowestRow(run), danger = lr >= B.ROWS - 2;
    // danger line
    ctx.strokeStyle = danger ? "rgba(255,60,80," + (0.6 + 0.4 * Math.sin(performance.now() / 120)) + ")" : "rgba(255,60,80,0.45)"; ctx.lineWidth = 4; ctx.setLineDash([16, 12]);
    ctx.beginPath(); ctx.moveTo(0, B.LINE_Y); ctx.lineTo(W, B.LINE_Y); ctx.stroke(); ctx.setLineDash([]);
    // bricks
    run.bricks.forEach(function (b) {
      if (b.hp <= 0) return;
      var q = B.rect(b), col = BCOL[b.type] || "#5b8cff", f = Math.max(0, b.flash), s = 1 + f * 0.06;
      var warn = b.type !== "boss" && b.r + b.ch - 1 >= B.ROWS - 2;
      var sealed = b.locked && B.isSealed(run);
      ctx.save(); ctx.translate(q.x + q.w / 2, q.y + q.h / 2); ctx.scale(s, s);
      ctx.shadowColor = b.keystone ? "#ffd84a" : col; ctx.shadowBlur = b.keystone ? 22 : 14;
      var fill = b.type === "n" ? hpCol(b.hp) : col;
      if (sealed) fill = "#4a4660";
      rr(-q.w / 2, -q.h / 2, q.w, q.h, 12); ctx.fillStyle = "rgba(20,18,31,0.9)"; ctx.fill();
      ctx.lineWidth = b.keystone || b.type === "gate" ? 6 : (b.type === "armor" ? 5 : 4);
      ctx.strokeStyle = b.keystone ? "#ffd84a" : (warn && Math.sin(performance.now() / 100) > 0 ? "#ff3c50" : fill);
      if (b.keystone && Math.sin(performance.now() / 140) > 0) ctx.strokeStyle = "#fff3b0";
      ctx.stroke();
      ctx.globalAlpha = sealed ? 0.18 : 0.28; ctx.fillStyle = fill; ctx.fill(); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      if (f > 0) { ctx.globalAlpha = f * 0.7; ctx.fillStyle = "#fff"; ctx.fill(); ctx.globalAlpha = 1; }
      if (b.type === "boss") {
        txt("BOSS", 0, -q.h / 2 + 26, 28, "#ffd0e4"); txt(b.hp + "", 0, 14, 54, "#fff");
        ctx.fillStyle = "#3a1530"; ctx.fillRect(-q.w / 2 + 14, q.h / 2 - 20, q.w - 28, 8); ctx.fillStyle = "#ff3d8b"; ctx.fillRect(-q.w / 2 + 14, q.h / 2 - 20, (q.w - 28) * b.hp / b.max, 8);
      } else if (b.type === "gate" || b.keystone) {
        txt("🔒", 0, -10, 22, "#ffd84a"); txt(b.hp + "", 0, 16, 26, "#fff");
      } else if (b.type === "armor") {
        txt("盾", 0, -8, 18, "#a8a3b8"); txt(b.hp + "", 0, 14, 24, "#cfcad8");
      } else if (b.type === "weak") {
        txt("破绽", 0, -10, 18, "#ff7ad9"); txt(b.hp + "", 0, 14, 26, "#fff");
      } else {
        var icon = { gold: "¥", bomb: "✸", plus: "+1", mult: "×2" }[b.type];
        if (sealed) txt("🔐", 0, -8, 16, "#8a849e");
        if (icon && b.type !== "plus") { txt(icon, -q.w / 2 + 16, -q.h / 2 + 15, 18, col); txt(b.hp + "", 4, 2, 30, sealed ? "#8a849e" : "#fff"); }
        else if (b.type === "plus") txt("+1", 0, 2, 30, col);
        else txt(b.hp + "", 0, 2, 30, sealed ? "#8a849e" : "#fff");
      }
      ctx.restore();
    });
    // aim
    if (run.phase === "aim") {
      if (aiming && aimPt && aimPt.ok) {
        var pts = B.preview(run, aimA, run.sight);
        ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 4; ctx.setLineDash([2, 14]); ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); ctx.setLineDash([]);
        for (i = 1; i < pts.length - 1; i++) { ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], 8, 0, 6.283); ctx.fillStyle = "#ffd84a"; ctx.fill(); }
      }
      drawLauncher(run.launchX);
      txt("×" + run.balls + (run.cards.double && run.shotIdx === 0 ? "×2" : ""), run.launchX, B.LAUNCH_Y + 44, 24, "#c9c2e8");
      var sm = B.startMult(run); if (sm > 1) txt("起始倍率 ×" + sm, run.launchX, B.LAUNCH_Y - 40, 20, "#ffb13d");
      if (aiming && aimPt && !aimPt.ok) txt("松手取消", W / 2, B.LAUNCH_Y - 70, 26, "#ff8a9a");
      if (!ld("tut", false) && !aiming && !banner) drawTutorial();
      else if (!ld("trapTut", false) && B.isSealed(run) && !aiming && !banner) {
        ctx.fillStyle = "rgba(10,8,20,0.78)"; rr(50, B.LINE_Y + 20, W - 100, 88, 18); ctx.fill();
        txt("先打缺口 / 门闩 🔒，再清大片", W / 2, B.LINE_Y + 52, 28, "#ffd84a", "center", "900");
        txt("厚甲墙中间发亮的才是突破口", W / 2, B.LINE_Y + 86, 20, "#c9c2e8");
      }
      if (B.isSealed(run)) txt("先破门闩", 24, B.TOP - 18, 18, "#ffd84a", "left");
    } else if (run.phase === "fly" || run.phase === "after") {
      drawLauncher(run.nextX != null ? run.nextX : run.launchX, true);
    }
    // balls
    run.flying.forEach(function (b) {
      var col = multCol(b.mult);
      b.trail.push(b.x, b.y); if (b.trail.length > 16) b.trail.splice(0, 2);
      for (var i = 0; i < b.trail.length; i += 2) { ctx.globalAlpha = (i / b.trail.length) * 0.5; ctx.beginPath(); ctx.arc(b.trail[i], b.trail[i + 1], B.R * (0.4 + i / b.trail.length * 0.6), 0, 6.283); ctx.fillStyle = col; ctx.fill(); }
      ctx.globalAlpha = 1; ctx.shadowColor = col; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(b.x, b.y, B.R, 0, 6.283); ctx.fillStyle = col; ctx.fill(); ctx.shadowBlur = 0;
      if (b.mult >= 2 && run.flying.length <= 14) txt("×" + B.fmtMult(b.mult), b.x, b.y - 24, 18, col);
    });
    // particles
    for (var k = parts.length - 1; k >= 0; k--) { var p = parts[k]; p.life -= dt; if (p.life <= 0) { parts.splice(k, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.col; ctx.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz); }
    ctx.globalAlpha = 1;
    if (floats.length > 40) floats.splice(0, floats.length - 40);
    for (k = floats.length - 1; k >= 0; k--) { var f2 = floats[k]; f2.life -= dt; if (f2.life <= 0) { floats.splice(k, 1); continue; } f2.y -= 60 * dt; ctx.globalAlpha = Math.min(1, f2.life * 2); ctx.lineWidth = 5; ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.font = "900 " + f2.sz + "px system-ui,sans-serif"; ctx.textAlign = "center"; ctx.strokeText(f2.txt, f2.x, f2.y); txt(f2.txt, f2.x, f2.y, f2.sz, f2.col, "center", "900"); }
    ctx.globalAlpha = 1;
    drawHUD();
    // shot summary pop
    if (shotPop) { shotPop.t -= dt; if (shotPop.t <= 0) shotPop = null; else { ctx.globalAlpha = Math.min(1, shotPop.t * 2); txt("本发 +" + shotPop.pts.toLocaleString(), W / 2, B.LINE_Y + 50, 36, "#fff", "center", "900"); txt("最高倍率 ×" + B.fmtMult(shotPop.max), W / 2, B.LINE_Y + 92, 24, multCol(shotPop.max)); ctx.globalAlpha = 1; } }
    if (run.phase === "fly") txt(fast ? "⏩ 加速中" : "点屏幕加速", W - 20, H - 30, 22, fast ? "#ffd84a" : "#6f6895", "right");
    if (tutT > 0 && run.phase === "fly") { tutT -= dt; txt("贴墙反弹 → 倍率 +1 ！", W / 2, B.LINE_Y + 50, 32, "#ffd84a", "center", "900"); }
    // big multiplier celebration
    if (big) { big.t -= dt; if (big.t <= 0) big = null; else { var s = 1 + Math.max(0, big.t - 1) * 3; ctx.save(); ctx.translate(W / 2, H * 0.42); ctx.scale(s, s); ctx.globalAlpha = Math.min(1, big.t * 1.5); ctx.lineWidth = 10; ctx.strokeStyle = "#000"; ctx.font = "900 150px system-ui,sans-serif"; ctx.textAlign = "center"; ctx.strokeText("×" + big.m, 0, 0); txt("×" + big.m, 0, 0, 150, multCol(big.m), "center", "900"); txt(big.m >= 64 ? "爆了！！！" : big.m >= 32 ? "离谱！" : "漂亮！", 0, 110, 50, "#fff", "center", "900"); ctx.restore(); ctx.globalAlpha = 1; } }
    if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; else { ctx.globalAlpha = Math.min(1, banner.t * 2); ctx.fillStyle = "rgba(10,8,20,0.82)"; ctx.fillRect(0, H * 0.38, W, 190); txt(banner.a, W / 2, H * 0.38 + 70, 60, "#ffd84a", "center", "900"); txt(banner.b, W / 2, H * 0.38 + 140, 26, "#e6e0ff"); ctx.globalAlpha = 1; } }
    if (flash > 0) { ctx.globalAlpha = flash * 0.5; ctx.fillStyle = flashCol; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; flash = Math.max(0, flash - dt * 1.6); }
    shake = Math.max(0, shake - dt * 60);
  }
  function hpCol(hp) { return hp <= 2 ? "#5b8cff" : hp <= 5 ? "#3fd4ff" : hp <= 9 ? "#5dff9a" : hp <= 14 ? "#ffd84a" : hp <= 20 ? "#ff8a3d" : "#ff4d8b"; }
  function drawLauncher(x, dim) {
    ctx.globalAlpha = dim ? 0.4 : 1; ctx.shadowColor = "#fff"; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.arc(x, B.LAUNCH_Y, B.R + 4, 0, 6.283); ctx.fillStyle = "#fff"; ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
  function drawHUD() {
    ctx.fillStyle = "#1a1729"; ctx.fillRect(0, 0, W, B.TOP - 6);
    var st = B.isBossStage(run.stage) ? ("BOSS · 第 " + run.stage + " 关") : ("第 " + run.stage + " 关");
    txt(st, 24, 36, 30, B.isBossStage(run.stage) ? "#ff3d8b" : "#fff", "left", "900");
    txt("¥ " + run.coins, W - 24, 36, 30, "#ffcc33", "right", "900");
    txt("● " + run.balls, W - 140, 36, 28, "#e6e0ff", "right");
    // shots pips
    var n = run.shotsLeft; for (var i = 0; i < Math.max(n, 0); i++) { ctx.beginPath(); ctx.arc(250 + i * 26, 36, 9, 0, 6.283); ctx.fillStyle = "#ffd84a"; ctx.fill(); }
    txt("发", 250 + Math.max(n, 0) * 26 + 4, 37, 20, "#8e85b8", "left");
    if (run.stage === 7) {
      var bo = B.bossOf(run); var pct = bo ? bo.hp / bo.max : 0;
      rr(24, 76, W - 48, 34, 17); ctx.fillStyle = "#2a1530"; ctx.fill();
      rr(24, 76, Math.max(34, (W - 48) * pct), 34, 17); ctx.fillStyle = "#ff3d8b"; ctx.fill();
      txt(B.BOSS_RULES[run.bossRule].name + "：" + (bo ? bo.hp : 0) + " 血", W / 2, 94, 22, "#fff");
    } else {
      var pr = Math.min(1, run.score / Math.max(1, run.threshold));
      rr(24, 76, W - 48, 34, 17); ctx.fillStyle = "#26213d"; ctx.fill();
      rr(24, 76, Math.max(34, (W - 48) * pr), 34, 17); ctx.fillStyle = pr >= 1 ? "#39e58c" : "#ff7a3d"; ctx.fill();
      txt(B.fmtScore(run.score) + " / " + B.fmtScore(run.threshold) + (pr >= 1 ? " ✓" : ""), W / 2, 94, 22, "#fff");
    }
    var cards = Object.keys(run.cards).filter(function (k) { return B.CARDS[k].kind !== "up"; }).map(function (k) { return B.CARDS[k].icon; }).join(" ");
    if (cards) txt(cards, 24, 128, 18, "#c9c2e8", "left");
    txt("总分 " + run.total.toLocaleString(), W - 24, 128, 18, "#8e85b8", "right");
  }
  function drawTutorial() {
    var t = (performance.now() / 1000) % 2.2, k = Math.min(1, t / 1.4);
    var x = run.launchX + (-170 + 120 * k), y = B.LAUNCH_Y - 120 - 360 * k;
    ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.setLineDash([2, 12]); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(run.launchX, B.LAUNCH_Y); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = t < 1.6 ? 1 : Math.max(0, 1 - (t - 1.6) * 3);
    txt("👆", x + 10, y + 30, 64, "#fff"); ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(10,8,20,0.75)"; rr(60, B.LINE_Y + 24, W - 120, 92, 20); ctx.fill();
    txt("按住拖动瞄准，松手发射", W / 2, B.LINE_Y + 56, 30, "#ffd84a", "center", "900");
    txt("瞄准线只显示第一次反弹", W / 2, B.LINE_Y + 94, 20, "#c9c2e8");
  }
  var idleBalls = [];
  function drawIdle(dt) {
    if (!idleBalls.length) for (var i = 0; i < 6; i++) idleBalls.push({ x: Math.random() * W, y: 300 + Math.random() * 700, vx: (Math.random() - 0.5) * 500, vy: (Math.random() - 0.5) * 500, c: ["#ffd84a", "#ff3d8b", "#3fd4ff", "#5dff9a", "#ff7a3d", "#c06bff"][i] });
    idleBalls.forEach(function (b) { b.x += b.vx * dt; b.y += b.vy * dt; if (b.x < 12 || b.x > W - 12) b.vx *= -1; if (b.y < 160 || b.y > H - 12) b.vy *= -1; ctx.shadowColor = b.c; ctx.shadowBlur = 20; ctx.beginPath(); ctx.arc(b.x, b.y, 12, 0, 6.283); ctx.fillStyle = b.c; ctx.fill(); ctx.shadowBlur = 0; });
  }

  // ---------- loop ----------
  var prevPhase = null;
  function frame(t) {
    var dt = Math.min(0.05, (t - (lastT || t)) / 1000); lastT = t;
    if (run) {
      if (run.phase === "fly") { var sp = fast ? 3 : run.shotT > 6 ? 2 : 1; B.update(run, dt * sp); }
      drain();
      if (run.phase !== prevPhase) {
        if (run.phase === "decide") { $("decCoins").textContent = 3 * run.shotsLeft; $("decTxt").innerHTML = "还剩 " + run.shotsLeft + " 发。现在过关，每发换 3 金币；<br>或者继续打，冒着砖块压低的风险刷更多分。"; $("decide").classList.remove("hidden"); }
        else $("decide").classList.add("hidden");
        if (run.phase === "pick") setTimeout(function () { if (run && run.phase === "pick") { renderPick(); $("pick").classList.remove("hidden"); } }, 500);
        else if (run.phase !== "pick") $("pick").classList.add("hidden");
        if (run.phase === "over" || run.phase === "win") { hideRecall(); finish(); }
        if (run.phase === "fly") showRecall(); else hideRecall();
        prevPhase = run.phase;
      }
    } else prevPhase = null;
    draw(dt);
    requestAnimationFrame(frame);
  }
  showMenu();
  requestAnimationFrame(frame);
  window.__bs = function () { return run; };
})();
