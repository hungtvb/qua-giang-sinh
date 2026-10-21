'use strict';
/* Đêm Tuyết Rơi — one continuous snowy world, told like a short film.
   Beats: calm -> painting (drag snow to light the tree) -> stillness -> burst -> settle -> letter.
   The snow never resets: the same particle field carries through every beat. */

const world = document.getElementById('world');
const wctx = world.getContext('2d');
const frostCv = document.getElementById('frost');
const fx = frostCv.getContext('2d');
const front = document.getElementById('front');
const fctx = front.getContext('2d');
const lineEl = document.getElementById('line');
const letterEl = document.getElementById('letter');
const replayBtn = document.getElementById('replay');
const music = document.getElementById('music');
const bells = document.getElementById('bells');
const chime = document.getElementById('chime');

const DPR = Math.min(window.devicePixelRatio || 1, 2);
let W = 0, H = 0;

// ---------- assets ----------
function loadImg(src) { const i = new Image(); i.src = src; return i; }
const imgBackdrop = loadImg('assets/img/backdrop.jpg');
const imgTreeNight = loadImg('assets/img/tree-night.webp');
const imgTreeWarm = loadImg('assets/img/tree-warm.webp');
const imgBoxNight = loadImg('assets/img/giftbox-night.webp');
const imgBoxWarm = loadImg('assets/img/giftbox.webp');

// glow sprites (pre-rendered, tinted)
function glowSprite(r, g, b) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(255,255,255,1)`);
  gr.addColorStop(0.25, `rgba(${r},${g},${b},0.85)`);
  gr.addColorStop(0.6, `rgba(${r},${g},${b},0.25)`);
  gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  return c;
}
const GLOW = {
  gold: glowSprite(255, 196, 86),
  cream: glowSprite(255, 232, 180),
  red: glowSprite(255, 110, 100),
  ice: glowSprite(170, 205, 255),
  white: glowSprite(235, 242, 255),
};

// ---------- layout ----------
let appBooted = false;
const L = {};
function layout() {
  W = window.innerWidth; H = window.innerHeight;
  for (const cv of [world, front, frostCv]) {
    cv.width = W * DPR; cv.height = H * DPR;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
  }
  fx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (appBooted && phase === 'frost') paintFrost();
  wctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  fctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  L.treeH = H * 0.585;
  L.treeW = L.treeH * (1120 / 2088);
  L.cx = W * 0.5;
  L.treeBaseY = H * 0.955;
  L.treeX = L.cx - L.treeW / 2;
  L.treeY = L.treeBaseY - L.treeH;
  L.star = { x: L.cx, y: L.treeY + L.treeH * 0.035 };
  L.canopy = { x: L.cx, y: L.treeY + L.treeH * 0.50, rx: L.treeW * 0.50, ry: L.treeH * 0.46 };
  L.boxW = Math.min(W * 0.235, L.treeW * 0.44);
  L.boxH = L.boxW * (962 / 1095);
  L.boxCx = L.cx + L.treeW * 0.335;
  L.boxBaseY = L.treeBaseY + H * 0.006;
  L.boxX = L.boxCx - L.boxW / 2;
  L.boxY = L.boxBaseY - L.boxH;
}
window.addEventListener('resize', layout);
layout();

// tree lights — scattered over the whole canopy, thresholds shuffled
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const LIGHT_COLORS = ['gold', 'gold', 'cream', 'gold', 'red', 'gold', 'cream', 'gold'];
const lights = [];
{
  const rnd = mulberry32(20261225);
  for (let i = 0; i < 64; i++) {
    const fy = 0.09 + 0.83 * rnd();
    const halfW = 0.05 + 0.43 * Math.pow(fy, 0.8);        // pine profile at this height
    lights.push({
      fx: 0.5 + (rnd() * 2 - 1) * halfW * 0.94, fy,
      th: rnd(),
      color: LIGHT_COLORS[Math.floor(rnd() * LIGHT_COLORS.length)],
      ph: rnd() * Math.PI * 2, size: 13 + rnd() * 15, on: 0,
    });
  }
}

// ---------- snow: one persistent particle field ----------
const flakes = [];
function newFlake(top) {
  return {
    x: Math.random() * W, y: top ? -10 - Math.random() * 40 : Math.random() * H,
    r: 0.8 + Math.random() * 2.3, vy: 26 + Math.random() * 46,
    ph: Math.random() * Math.PI * 2, sway: 8 + Math.random() * 22,
    gold: false, stream: false, dead: false,
  };
}
const AMBIENT = { frost: 34, calm: 55, painting: 165, stillness: 165, burst: 210, settle: 125, letter: 125 };
for (let i = 0; i < 55; i++) flakes.push(newFlake(false));

const sparks = [];   // additive glints: catches, burst, motes
function addSpark(x, y, opt) {
  const o = opt || {};
  sparks.push({
    x, y, vx: o.vx || 0, vy: o.vy || 0, life: 0, ttl: o.ttl || 1,
    size: o.size || 10, color: o.color || 'gold', grav: o.grav || 0,
  });
  if (sparks.length > 700) sparks.splice(0, sparks.length - 700);
}

// front-layer snow (parallax depth, above the letter)
const frontFlakes = [];
for (let i = 0; i < 30; i++) frontFlakes.push({
  x: Math.random() * W, y: Math.random() * H, r: 3.5 + Math.random() * 5.5,
  vy: 14 + Math.random() * 22, ph: Math.random() * Math.PI * 2,
});

// ---------- state ----------
let phase = 'frost';          // frost | calm | painting | stillness | burst | settle | letter
let progress = 0;             // 0..1 snow caught by the tree
let phaseT = 0;               // seconds inside current phase
let freeze = 1;               // snow motion factor (1 = normal, 0 = frozen)
let flashA = 0, ringR = 0, ringA = 0;
let boxAnim = 0;              // gift opening animation 0..1
let hintTimer = 0, halfShown = false, started = false;
let musicVol = 0, musicTarget = 0;
const special = { active: false, t: 0, x: 0, y: 0, hintShown: false };  // the one glowing flake

const pointer = { down: false, x: 0, y: 0, px: 0, py: 0, moved: false };

// ---------- floating line ----------
let lineTimer = null;
function showLine(text, holdMs) {
  lineEl.textContent = text;
  lineEl.classList.remove('hidden');
  requestAnimationFrame(() => lineEl.classList.add('show'));
  clearTimeout(lineTimer);
  lineTimer = setTimeout(() => {
    lineEl.classList.remove('show');
    setTimeout(() => lineEl.classList.add('hidden'), 1700);
  }, holdMs || 4200);
}
setTimeout(() => { if (phase === 'frost') showLine('Lau lớp sương… nhìn vào đêm Giáng Sinh', 5200); }, 900);

// ---------- audio (files through <audio> only — iOS safe) ----------
function startMusic() {
  if (started) return; started = true;
  music.volume = 0;
  music.play().catch(() => {});
  musicTarget = 0.72;
}
function rampMusic(dt) {
  const target = phase === 'stillness' ? 0.16 : musicTarget;
  musicVol += (target - musicVol) * Math.min(1, dt * 1.6);
  if (started) music.volume = Math.max(0, Math.min(1, musicVol));
}

// ---------- frost layer (wipe to reveal the world) ----------
let frostCleared = 0, frostCheckAt = 0;
function paintFrost() {
  fx.globalCompositeOperation = 'source-over';
  fx.clearRect(0, 0, W, H);
  const g = fx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(198,216,240,0.94)');
  g.addColorStop(0.5, 'rgba(214,228,246,0.92)');
  g.addColorStop(1, 'rgba(190,208,234,0.95)');
  fx.fillStyle = g; fx.fillRect(0, 0, W, H);
  const rnd = mulberry32(777);
  for (let i = 0; i < 260; i++) {                       // icy blotches
    const x = rnd() * W, y = rnd() * H, r = 14 + rnd() * 60;
    const rg = fx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(238,246,255,${0.05 + rnd() * 0.10})`);
    rg.addColorStop(1, 'rgba(238,246,255,0)');
    fx.fillStyle = rg; fx.beginPath(); fx.arc(x, y, r, 0, 7); fx.fill();
  }
  fx.fillStyle = 'rgba(255,255,255,0.5)';              // frost sparkle
  for (let i = 0; i < 420; i++) { fx.fillRect(rnd() * W, rnd() * H, 1.4, 1.4); }
  fx.strokeStyle = 'rgba(240,248,255,0.55)';            // crystal ferns in the corners
  fx.lineWidth = 1.2;
  for (const [cx0, cy0, sx, sy] of [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]]) {
    for (let b = 0; b < 5; b++) {
      const a = (b / 5) * Math.PI * 0.5;
      fx.beginPath(); fx.moveTo(cx0, cy0);
      fx.lineTo(cx0 + sx * Math.cos(a) * 74, cy0 + sy * Math.sin(a) * 74); fx.stroke();
    }
  }
  frostCleared = 0;
}
function wipeAt(x, y) {
  const r = 56;
  const g = fx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.85)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  fx.globalCompositeOperation = 'destination-out';
  fx.fillStyle = g;
  fx.beginPath(); fx.arc(x, y, r, 0, 7); fx.fill();
  fx.globalCompositeOperation = 'source-over';
}
function measureFrost(now) {
  if (now - frostCheckAt < 0.45) return;
  frostCheckAt = now;
  const sc = document.createElement('canvas'); sc.width = 36; sc.height = 64;
  const sx = sc.getContext('2d');
  sx.drawImage(frostCv, 0, 0, 36, 64);
  const d = sx.getImageData(0, 0, 36, 64).data;
  let clear = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 40) clear++;
  frostCleared = clear / (36 * 64);
  if (frostCleared >= 0.42) meltFrost();
}
function meltFrost() {
  phase = 'calm'; phaseT = 0;
  frostCv.classList.add('melted');
  setTimeout(() => { frostCv.style.display = 'none'; }, 1800);
  showLine('Đêm Giáng Sinh…', 4400);
}

// ---------- wish motes: tap one to hang a wish on the tree ----------
const WISH_WORDS = ['An lành', 'Sức khoẻ', 'Hạnh phúc'];
let wishesSpawned = false;
const motes = [];        // {fx, fy, x, y, ph, done}
const ornaments = [];    // {fx, fy, color, ph}
const wishLabels = [];   // {x, y, t, word}
const wishStars = [];    // {x, y, ph}
function spawnWishes() {
  wishesSpawned = true;
  const spots = [{ fx: 0.30, fy: 0.30 }, { fx: 0.68, fy: 0.44 }, { fx: 0.42, fy: 0.62 }];
  for (let i = 0; i < 3; i++) motes.push({ ...spots[i], x: 0, y: 0, ph: i * 2.1, done: false, word: WISH_WORDS[i] });
  showLine('Chạm vào những đốm sáng… treo một điều ước lên cây', 4600);
}
function tapWish(x, y) {
  for (const m of motes) {
    if (m.done) continue;
    if (Math.hypot(x - m.x, y - m.y) < 52) {
      m.done = true;
      ornaments.push({ fx: m.fx, fy: m.fy, color: ['gold', 'red', 'cream'][ornaments.length % 3], ph: Math.random() * 6 });
      wishLabels.push({ x: m.x, y: m.y, t: 0, word: m.word });
      wishStars.push({ x: 0.16 + 0.24 * wishStars.length + Math.random() * 0.08, y: 0.05 + Math.random() * 0.07, ph: Math.random() * 6 });
      for (let i = 0; i < 16; i++) addSpark(m.x, m.y, { ttl: 0.8, size: 10, color: 'ice', vx: (Math.random() - 0.5) * 70, vy: (Math.random() - 0.5) * 70 });
      return true;
    }
  }
  return false;
}

// ---------- star ember: guide it down to the gift ----------
const ember = { active: false, x: 0, y: 0, vx: 0, vy: 0, trailAt: 0 };
let boxUnlocked = false, emberHintAt = 0;
function spawnEmber() {
  ember.active = true;
  ember.x = L.star.x; ember.y = L.star.y;
  ember.vx = 0; ember.vy = 0;
}

// ---------- interaction ----------
function inBox(x, y) {
  return x > L.boxX - 14 && x < L.boxX + L.boxW + 14 && y > L.boxY - 18 && y < L.boxBaseY + 10;
}
const stage = document.getElementById('stage');
stage.addEventListener('pointerdown', (e) => {
  startMusic();
  pointer.down = true; pointer.x = pointer.px = e.clientX; pointer.y = pointer.py = e.clientY;
  if (phase === 'frost') { wipeAt(e.clientX, e.clientY); return; }
  if (phase === 'painting' || phase === 'stillness') tapWish(e.clientX, e.clientY);
  if (phase === 'calm') {
    phase = 'painting'; phaseT = 0;
    showLine('Kéo tay… dẫn tuyết về thắp sáng cây thông', 4400);
    for (let i = 0; i < 14; i++) addSpark(e.clientX, e.clientY, { ttl: 0.7, size: 12, color: 'cream', vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 40 });
  } else if (phase === 'settle' && boxUnlocked && inBox(e.clientX, e.clientY)) {
    openGift();
  }
});
window.addEventListener('pointermove', (e) => {
  if (phase === 'frost' && pointer.down) {
    const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
    const steps = Math.max(1, Math.floor(Math.hypot(dx, dy) / 16));
    for (let i = 1; i <= steps; i++) wipeAt(pointer.x + dx * i / steps, pointer.y + dy * i / steps);
  }
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.moved = true;
});
window.addEventListener('pointerup', () => { pointer.down = false; });
window.addEventListener('pointercancel', () => { pointer.down = false; });
document.addEventListener('contextmenu', (e) => e.preventDefault());

function openGift() {
  phase = 'letter'; phaseT = 0;
  chime.currentTime = 0; chime.play().catch(() => {});
  for (let i = 0; i < 42; i++) {
    addSpark(L.boxCx + (Math.random() - 0.5) * L.boxW, L.boxY + Math.random() * L.boxH * 0.4, {
      ttl: 1.4 + Math.random() * 1.2, size: 9 + Math.random() * 12,
      color: i % 3 ? 'gold' : 'cream', vx: (Math.random() - 0.5) * 36, vy: -34 - Math.random() * 55,
    });
  }
  setTimeout(() => {
    letterEl.classList.remove('hidden');
    requestAnimationFrame(() => requestAnimationFrame(() => letterEl.classList.add('risen')));
  }, 620);
  setTimeout(() => replayBtn.classList.remove('hidden'), 3400);
}
replayBtn.addEventListener('click', () => location.reload());

// ---------- phase transitions ----------
function enterStillness() {
  phase = 'stillness'; phaseT = 0;
  special.active = true; special.t = 0; special.hintShown = false;
  special.x = L.cx + W * 0.13; special.y = -24;
}
function enterBurst() {
  phase = 'burst'; phaseT = 0;
  flashA = 0.5; ringR = 6; ringA = 0.45;
  bells.currentTime = 0; bells.play().catch(() => {});
  for (let i = 0; i < 240; i++) {
    const a = Math.random() * Math.PI * 2, sp = 120 + Math.random() * 470;
    addSpark(L.star.x, L.star.y, {
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 90,
      ttl: 1.5 + Math.random() * 1.5, size: 8 + Math.random() * 15,
      color: ['gold', 'cream', 'gold', 'red'][i % 4], grav: 300,
    });
  }
  for (const f of flakes) { f.vy -= 130 + Math.random() * 130; if (Math.random() < 0.45) f.gold = true; }
}

// ---------- update ----------
function update(dt, now) {
  phaseT += dt;
  rampMusic(dt);

  // ambient population follows the beat
  const target = AMBIENT[phase] || 120;
  if (flakes.length < target && Math.random() < 0.5) flakes.push(newFlake(true));

  // painting: stream snow from her finger
  if (phase === 'painting') {
    if (pointer.down) {
      hintTimer = 0;
      for (let i = 0; i < 4; i++) {
        const f = newFlake(false);
        f.x = pointer.x + (Math.random() - 0.5) * 26;
        f.y = pointer.y + (Math.random() - 0.5) * 26;
        f.vy = 60 + Math.random() * 60; f.stream = true; f.r = 1.2 + Math.random() * 2.4;
        flakes.push(f);
      }
    } else {
      hintTimer += dt;
      if (hintTimer > 7 && progress < 0.2) { hintTimer = 0; showLine('Dẫn tuyết về phía cây thông nhé em', 3600); }
    }
    if (progress >= 0.5 && !halfShown) { halfShown = true; showLine('Mỗi bông tuyết… là một lời chúc', 4000); }
    if (progress >= 1) enterStillness();
  }

  // frost: measure how much she has wiped away
  if (phase === 'frost' && pointer.down) measureFrost(now);

  // wishes appear once the tree is more than half lit
  if (phase === 'painting' && progress >= 0.55 && !wishesSpawned) spawnWishes();
  for (const m of motes) {
    m.x = L.cx + (m.fx - 0.5) * L.treeW * 1.7 + Math.sin(now * 0.7 + m.ph) * 9;
    m.y = L.treeY + m.fy * L.treeH + Math.cos(now * 0.55 + m.ph) * 8;
  }
  for (let i = wishLabels.length - 1; i >= 0; i--) {
    const lb = wishLabels[i]; lb.t += dt; lb.y -= 26 * dt;
    if (lb.t > 3) wishLabels.splice(i, 1);
  }

  // the star ember drifts, follows her finger, and seeks the gift
  if (phase === 'settle' && ember.active) {
    const hover = { x: L.cx + W * 0.31 + Math.sin(now * 0.8) * 8, y: L.treeY + L.treeH * 0.30 + Math.cos(now * 0.63) * 8 };
    const tgt = pointer.down ? { x: pointer.x, y: pointer.y } : hover;
    const k = Math.min(1, dt * (pointer.down ? 3.1 : 1.1));
    ember.x += (tgt.x - ember.x) * k;
    ember.y += (tgt.y - ember.y) * k;
    if (now - ember.trailAt > 0.05) {
      ember.trailAt = now;
      addSpark(ember.x, ember.y, { ttl: 0.6, size: 8, color: 'gold', vx: (Math.random() - 0.5) * 16, vy: 12 });
    }
    emberHintAt += dt;
    if (!boxUnlocked && emberHintAt > 6.5) { emberHintAt = 0; showLine('Dẫn đốm lửa sao… về hộp quà dưới gốc cây', 3800); }
    if (!boxUnlocked && Math.hypot(ember.x - L.boxCx, ember.y - (L.boxY + L.boxH / 2)) < 46) {
      boxUnlocked = true; ember.active = false;
      chime.currentTime = 0; chime.play().catch(() => {});
      for (let i = 0; i < 30; i++) addSpark(L.boxCx, L.boxY + L.boxH / 2, { ttl: 1, size: 11, color: 'gold', vx: (Math.random() - 0.5) * 90, vy: -30 - Math.random() * 60 });
      showLine('Hộp quà đã mở khoá…', 3000);
    }
  }

  // freeze factor per beat
  const freezeGoal = phase === 'stillness' ? 0 : 1;
  freeze += (freezeGoal - freeze) * Math.min(1, dt * (phase === 'stillness' ? 2.4 : 1.2));

  // special flake descent
  if (phase === 'stillness' && special.active) {
    if (pointer.down) special.t += dt / 3.1;
    else if (phaseT > 1.6 && !special.hintShown) { special.hintShown = true; showLine('Nhấn giữ… gọi bông tuyết xuống', 3200); }
    const t = Math.min(1, special.t);
    const e = t * t * (3 - 2 * t);
    special.x = (L.cx + W * 0.13) + (L.star.x - (L.cx + W * 0.13)) * e + Math.sin(now * 1.4) * 7 * (1 - t);
    special.y = -24 + (L.star.y + 24) * e;
    if (t >= 1) { special.active = false; enterBurst(); }
  }
  if (phase === 'burst' && phaseT > 4.6) { phase = 'settle'; phaseT = 0; spawnEmber(); emberHintAt = 0; showLine('Một món quà nhỏ… đang chờ em dưới gốc cây', 4600); }

  // snow field
  const c = L.canopy;
  for (let i = flakes.length - 1; i >= 0; i--) {
    const f = flakes[i];
    f.y += f.vy * dt * freeze;
    f.x += Math.sin(now * 0.9 + f.ph) * f.sway * dt * freeze;
    if (f.stream) {
      f.vy += 130 * dt;                                   // stream flakes accelerate downward
      f.x += (c.x - f.x) * 0.55 * dt;                     // soft drift toward the tree
      if (f.y > H + 12) { flakes.splice(i, 1); continue; }
    }
    if (f.y > H + 10) { Object.assign(f, newFlake(true)); continue; }
    if (f.x < -12) f.x = W + 10; if (f.x > W + 12) f.x = -10;

    // the tree catches snow
    if (phase === 'painting' && progress < 1) {
      const dx = (f.x - c.x) / (c.rx * 1.12), dy = (f.y - c.y) / (c.ry * 1.12);
      if (dx * dx + dy * dy < 1) {
        progress = Math.min(1, progress + 1 / 235);
        addSpark(f.x, f.y, { ttl: 0.55, size: 9, color: 'cream', vx: (Math.random() - 0.5) * 24, vy: -12 });
        if (f.stream) { flakes.splice(i, 1); } else { Object.assign(f, newFlake(true)); }
        continue;
      }
    }
  }
  // trim stream excess
  if (flakes.length > 900) flakes.splice(0, flakes.length - 900);

  // lights follow progress
  for (const li of lights) {
    const goal = phase === 'burst' || phase === 'settle' || phase === 'letter' ? 1 : (progress > li.th ? 1 : 0);
    li.on += (goal - li.on) * Math.min(1, dt * 5);
  }

  // sparks
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.life += dt;
    if (s.life >= s.ttl) { sparks.splice(i, 1); continue; }
    s.vy += s.grav * dt; s.x += s.vx * dt; s.y += s.vy * dt;
  }
  flashA = Math.max(0, flashA - dt * 0.55);
  if (ringA > 0) { ringR += dt * W * 0.55; ringA = Math.max(0, ringA - dt * 0.5); }

  if (phase === 'letter' && boxAnim < 1) boxAnim = Math.min(1, boxAnim + dt / 0.9);

  // front snow always drifts (depth never freezes completely)
  for (const f of frontFlakes) {
    f.y += f.vy * dt * (0.3 + 0.7 * freeze);
    f.x += Math.sin(now * 0.6 + f.ph) * 10 * dt;
    if (f.y > H + 14) { f.y = -14; f.x = Math.random() * W; }
  }
}

// ---------- draw ----------
function draw(now) {
  wctx.clearRect(0, 0, W, H);
  // backdrop, cover-fit
  if (imgBackdrop.complete && imgBackdrop.naturalWidth) {
    const s = Math.max(W / imgBackdrop.naturalWidth, H / imgBackdrop.naturalHeight);
    const dw = imgBackdrop.naturalWidth * s, dh = imgBackdrop.naturalHeight * s;
    wctx.drawImage(imgBackdrop, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else { wctx.fillStyle = '#141c3d'; wctx.fillRect(0, 0, W, H); }

  // halo behind the tree once it is lit
  const lit = phase === 'burst' || phase === 'settle' || phase === 'letter' ? 1 : progress;
  if (lit > 0.03) {
    const hg = wctx.createRadialGradient(L.cx, L.treeY + L.treeH * 0.45, 10, L.cx, L.treeY + L.treeH * 0.45, L.treeH * 0.72);
    hg.addColorStop(0, `rgba(255, 190, 92, ${0.30 * lit})`);
    hg.addColorStop(1, 'rgba(255, 190, 92, 0)');
    wctx.fillStyle = hg;
    wctx.fillRect(L.cx - L.treeH * 0.75, L.treeY - L.treeH * 0.25, L.treeH * 1.5, L.treeH * 1.5);
  }

  // tree: night -> warm crossfade with the caught snow
  if (imgTreeNight.complete) {
    wctx.drawImage(imgTreeNight, L.treeX, L.treeY, L.treeW, L.treeH);
    if (lit > 0.01) { wctx.globalAlpha = Math.min(1, lit * 1.05); wctx.drawImage(imgTreeWarm, L.treeX, L.treeY, L.treeW, L.treeH); wctx.globalAlpha = 1; }
  }

  // lights
  wctx.globalCompositeOperation = 'lighter';
  for (const li of lights) {
    if (li.on < 0.02) continue;
    const tw = 0.78 + 0.22 * Math.sin(now * 2.2 + li.ph);
    const sz = li.size * 1.7 * li.on * tw * (L.treeH / 460);
    const lx = L.cx + (li.fx - 0.5) * L.treeW, ly = L.treeY + li.fy * L.treeH;
    wctx.globalAlpha = li.on * tw;
    wctx.drawImage(GLOW[li.color], lx - sz / 2, ly - sz / 2, sz, sz);
    wctx.globalAlpha = li.on;
    wctx.fillStyle = '#fff3cf';
    wctx.beginPath(); wctx.arc(lx, ly, 1.5 + li.on * 1.3, 0, 7); wctx.fill();
  }
  // hung ornaments (wishes she placed)
  for (const o of ornaments) {
    const tw = 0.8 + 0.2 * Math.sin(now * 2 + o.ph);
    const sz = 30 * tw * (L.treeH / 460);
    const ox = L.cx + (o.fx - 0.5) * L.treeW, oy = L.treeY + o.fy * L.treeH;
    wctx.globalAlpha = tw;
    wctx.drawImage(GLOW[o.color], ox - sz / 2, oy - sz / 2, sz, sz);
    wctx.fillStyle = '#fff3cf';
    wctx.beginPath(); wctx.arc(ox, oy, 2.6, 0, 7); wctx.fill();
  }
  wctx.globalAlpha = 1;
  // the star
  const starOn = phase === 'burst' || phase === 'settle' || phase === 'letter';
  if (starOn) {
    const pulse = 1 + 0.12 * Math.sin(now * 3);
    const sz = 92 * pulse * (L.treeH / 460);
    wctx.globalAlpha = 1;
    wctx.drawImage(GLOW.gold, L.star.x - sz / 2, L.star.y - sz / 2, sz, sz);
    wctx.fillStyle = '#fff6da';
    wctx.beginPath(); wctx.arc(L.star.x, L.star.y, 3.4 * pulse, 0, 7); wctx.fill();
  }
  wctx.globalCompositeOperation = 'source-over';
  wctx.globalAlpha = 1;

  // gift box at the foot of the tree — revealed by the burst light, glows in settle
  if (phase === 'burst' || phase === 'settle' || phase === 'letter') {
    const appear = phase === 'burst' ? Math.min(1, phaseT / 1.4) : 1;
    let scale = 1, alpha = appear, by = L.boxY;
    if (phase === 'letter') {
      const t = boxAnim, e = 1 - Math.pow(1 - t, 3);
      scale = 1 + 0.16 * Math.sin(t * Math.PI);
      alpha = 1 - e; by = L.boxY + e * 16;
    }
    wctx.globalAlpha = alpha;
    const bw = L.boxW * scale, bh = L.boxH * scale;
    const bx = L.boxCx - bw / 2, bby = by + L.boxH - bh;
    const img = lit > 0.5 ? imgBoxWarm : imgBoxNight;
    if (img.complete) wctx.drawImage(img, bx, bby, bw, bh);
    if (phase === 'settle' && boxUnlocked) {
      const p = 0.55 + 0.45 * Math.sin(now * 2.4);
      wctx.globalCompositeOperation = 'lighter';
      wctx.globalAlpha = 0.5 * p;
      const sz = L.boxW * 2.1;
      wctx.drawImage(GLOW.gold, L.boxCx - sz / 2, L.boxBaseY - L.boxH * 0.55 - sz / 2, sz, sz);
      wctx.globalCompositeOperation = 'source-over';
    }
    wctx.globalAlpha = 1;
  }

  // wish motes waiting to be tapped
  if (phase === 'painting' || phase === 'stillness') {
    wctx.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      if (m.done) continue;
      const p = 0.65 + 0.35 * Math.sin(now * 2.6 + m.ph);
      const sz = 56 * p;
      wctx.globalAlpha = 0.85 * p;
      wctx.drawImage(GLOW.ice, m.x - sz / 2, m.y - sz / 2, sz, sz);
      const sz2 = 22 * p;
      wctx.globalAlpha = 0.9;
      wctx.drawImage(GLOW.cream, m.x - sz2 / 2, m.y - sz2 / 2, sz2, sz2);
      wctx.globalAlpha = 1;
      wctx.fillStyle = '#ffffff';
      wctx.beginPath(); wctx.arc(m.x, m.y, 2.1, 0, 7); wctx.fill();
    }
    wctx.globalCompositeOperation = 'source-over';
  }

  // wish words rising into the sky, and the little stars they become
  for (const st of wishStars) {
    const sxp = st.x * W, syp = st.y * H;
    const tw = 0.55 + 0.45 * Math.sin(now * 3 + st.ph);
    wctx.globalAlpha = 0.85 * tw;
    wctx.strokeStyle = '#ffe9b8';
    wctx.lineWidth = 1.4;
    const r = 5 + 1.5 * tw;
    wctx.beginPath();
    wctx.moveTo(sxp - r, syp); wctx.lineTo(sxp + r, syp);
    wctx.moveTo(sxp, syp - r); wctx.lineTo(sxp, syp + r);
    wctx.stroke();
  }
  wctx.globalAlpha = 1;
  for (const lb of wishLabels) {
    const a = lb.t < 0.4 ? lb.t / 0.4 : (lb.t > 2.2 ? Math.max(0, 1 - (lb.t - 2.2) / 0.8) : 1);
    wctx.globalAlpha = a;
    wctx.font = '27px "Dancing Script", cursive';
    wctx.textAlign = 'center';
    wctx.shadowColor = 'rgba(255,205,110,0.8)';
    wctx.shadowBlur = 12;
    wctx.fillStyle = '#ffedb8';
    wctx.fillText(lb.word, lb.x, lb.y);
    wctx.shadowBlur = 0;
  }
  wctx.globalAlpha = 1;

  // the star ember, waiting to be guided home
  if (phase === 'settle' && ember.active) {
    wctx.globalCompositeOperation = 'lighter';
    const fl = 1 + 0.16 * Math.sin(now * 9) + 0.08 * Math.sin(now * 23);
    const sz = 62 * fl;
    wctx.drawImage(GLOW.gold, ember.x - sz / 2, ember.y - sz / 2, sz, sz);
    wctx.fillStyle = '#fff6da';
    wctx.beginPath(); wctx.arc(ember.x, ember.y, 3.4 * fl, 0, 7); wctx.fill();
    wctx.globalCompositeOperation = 'source-over';
  }

  // snow field
  for (const f of flakes) {
    const shimmer = phase === 'stillness' ? 0.75 + 0.25 * Math.sin(now * 3 + f.ph) : 1;
    wctx.globalAlpha = 0.85 * shimmer;
    wctx.fillStyle = f.gold ? '#ffd98f' : '#eef3ff';
    wctx.beginPath(); wctx.arc(f.x, f.y, f.r, 0, 7); wctx.fill();
  }
  wctx.globalAlpha = 1;

  // special glowing flake
  if (special.active) {
    wctx.globalCompositeOperation = 'lighter';
    const sz = 54 + 8 * Math.sin(now * 5);
    wctx.drawImage(GLOW.cream, special.x - sz / 2, special.y - sz / 2, sz, sz);
    wctx.fillStyle = '#fff8e6';
    wctx.beginPath(); wctx.arc(special.x, special.y, 3.6, 0, 7); wctx.fill();
    wctx.globalCompositeOperation = 'source-over';
  }

  // sparks
  wctx.globalCompositeOperation = 'lighter';
  for (const s of sparks) {
    const k = 1 - s.life / s.ttl;
    wctx.globalAlpha = k;
    const sz = s.size * (0.5 + 0.5 * k);
    wctx.drawImage(GLOW[s.color], s.x - sz / 2, s.y - sz / 2, sz, sz);
  }
  wctx.globalCompositeOperation = 'source-over';
  wctx.globalAlpha = 1;

  // burst ring + flash
  if (ringA > 0) {
    wctx.strokeStyle = `rgba(255, 214, 130, ${ringA})`;
    wctx.lineWidth = 2.5;
    wctx.beginPath(); wctx.arc(L.star.x, L.star.y, ringR, 0, 7); wctx.stroke();
  }
  if (flashA > 0) { wctx.fillStyle = `rgba(255, 240, 205, ${flashA})`; wctx.fillRect(0, 0, W, H); }

  // front snow
  fctx.clearRect(0, 0, W, H);
  for (const f of frontFlakes) {
    fctx.globalAlpha = 0.5;
    fctx.drawImage(GLOW.white, f.x - f.r * 2.2, f.y - f.r * 2.2, f.r * 4.4, f.r * 4.4);
  }
  fctx.globalAlpha = 1;
}

paintFrost();
appBooted = true;

// ---------- main loop ----------
let last = performance.now();
function frame(ts) {
  const now = ts / 1000;
  let dt = (ts - last) / 1000; last = ts;
  dt = Math.min(dt, 0.033);
  update(dt, now);
  draw(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// hooks for automated visual verification
window.__film = {
  phase: () => phase,
  progress: () => progress,
  setProgress: (p) => { progress = p; },
  box: () => ({ x: L.boxCx, y: L.boxY + L.boxH / 2 }),
  musicPlaying: () => started && !music.paused && music.currentTime > 0,
  frostCleared: () => frostCleared,
  motes: () => motes.filter(m => !m.done).map(m => ({ x: m.x, y: m.y, word: m.word })),
  ornaments: () => ornaments.length,
  ember: () => ({ active: ember.active, x: ember.x, y: ember.y, unlocked: boxUnlocked }),
};
