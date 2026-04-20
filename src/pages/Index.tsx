import { useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────
//  КОНСТАНТЫ
// ─────────────────────────────────────────────
const W = 800;
const H = 420;
const GRAVITY = 0.55;
const GROUND_Y = H - 60;
const PLAYER_SCREEN_X = 160; // игрок всегда здесь на экране

let _id = 1;
const uid = () => _id++;

// ─────────────────────────────────────────────
//  ТИПЫ
// ─────────────────────────────────────────────
interface Rect { x: number; y: number; w: number; h: number }
interface Stats {
  hp: number; maxHp: number; damage: number;
  fireRate: number; speed: number; bulletSpeed: number;
  pierce: number; doubleShot: boolean;
}
interface Player {
  worldX: number; y: number; w: number; h: number;
  vy: number; onGround: boolean;
  stats: Stats; lastShot: number;
  facing: 1 | -1; invTimer: number; frame: number;
}
interface Enemy {
  id: number;
  worldX: number; y: number; w: number; h: number;
  vy: number; onGround: boolean;
  hp: number; maxHp: number; speed: number;
  type: 'walker' | 'jumper' | 'shooter';
  shootTimer: number; reward: number;
  patrol: number; // ширина патруля влево-вправо от startX
  startWorldX: number;
}
interface Bullet {
  id: number; worldX: number; y: number; w: number; h: number;
  vx: number; vy: number; dmg: number; owner: 'player' | 'enemy';
  pierce: number; life: number;
}
interface Particle {
  id: number; x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
}
interface Platform { worldX: number; y: number; w: number; h: number }
interface Upgrade {
  id: string; name: string; desc: string; icon: string; color: string;
  apply: (s: Stats) => Stats;
}
type Phase = 'menu' | 'playing' | 'upgrade' | 'win' | 'dead';

// ─────────────────────────────────────────────
//  АПГРЕЙДЫ
// ─────────────────────────────────────────────
const UPGRADES: Upgrade[] = [
  { id: 'dmg',    name: 'ДАМАГ +50%',       desc: 'Каждая пуля бьёт сильнее',     icon: '💥', color: '#ff5555', apply: s => ({ ...s, damage: Math.round(s.damage * 1.5) }) },
  { id: 'fire',   name: 'СКОРОСТЬ ОГНЯ',    desc: 'Стреляешь чаще',               icon: '🔥', color: '#ffd700', apply: s => ({ ...s, fireRate: Math.max(80, Math.round(s.fireRate * 0.65)) }) },
  { id: 'hp',     name: 'АПТЕЧКА +40',      desc: 'Восстанавливает 40 HP',        icon: '❤️', color: '#ff4444', apply: s => ({ ...s, hp: Math.min(s.hp + 40, s.maxHp) }) },
  { id: 'maxhp',  name: 'MAX HP +30',       desc: 'Увеличивает максимальное HP',  icon: '💊', color: '#ff7777', apply: s => ({ ...s, maxHp: s.maxHp + 30, hp: s.hp + 30 }) },
  { id: 'spd',    name: 'СКОРОСТЬ БЕГА',    desc: 'Передвигаешься быстрее',       icon: '👟', color: '#00bfff', apply: s => ({ ...s, speed: s.speed + 1.2 }) },
  { id: 'bspd',   name: 'СКОРОСТЬ ПУЛИ',    desc: 'Пули летят быстрее',           icon: '⚡', color: '#aaff00', apply: s => ({ ...s, bulletSpeed: s.bulletSpeed + 3 }) },
  { id: 'pierce', name: 'ПРОБИТИЕ',         desc: 'Пуля пронзает 2 врагов',      icon: '🎯', color: '#ff8c00', apply: s => ({ ...s, pierce: s.pierce + 1 }) },
  { id: 'double', name: 'ДВОЙНОЙ ВЫСТРЕЛ',  desc: 'Стреляешь двумя пулями',      icon: '🔫', color: '#cc44ff', apply: s => ({ ...s, doubleShot: true }) },
  { id: 'dmg2',   name: 'КРИТИЧЕСКИЙ УДАР', desc: 'Урон ×2',                      icon: '💣', color: '#ff2020', apply: s => ({ ...s, damage: s.damage * 2 }) },
];
function pickUpgrades(n = 3): Upgrade[] { return [...UPGRADES].sort(() => Math.random() - 0.5).slice(0, n); }

// ─────────────────────────────────────────────
//  ОПРЕДЕЛЕНИЕ УРОВНЯ
// ─────────────────────────────────────────────
interface EnemySpawn { worldX: number; type: Enemy['type']; patrol?: number }
interface LevelDef {
  name: string; bg: string; groundColor: string; platColor: string;
  length: number;           // ширина мира в пикселях
  platforms: Platform[];
  enemies: EnemySpawn[];
}

// Уровень 1 — Лес
const LVL1: LevelDef = {
  name: 'ЛЕСНАЯ ЗОНА', bg: '#061206', groundColor: '#1a4d1a', platColor: '#2d6b2d', length: 3200,
  platforms: [
    { worldX: 400,  y: GROUND_Y - 80,  w: 120, h: 16 },
    { worldX: 650,  y: GROUND_Y - 130, w: 100, h: 16 },
    { worldX: 900,  y: GROUND_Y - 70,  w: 130, h: 16 },
    { worldX: 1150, y: GROUND_Y - 110, w: 100, h: 16 },
    { worldX: 1400, y: GROUND_Y - 80,  w: 120, h: 16 },
    { worldX: 1700, y: GROUND_Y - 140, w: 110, h: 16 },
    { worldX: 1950, y: GROUND_Y - 70,  w: 130, h: 16 },
    { worldX: 2300, y: GROUND_Y - 100, w: 100, h: 16 },
    { worldX: 2600, y: GROUND_Y - 130, w: 120, h: 16 },
    { worldX: 2900, y: GROUND_Y - 80,  w: 100, h: 16 },
  ],
  enemies: [
    { worldX: 700,  type: 'walker', patrol: 80 },
    { worldX: 950,  type: 'walker', patrol: 60 },
    { worldX: 1100, type: 'jumper', patrol: 40 },
    { worldX: 1350, type: 'walker', patrol: 90 },
    { worldX: 1500, type: 'walker', patrol: 60 },
    { worldX: 1750, type: 'jumper', patrol: 50 },
    { worldX: 1900, type: 'walker', patrol: 70 },
    { worldX: 2100, type: 'walker', patrol: 80 },
    { worldX: 2400, type: 'jumper', patrol: 60 },
    { worldX: 2700, type: 'walker', patrol: 70 },
    { worldX: 2800, type: 'walker', patrol: 50 },
    { worldX: 3000, type: 'jumper', patrol: 40 },
  ],
};

// Уровень 2 — Промзона
const LVL2: LevelDef = {
  name: 'ПРОМЗОНА', bg: '#06060f', groundColor: '#2a2a3d', platColor: '#3d3d5c', length: 3600,
  platforms: [
    { worldX: 350,  y: GROUND_Y - 90,  w: 110, h: 16 },
    { worldX: 600,  y: GROUND_Y - 140, w: 90,  h: 16 },
    { worldX: 900,  y: GROUND_Y - 80,  w: 120, h: 16 },
    { worldX: 1200, y: GROUND_Y - 130, w: 100, h: 16 },
    { worldX: 1500, y: GROUND_Y - 90,  w: 110, h: 16 },
    { worldX: 1800, y: GROUND_Y - 150, w: 100, h: 16 },
    { worldX: 2100, y: GROUND_Y - 80,  w: 120, h: 16 },
    { worldX: 2450, y: GROUND_Y - 120, w: 100, h: 16 },
    { worldX: 2750, y: GROUND_Y - 90,  w: 130, h: 16 },
    { worldX: 3100, y: GROUND_Y - 140, w: 110, h: 16 },
  ],
  enemies: [
    { worldX: 600,  type: 'walker',  patrol: 80 },
    { worldX: 800,  type: 'shooter', patrol: 0 },
    { worldX: 1050, type: 'walker',  patrol: 70 },
    { worldX: 1250, type: 'jumper',  patrol: 60 },
    { worldX: 1500, type: 'shooter', patrol: 0 },
    { worldX: 1650, type: 'walker',  patrol: 80 },
    { worldX: 1900, type: 'jumper',  patrol: 50 },
    { worldX: 2150, type: 'shooter', patrol: 0 },
    { worldX: 2300, type: 'walker',  patrol: 70 },
    { worldX: 2550, type: 'jumper',  patrol: 60 },
    { worldX: 2800, type: 'shooter', patrol: 0 },
    { worldX: 3000, type: 'walker',  patrol: 80 },
    { worldX: 3150, type: 'shooter', patrol: 0 },
    { worldX: 3300, type: 'jumper',  patrol: 50 },
  ],
};

// Уровень 3 — Руины
const LVL3: LevelDef = {
  name: 'РУИНЫ', bg: '#0f0600', groundColor: '#3d2000', platColor: '#5c3000', length: 4000,
  platforms: [
    { worldX: 300,  y: GROUND_Y - 100, w: 100, h: 16 },
    { worldX: 550,  y: GROUND_Y - 150, w: 90,  h: 16 },
    { worldX: 800,  y: GROUND_Y - 80,  w: 120, h: 16 },
    { worldX: 1100, y: GROUND_Y - 140, w: 100, h: 16 },
    { worldX: 1400, y: GROUND_Y - 100, w: 110, h: 16 },
    { worldX: 1700, y: GROUND_Y - 160, w: 100, h: 16 },
    { worldX: 2000, y: GROUND_Y - 90,  w: 120, h: 16 },
    { worldX: 2350, y: GROUND_Y - 130, w: 100, h: 16 },
    { worldX: 2650, y: GROUND_Y - 160, w: 110, h: 16 },
    { worldX: 2950, y: GROUND_Y - 100, w: 120, h: 16 },
    { worldX: 3300, y: GROUND_Y - 140, w: 100, h: 16 },
    { worldX: 3650, y: GROUND_Y - 90,  w: 130, h: 16 },
  ],
  enemies: [
    { worldX: 550,  type: 'walker',  patrol: 80 },
    { worldX: 750,  type: 'shooter', patrol: 0 },
    { worldX: 1000, type: 'jumper',  patrol: 60 },
    { worldX: 1150, type: 'walker',  patrol: 70 },
    { worldX: 1400, type: 'shooter', patrol: 0 },
    { worldX: 1600, type: 'jumper',  patrol: 50 },
    { worldX: 1800, type: 'shooter', patrol: 0 },
    { worldX: 2050, type: 'walker',  patrol: 80 },
    { worldX: 2200, type: 'shooter', patrol: 0 },
    { worldX: 2400, type: 'jumper',  patrol: 60 },
    { worldX: 2700, type: 'shooter', patrol: 0 },
    { worldX: 2850, type: 'walker',  patrol: 70 },
    { worldX: 3050, type: 'shooter', patrol: 0 },
    { worldX: 3200, type: 'jumper',  patrol: 50 },
    { worldX: 3500, type: 'walker',  patrol: 80 },
    { worldX: 3700, type: 'shooter', patrol: 0 },
    { worldX: 3850, type: 'jumper',  patrol: 60 },
  ],
};

// Уровень 4 — Крепость
const LVL4: LevelDef = {
  name: 'КРЕПОСТЬ', bg: '#0d0005', groundColor: '#2d0015', platColor: '#5a002a', length: 4500,
  platforms: [
    { worldX: 300,  y: GROUND_Y - 100, w: 100, h: 16 },
    { worldX: 550,  y: GROUND_Y - 160, w: 90,  h: 16 },
    { worldX: 800,  y: GROUND_Y - 90,  w: 120, h: 16 },
    { worldX: 1100, y: GROUND_Y - 150, w: 100, h: 16 },
    { worldX: 1400, y: GROUND_Y - 100, w: 110, h: 16 },
    { worldX: 1700, y: GROUND_Y - 170, w: 100, h: 16 },
    { worldX: 2000, y: GROUND_Y - 90,  w: 120, h: 16 },
    { worldX: 2300, y: GROUND_Y - 140, w: 110, h: 16 },
    { worldX: 2600, y: GROUND_Y - 170, w: 100, h: 16 },
    { worldX: 2900, y: GROUND_Y - 90,  w: 120, h: 16 },
    { worldX: 3200, y: GROUND_Y - 150, w: 100, h: 16 },
    { worldX: 3600, y: GROUND_Y - 100, w: 130, h: 16 },
    { worldX: 4000, y: GROUND_Y - 160, w: 110, h: 16 },
    { worldX: 4200, y: GROUND_Y - 90,  w: 120, h: 16 },
  ],
  enemies: [
    { worldX: 500,  type: 'walker',  patrol: 80 },
    { worldX: 700,  type: 'shooter', patrol: 0 },
    { worldX: 950,  type: 'jumper',  patrol: 60 },
    { worldX: 1100, type: 'shooter', patrol: 0 },
    { worldX: 1300, type: 'walker',  patrol: 80 },
    { worldX: 1500, type: 'shooter', patrol: 0 },
    { worldX: 1700, type: 'jumper',  patrol: 60 },
    { worldX: 1900, type: 'shooter', patrol: 0 },
    { worldX: 2100, type: 'walker',  patrol: 80 },
    { worldX: 2300, type: 'shooter', patrol: 0 },
    { worldX: 2500, type: 'jumper',  patrol: 60 },
    { worldX: 2700, type: 'shooter', patrol: 0 },
    { worldX: 2900, type: 'walker',  patrol: 80 },
    { worldX: 3100, type: 'shooter', patrol: 0 },
    { worldX: 3300, type: 'jumper',  patrol: 60 },
    { worldX: 3500, type: 'shooter', patrol: 0 },
    { worldX: 3700, type: 'walker',  patrol: 80 },
    { worldX: 3900, type: 'shooter', patrol: 0 },
    { worldX: 4100, type: 'jumper',  patrol: 60 },
    { worldX: 4200, type: 'shooter', patrol: 0 },
    { worldX: 4350, type: 'walker',  patrol: 80 },
  ],
};

const LEVELS: LevelDef[] = [LVL1, LVL2, LVL3, LVL4];

// ─────────────────────────────────────────────
//  ЦВЕТА
// ─────────────────────────────────────────────
const ECOL: Record<Enemy['type'], { body: string; hi: string; eye: string; glow: string }> = {
  walker:  { body: '#880000', hi: '#cc2020', eye: '#ffff00', glow: '#ff2020' },
  jumper:  { body: '#005588', hi: '#0077bb', eye: '#00ffff', glow: '#00bfff' },
  shooter: { body: '#336600', hi: '#44aa00', eye: '#ff8800', glow: '#aaff00' },
};

// ─────────────────────────────────────────────
//  РИСОВАЛКИ
// ─────────────────────────────────────────────
// Рисует одно пиксельное дерево (лес)
function drawTree(ctx: CanvasRenderingContext2D, x: number, baseY: number, h: number, thick: number, dark: boolean) {
  const trunk = Math.max(4, thick / 3);
  // Ствол
  ctx.fillStyle = dark ? '#3b2008' : '#5c3311';
  ctx.fillRect(Math.round(x - trunk/2), Math.round(baseY - h * 0.45), trunk, Math.round(h * 0.45));
  // Корни
  ctx.fillStyle = dark ? '#2e1a06' : '#4a2a0d';
  ctx.fillRect(Math.round(x - trunk/2 - 3), Math.round(baseY - 6), 5, 6);
  ctx.fillRect(Math.round(x + trunk/2 - 2), Math.round(baseY - 6), 5, 6);
  // Крона — 3 слоя треугольников
  const c1 = dark ? '#0d2e0d' : '#1a5c1a';
  const c2 = dark ? '#164016' : '#268c26';
  const c3 = dark ? '#1e5c1e' : '#33aa33';
  const layers = [
    { cy: baseY - h * 0.45, rw: thick * 0.9, rh: h * 0.38, col: c1 },
    { cy: baseY - h * 0.65, rw: thick * 0.7, rh: h * 0.32, col: c2 },
    { cy: baseY - h * 0.82, rw: thick * 0.48, rh: h * 0.26, col: c3 },
  ];
  for (const l of layers) {
    ctx.fillStyle = l.col;
    ctx.beginPath();
    ctx.moveTo(Math.round(x), Math.round(l.cy - l.rh));
    ctx.lineTo(Math.round(x + l.rw), Math.round(l.cy));
    ctx.lineTo(Math.round(x - l.rw), Math.round(l.cy));
    ctx.closePath(); ctx.fill();
    // Пиксельный блик
    ctx.fillStyle = dark ? '#2a6e2a' : '#55cc55';
    ctx.fillRect(Math.round(x - l.rw * 0.15), Math.round(l.cy - l.rh + 4), Math.round(l.rw * 0.3), 4);
  }
}

function drawBg(ctx: CanvasRenderingContext2D, lvl: LevelDef, cam: number) {
  const isForest = lvl.name === 'ЛЕСНАЯ ЗОНА';

  // ── НЕБО ──
  if (isForest) {
    // Градиент неба (вручную через полосы)
    const skyColors = ['#091a09','#0c2210','#102a14','#143218','#173a1b'];
    const stripH = Math.ceil(GROUND_Y / skyColors.length);
    for (let i = 0; i < skyColors.length; i++) {
      ctx.fillStyle = skyColors[i];
      ctx.fillRect(0, i * stripH, W, stripH + 2);
    }
  } else {
    ctx.fillStyle = lvl.bg; ctx.fillRect(0, 0, W, H);
  }

  // ── ЛУНА / ЗВЁЗДЫ ──
  if (isForest) {
    // Луна
    const moonX = ((800 - cam * 0.04) % (W + 100) + W + 100) % (W + 100) - 50;
    ctx.shadowColor = '#ffffcc'; ctx.shadowBlur = 20;
    ctx.fillStyle = '#fffde0';
    ctx.beginPath(); ctx.arc(moonX, 55, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ddd8a0';
    ctx.fillRect(moonX - 6, 46, 4, 4); ctx.fillRect(moonX + 8, 58, 6, 6);
    ctx.fillRect(moonX - 2, 62, 4, 4);
    ctx.shadowBlur = 0;
    // Звёзды
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 60; i++) {
      const sx2 = ((i * 137 - cam * 0.06) % W + W) % W;
      const sy2 = (i * 73 + 10) % (GROUND_Y - 60);
      const bright = (i % 3 === 0) ? 0.9 : 0.4;
      ctx.globalAlpha = bright;
      ctx.fillRect(sx2, sy2, i % 5 === 0 ? 3 : 2, i % 5 === 0 ? 3 : 2);
    }
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = '#ffffff20';
    for (let i = 0; i < 40; i++) {
      const sx2 = ((i * 173 - cam * 0.08) % W + W) % W;
      const sy2 = (i * 61) % (GROUND_Y - 30);
      ctx.fillRect(sx2, sy2, 2, 2);
    }
  }

  // ── ДАЛЬНИЕ ДЕРЕВЬЯ (параллакс 0.25) — тёмный слой ──
  if (isForest) {
    for (let i = 0; i < 20; i++) {
      const tx = ((i * 210 - cam * 0.25) % (W + 220) + W + 220) % (W + 220) - 110;
      const th = 90 + (i * 37) % 60;
      const tw = 28 + (i * 17) % 22;
      drawTree(ctx, tx, GROUND_Y, th, tw, true);
    }
    // Туман между слоями
    ctx.fillStyle = 'rgba(10,30,10,0.18)';
    ctx.fillRect(0, GROUND_Y - 120, W, 120);
  } else {
    ctx.fillStyle = '#ffffff07';
    for (let i = 0; i < 10; i++) {
      const bx = ((i * 230 - cam * 0.3) % (W + 250) + W + 250) % (W + 250) - 100;
      const bh2 = 55 + (i * 53) % 70;
      ctx.beginPath(); ctx.moveTo(bx, GROUND_Y); ctx.lineTo(bx + 90, GROUND_Y - bh2); ctx.lineTo(bx + 180, GROUND_Y); ctx.fill();
    }
  }

  // ── СРЕДНИЕ ДЕРЕВЬЯ (параллакс 0.5) ──
  if (isForest) {
    for (let i = 0; i < 16; i++) {
      const tx = ((i * 170 + 60 - cam * 0.5) % (W + 200) + W + 200) % (W + 200) - 100;
      const th = 110 + (i * 47) % 70;
      const tw = 36 + (i * 23) % 26;
      drawTree(ctx, tx, GROUND_Y, th, tw, false);
    }
  }

  // ── ЗЕМЛЯ ──
  if (isForest) {
    // Основная земля — тёмная
    ctx.fillStyle = '#1a3d0a'; ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    // Слой травы
    ctx.fillStyle = '#2d6614'; ctx.fillRect(0, GROUND_Y, W, 16);
    // Пиксельная трава — торчащие стебли
    ctx.fillStyle = '#3a8020';
    for (let gx = (-(cam % 16) + 16) % 16; gx < W; gx += 16) {
      ctx.fillRect(gx, GROUND_Y - 3, 2, 6);
      ctx.fillRect(gx + 5, GROUND_Y - 5, 2, 8);
      ctx.fillRect(gx + 10, GROUND_Y - 2, 2, 5);
    }
    ctx.fillStyle = '#4aaa28';
    for (let gx = (-(cam % 24) + 24) % 24 + 8; gx < W; gx += 24) {
      ctx.fillRect(gx, GROUND_Y - 6, 2, 8);
    }
    // Камушки
    ctx.fillStyle = '#4a5530';
    for (let i = 0; i < 20; i++) {
      const rx = ((i * 193 - cam) % W + W) % W;
      ctx.fillRect(rx, GROUND_Y + 6, 8, 5);
      ctx.fillRect(rx + 2, GROUND_Y + 4, 4, 2);
    }
    // Корни на земле
    ctx.fillStyle = '#3b2008';
    for (let i = 0; i < 12; i++) {
      const rx = ((i * 267 - cam * 0.9) % W + W) % W;
      ctx.fillRect(rx, GROUND_Y + 10, 18, 4);
      ctx.fillRect(rx + 4, GROUND_Y + 7, 10, 3);
    }
  } else {
    ctx.fillStyle = lvl.groundColor; ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = lvl.platColor;   ctx.fillRect(0, GROUND_Y, W, 14);
    ctx.fillStyle = '#ffffff06';
    for (let gx = (-(cam % 64) + 64) % 64; gx < W; gx += 64) ctx.fillRect(gx, GROUND_Y, 32, 14);
  }

  // ── ПЕРЕДНИЕ ДЕРЕВЬЯ (параллакс 1.0 — привязаны к миру) ──
  if (isForest) {
    for (let i = 0; i < 30; i++) {
      const worldTX = i * 260 + (i % 3) * 40;
      const tx = worldTX - cam;
      if (tx < -80 || tx > W + 80) continue;
      const th = 130 + (i * 41) % 80;
      const tw = 44 + (i * 19) % 30;
      drawTree(ctx, tx, GROUND_Y, th, tw, false);
    }
    // Туман у земли
    ctx.fillStyle = 'rgba(10,25,5,0.12)';
    ctx.fillRect(0, GROUND_Y - 30, W, 30);
  }

  // ── ПЛАТФОРМЫ ──
  for (const p of lvl.platforms) {
    const sx = p.worldX - cam;
    if (sx > -p.w - 10 && sx < W + 10) {
      if (isForest) {
        // Платформа как ветка/бревно
        ctx.fillStyle = '#3b1e08'; ctx.fillRect(Math.round(sx), p.y, p.w, p.h);
        ctx.fillStyle = '#5c3311'; ctx.fillRect(Math.round(sx), p.y, p.w, 5);
        ctx.fillStyle = '#2d6614'; ctx.fillRect(Math.round(sx), p.y, p.w, 3);
        // Мох
        ctx.fillStyle = '#3a8020';
        for (let mx = Math.round(sx); mx < Math.round(sx + p.w); mx += 8) {
          ctx.fillRect(mx, p.y, 4, 3);
        }
      } else {
        ctx.fillStyle = lvl.platColor;   ctx.fillRect(Math.round(sx), p.y, p.w, p.h);
        ctx.fillStyle = '#ffffff22';      ctx.fillRect(Math.round(sx), p.y, p.w, 4);
      }
      ctx.fillStyle = isForest ? '#3b2008' : lvl.groundColor;
      ctx.fillRect(Math.round(sx + 8),        p.y + p.h, 8, GROUND_Y - p.y - p.h);
      ctx.fillRect(Math.round(sx + p.w - 16), p.y + p.h, 8, GROUND_Y - p.y - p.h);
    }
  }
}

function drawFinish(ctx: CanvasRenderingContext2D, worldX: number, cam: number, t: number) {
  const sx = worldX - cam;
  if (sx < -80 || sx > W + 80) return;
  // Портал — мигающий столб
  const pulse = 0.6 + 0.4 * Math.sin(t * 0.08);
  ctx.shadowColor = '#00ffcc'; ctx.shadowBlur = 20 * pulse;
  ctx.fillStyle = `rgba(0,255,180,${0.15 * pulse})`;
  ctx.fillRect(Math.round(sx - 20), GROUND_Y - 120, 40, 120);
  // Рамка
  ctx.strokeStyle = `rgba(0,255,180,${0.8 * pulse})`; ctx.lineWidth = 3;
  ctx.strokeRect(Math.round(sx - 20), GROUND_Y - 120, 40, 120);
  // Пиксельные линии
  ctx.fillStyle = `rgba(0,255,180,${0.6 * pulse})`;
  for (let py = GROUND_Y - 110; py < GROUND_Y; py += 14) ctx.fillRect(Math.round(sx - 16), py, 32, 4);
  // Надпись
  ctx.shadowBlur = 0; ctx.fillStyle = `rgba(0,255,180,${pulse})`;
  ctx.font = 'bold 9px "Press Start 2P", monospace';
  ctx.textAlign = 'center'; ctx.fillText('ФИНИШ', Math.round(sx), GROUND_Y - 128);
  ctx.textAlign = 'left'; ctx.shadowBlur = 0;
}

function drawPlayer(ctx: CanvasRenderingContext2D, p: Player, cam: number, mouseWorldX: number) {
  const sx = PLAYER_SCREEN_X;
  const y  = Math.round(p.y);
  const facing = mouseWorldX > p.worldX ? 1 : -1;
  const flash   = p.invTimer > 0 && Math.floor(p.invTimer / 3) % 2 === 0;
  if (flash) ctx.globalAlpha = 0.35;

  // Лёгкое свечение вокруг персонажа
  ctx.shadowColor = '#00ffaa'; ctx.shadowBlur = 8;

  // ── НОГИ (анимированные) ──
  const run = p.onGround ? p.frame : 0;
  const legL = Math.round(Math.sin(run * 0.28) * 5);
  const legR = -legL;

  // Левая нога
  ctx.fillStyle = '#1a3a8a'; // тёмно-синие штаны
  ctx.fillRect(sx + 5,  y + 22, 7, 10 + legL);
  // Ботинок левый
  ctx.fillStyle = '#2a1a0a';
  ctx.fillRect(sx + 3,  y + 30 + legL, 10, 5);
  ctx.fillRect(sx + 2,  y + 33 + legL, 12, 3);

  // Правая нога
  ctx.fillStyle = '#1a3a8a';
  ctx.fillRect(sx + 14, y + 22, 7, 10 + legR);
  // Ботинок правый
  ctx.fillStyle = '#2a1a0a';
  ctx.fillRect(sx + 13, y + 30 + legR, 10, 5);
  ctx.fillRect(sx + 12, y + 33 + legR, 12, 3);

  // ── ТЕЛО — бронежилет ──
  ctx.fillStyle = '#2d5c1e'; // основа — тёмно-зелёный
  ctx.fillRect(sx + 4, y + 10, 18, 14);
  // Панели бронежилета
  ctx.fillStyle = '#3d7a28';
  ctx.fillRect(sx + 5,  y + 11, 7, 5);
  ctx.fillRect(sx + 14, y + 11, 7, 5);
  ctx.fillRect(sx + 5,  y + 18, 16, 4);
  // Блик на жилете
  ctx.fillStyle = '#55aa3a';
  ctx.fillRect(sx + 6,  y + 12, 3, 2);
  ctx.fillRect(sx + 15, y + 12, 3, 2);
  // Пояс
  ctx.fillStyle = '#1a0a00';
  ctx.fillRect(sx + 4,  y + 22, 18, 3);
  ctx.fillStyle = '#888';
  ctx.fillRect(sx + 11, y + 22, 4, 3); // пряжка

  // ── РУКИ ──
  const armSwing = p.onGround ? Math.round(Math.sin(run * 0.28) * 4) : 0;
  // Левая рука
  ctx.fillStyle = '#2d5c1e';
  ctx.fillRect(sx - 2, y + 11 + armSwing, 6, 10);
  ctx.fillStyle = '#c8854a'; // кисть
  ctx.fillRect(sx - 2, y + 19 + armSwing, 6, 5);
  // Правая рука (с оружием)
  ctx.fillStyle = '#2d5c1e';
  ctx.fillRect(sx + 22, y + 11 - armSwing, 6, 10);
  ctx.fillStyle = '#c8854a';
  ctx.fillRect(sx + 22, y + 19 - armSwing, 6, 5);

  // ── ОРУЖИЕ ──
  ctx.shadowBlur = 0;
  const gunY = y + 17;
  if (facing === 1) {
    // Корпус автомата
    ctx.fillStyle = '#333';
    ctx.fillRect(sx + 22, gunY,     18, 6);
    // Ствол
    ctx.fillStyle = '#555';
    ctx.fillRect(sx + 36, gunY + 1, 10, 4);
    // Магазин
    ctx.fillStyle = '#222';
    ctx.fillRect(sx + 26, gunY + 6, 6, 7);
    // Мушка
    ctx.fillStyle = '#ff6600';
    ctx.fillRect(sx + 44, gunY,     2, 2);
  } else {
    ctx.fillStyle = '#333';
    ctx.fillRect(sx - 14, gunY,     18, 6);
    ctx.fillStyle = '#555';
    ctx.fillRect(sx - 24, gunY + 1, 10, 4);
    ctx.fillStyle = '#222';
    ctx.fillRect(sx - 6,  gunY + 6, 6, 7);
    ctx.fillStyle = '#ff6600';
    ctx.fillRect(sx - 26, gunY,     2, 2);
  }

  // ── ГОЛОВА ──
  ctx.shadowColor = '#00ffaa'; ctx.shadowBlur = 6;
  // Шея
  ctx.fillStyle = '#c8854a';
  ctx.fillRect(sx + 9, y + 6,  8, 5);
  // Голова — лицо
  ctx.fillStyle = '#c8854a';
  ctx.fillRect(sx + 5, y - 12, 16, 14);
  // Тёмная линия челюсти
  ctx.fillStyle = '#a06030';
  ctx.fillRect(sx + 5, y + 1,  16, 3);
  // Нос
  ctx.fillStyle = '#a06030';
  ctx.fillRect(sx + 12, y - 5, 3, 4);
  // Рот
  ctx.fillStyle = '#7a3a10';
  ctx.fillRect(sx + 8,  y - 1, 10, 2);
  // Глаза (зависят от направления)
  ctx.shadowBlur = 0;
  if (facing === 1) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx + 13, y - 9, 6, 5);
    ctx.fillStyle = '#001aff';
    ctx.fillRect(sx + 15, y - 8, 3, 3);
    ctx.fillStyle = '#000';
    ctx.fillRect(sx + 16, y - 8, 2, 2);
    // Бровь
    ctx.fillStyle = '#5c3000';
    ctx.fillRect(sx + 13, y - 10, 6, 2);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx + 7,  y - 9, 6, 5);
    ctx.fillStyle = '#001aff';
    ctx.fillRect(sx + 8,  y - 8, 3, 3);
    ctx.fillStyle = '#000';
    ctx.fillRect(sx + 8,  y - 8, 2, 2);
    ctx.fillStyle = '#5c3000';
    ctx.fillRect(sx + 7,  y - 10, 6, 2);
  }
  // Блик на щеке
  ctx.fillStyle = '#e0a070';
  ctx.fillRect(facing === 1 ? sx + 17 : sx + 6, y - 7, 3, 2);

  // ── ШЛЕМ ──
  ctx.shadowColor = '#00ffaa'; ctx.shadowBlur = 4;
  ctx.fillStyle = '#1a4010';
  ctx.fillRect(sx + 4,  y - 14, 18, 6);
  ctx.fillRect(sx + 5,  y - 16, 16, 4);
  ctx.fillRect(sx + 7,  y - 18, 12, 4);
  // Козырёк
  ctx.fillStyle = '#0d2a0a';
  if (facing === 1) ctx.fillRect(sx + 16, y - 13, 8, 3);
  else              ctx.fillRect(sx + 2,  y - 13, 8, 3);
  // Блик на шлеме
  ctx.fillStyle = '#3a7a28';
  ctx.fillRect(sx + 8, y - 17, 5, 2);

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, cam: number) {
  const sx = e.worldX - cam;
  if (sx < -40 || sx > W + 40) return;
  const { y, w, h } = e;
  const col = ECOL[e.type];
  ctx.shadowColor = col.glow; ctx.shadowBlur = 8;
  ctx.fillStyle = col.body;  ctx.fillRect(Math.round(sx),     Math.round(y + 6), w, h - 6);
  ctx.fillStyle = col.hi;    ctx.fillRect(Math.round(sx + 2), Math.round(y),     w - 4, 14);
  ctx.shadowBlur = 0;
  ctx.fillStyle = col.eye;
  ctx.fillRect(Math.round(sx + 3),     Math.round(y + 3), 5, 4);
  ctx.fillRect(Math.round(sx + w - 8), Math.round(y + 3), 5, 4);
  if (e.type === 'shooter') {
    ctx.fillStyle = col.glow;
    ctx.fillRect(Math.round(sx + w/2 - 2), Math.round(y - 8), 4, 8);
    ctx.fillRect(Math.round(sx + w/2 - 5), Math.round(y - 10), 10, 3);
  }
  if (e.hp < e.maxHp) {
    const bw = w + 4; const bx = sx - 2;
    ctx.fillStyle = '#330000'; ctx.fillRect(Math.round(bx), Math.round(y - 10), bw, 5);
    ctx.fillStyle = '#ff2020'; ctx.fillRect(Math.round(bx), Math.round(y - 10), bw * (e.hp / e.maxHp), 5);
  }
}

function drawBullet(ctx: CanvasRenderingContext2D, b: Bullet, cam: number) {
  const sx = b.worldX - cam;
  const col = b.owner === 'player' ? '#ffd700' : '#ff4444';
  ctx.shadowColor = col; ctx.shadowBlur = 8;
  ctx.fillStyle = col; ctx.fillRect(Math.round(sx), Math.round(b.y), b.w, b.h);
  ctx.shadowBlur = 0;
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
  ctx.globalAlpha = p.life / p.maxLife;
  ctx.fillStyle = p.color;
  ctx.fillRect(Math.round(p.x - p.size/2), Math.round(p.y - p.size/2), p.size, p.size);
  ctx.globalAlpha = 1;
}

// Прогресс-бар уровня
function drawProgressBar(ctx: CanvasRenderingContext2D, worldX: number, lvlLen: number) {
  const bw = 200; const bh = 8; const bx = W - bw - 12; const by = 10;
  ctx.fillStyle = '#ffffff15'; ctx.fillRect(bx, by, bw, bh);
  const pct = Math.min(1, worldX / lvlLen);
  ctx.fillStyle = '#00ff88'; ctx.fillRect(bx, by, bw * pct, bh);
  ctx.strokeStyle = '#00ff8860'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, bh);
  // Иконка
  ctx.fillStyle = '#00ff8890'; ctx.font = '8px "Press Start 2P", monospace';
  ctx.fillText('►', bx + bw * pct - 4, by + bh + 10);
}

// ─────────────────────────────────────────────
//  СОЗДАНИЕ
// ─────────────────────────────────────────────
function makePlayer(stats?: Stats): Player {
  return {
    worldX: 80, y: GROUND_Y - 42, w: 26, h: 42,
    vy: 0, onGround: true, lastShot: 0, facing: 1, invTimer: 0, frame: 0,
    stats: stats ?? { hp: 100, maxHp: 100, damage: 18, fireRate: 350, speed: 3.5, bulletSpeed: 9, pierce: 1, doubleShot: false },
  };
}

function makeEnemy(sp: EnemySpawn, lvlIdx: number): Enemy {
  const bonus = lvlIdx * 0.4;
  const hp = sp.type === 'walker'  ? Math.round(40  + lvlIdx * 18)
           : sp.type === 'jumper'  ? Math.round(30  + lvlIdx * 14)
           :                         Math.round(55  + lvlIdx * 22);
  const spd = sp.type === 'jumper' ? 1.6 + bonus * 0.3
            : sp.type === 'walker' ? 1.3 + bonus * 0.2
            :                        0.4;
  return {
    id: uid(), worldX: sp.worldX, y: GROUND_Y - 36, w: 26, h: 36,
    vy: 0, onGround: true, hp, maxHp: hp, speed: spd,
    type: sp.type, shootTimer: 0,
    reward: sp.type === 'shooter' ? 30 : sp.type === 'jumper' ? 20 : 10,
    patrol: sp.patrol ?? 80, startWorldX: sp.worldX,
  };
}

function collidesWorld(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// ─────────────────────────────────────────────
//  КОМПОНЕНТ
// ─────────────────────────────────────────────
export default function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>('menu');
  const [hpDisp, setHpDisp] = useState(100);
  const [maxHpDisp, setMaxHpDisp] = useState(100);
  const [lvlDisp, setLvlDisp] = useState(1);
  const [scoreDisp, setScoreDisp] = useState(0);
  const [upgradeOpts, setUpgradeOpts] = useState<Upgrade[]>([]);
  const [dmgFlash, setDmgFlash] = useState(false);

  const phaseRef = useRef<Phase>('menu');
  const setPhaseSync = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  const st = useRef({
    player: makePlayer(),
    enemies: [] as Enemy[],
    bullets: [] as Bullet[],
    particles: [] as Particle[],
    keys: {} as Record<string, boolean>,
    mouseWorldX: 400, mouseY: H / 2,
    camera: 0,           // сколько мира прокручено
    score: 0,
    lvlIdx: 0,
    tick: 0,
    frameId: 0,
    finishX: 3000,
  });

  // ── Старт уровня ──
  const startLevel = (idx: number, stats?: Stats) => {
    const s = st.current;
    const lvl = LEVELS[idx];
    s.player   = makePlayer(stats);
    s.enemies  = lvl.enemies.map(sp => makeEnemy(sp, idx));
    s.bullets  = [];
    s.particles = [];
    s.camera   = 0;
    s.lvlIdx   = idx;
    // очки накапливаются между уровнями
    s.tick     = 0;
    s.finishX  = lvl.length - 80;
    setLvlDisp(idx + 1);
    setHpDisp(s.player.stats.hp);
    setMaxHpDisp(s.player.stats.maxHp);
    setPhaseSync('playing');
  };

  const applyUpgrade = (upg: Upgrade) => {
    const s = st.current;
    const newStats = upg.apply({ ...s.player.stats });
    const nextIdx = s.lvlIdx + 1;
    if (nextIdx >= LEVELS.length) { setPhaseSync('win'); }
    else { startLevel(nextIdx, newStats); }
  };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const s = st.current;

    // ── Ввод ──
    const onKeyDown = (e: KeyboardEvent) => { s.keys[e.code] = true;  if (['Space','ArrowUp','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(e.code)) e.preventDefault(); };
    const onKeyUp   = (e: KeyboardEvent) => { s.keys[e.code] = false; };
    const onMove    = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      const mx = (e.clientX - r.left) * (W / r.width);
      const my = (e.clientY - r.top)  * (H / r.height);
      s.mouseWorldX = mx + s.camera;
      s.mouseY = my;
    };
    const shoot = () => {
      if (phaseRef.current !== 'playing') return;
      const p = s.player; const now = Date.now();
      if (now - p.lastShot < p.stats.fireRate) return;
      p.lastShot = now;
      const dx = s.mouseWorldX - p.worldX;
      const dy = s.mouseY      - (p.y + p.h / 2);
      const len = Math.sqrt(dx*dx + dy*dy) || 1;
      const spd = p.stats.bulletSpeed;
      const shots = p.stats.doubleShot ? [-0.12, 0.12] : [0];
      for (const off of shots) {
        s.bullets.push({ id: uid(), worldX: p.worldX + p.w/2, y: p.y + 14, w: 10, h: 5,
          vx: (dx/len)*spd + off*spd, vy: (dy/len)*spd,
          dmg: p.stats.damage, owner: 'player', pierce: p.stats.pierce, life: 90 });
      }
    };
    const onClick = () => shoot();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mousedown', onClick);

    const burst = (wx: number, y: number, color: string, n = 8) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2; const spd = Math.random() * 3 + 1;
        s.particles.push({ id: uid(), x: wx - s.camera, y, vx: Math.cos(a)*spd, vy: Math.sin(a)*spd, life: 36, maxLife: 36, color, size: Math.floor(Math.random()*5)+2 });
      }
    };

    let last = 0;
    const loop = (ts: number) => {
      const dt = Math.min(ts - last, 50); last = ts;
      const lvl = LEVELS[s.lvlIdx] ?? LEVELS[0];
      s.tick++;

      // ── Фон ──
      drawBg(ctx, lvl, s.camera);

      if (phaseRef.current === 'playing') {
        const p = s.player;

        // ── Движение ──
        if (s.keys['KeyA'] || s.keys['ArrowLeft'])  { p.worldX -= p.stats.speed; p.facing = -1; }
        if (s.keys['KeyD'] || s.keys['ArrowRight']) { p.worldX += p.stats.speed; p.facing =  1; }
        p.worldX = Math.max(s.camera + 20, p.worldX); // нельзя уйти за левый край экрана

        // Прыжок
        if ((s.keys['KeyW'] || s.keys['ArrowUp'] || s.keys['ShiftLeft'] || s.keys['ShiftRight']) && p.onGround) {
          p.vy = -12;
        }
        // Автоогонь пробелом
        if (s.keys['Space']) shoot();

        // ── Физика игрока ──
        p.vy += GRAVITY; p.y += p.vy; p.onGround = false;
        if (p.y + p.h >= GROUND_Y) { p.y = GROUND_Y - p.h; p.vy = 0; p.onGround = true; }
        for (const pl of lvl.platforms) {
          if (p.worldX + p.w > pl.worldX && p.worldX < pl.worldX + pl.w &&
              p.y + p.h > pl.y && p.y + p.h - p.vy <= pl.y + 4) {
            p.y = pl.y - p.h; p.vy = 0; p.onGround = true;
          }
        }

        // ── Камера ── следует за игроком, фиксируя его на PLAYER_SCREEN_X
        const targetCam = p.worldX - PLAYER_SCREEN_X;
        s.camera += (targetCam - s.camera) * 0.12;
        s.camera = Math.max(0, Math.min(s.camera, lvl.length - W));

        p.frame++; if (p.invTimer > 0) p.invTimer--;

        // ── Враги ──
        for (const e of s.enemies) {
          if (e.hp <= 0) continue;
          // Физика
          e.vy += GRAVITY; e.y += e.vy; e.onGround = false;
          if (e.y + e.h >= GROUND_Y) { e.y = GROUND_Y - e.h; e.vy = 0; e.onGround = true; }
          for (const pl of lvl.platforms) {
            if (e.worldX + e.w > pl.worldX && e.worldX < pl.worldX + pl.w &&
                e.y + e.h > pl.y && e.y + e.h - e.vy <= pl.y + 4) {
              e.y = pl.y - e.h; e.vy = 0; e.onGround = true;
            }
          }

          const dist = Math.abs(p.worldX - e.worldX);
          const inRange = dist < 350;

          if (e.type === 'walker' || e.type === 'jumper') {
            if (inRange) {
              // Идёт к игроку
              const dx = p.worldX - e.worldX;
              e.worldX += (dx / Math.abs(dx)) * e.speed;
            } else {
              // Патрулирует
              const dFromStart = e.worldX - e.startWorldX;
              if (dFromStart > e.patrol)  e.worldX -= e.speed * 0.6;
              else if (dFromStart < -e.patrol) e.worldX += e.speed * 0.6;
              else e.worldX += (Math.sin(s.tick * 0.02 + e.id) > 0 ? 1 : -1) * e.speed * 0.5;
            }
            if (e.type === 'jumper' && e.onGround && inRange && Math.random() < 0.02) e.vy = -10;
          } else if (e.type === 'shooter') {
            // Стрелок стоит, стреляет при приближении
            if (inRange) {
              e.shootTimer += dt;
              if (e.shootTimer > 1800) {
                e.shootTimer = 0;
                const dx = p.worldX - e.worldX; const dy = (p.y + p.h/2) - (e.y + e.h/2);
                const len = Math.sqrt(dx*dx + dy*dy) || 1;
                s.bullets.push({ id: uid(), worldX: e.worldX + e.w/2, y: e.y + 10, w: 8, h: 4,
                  vx: (dx/len)*5, vy: (dy/len)*5, dmg: 12, owner: 'enemy', pierce: 1, life: 120 });
              }
            }
          }

          // Урон игроку при контакте
          if (p.invTimer === 0 && collidesWorld(p.worldX, p.y, p.w, p.h, e.worldX, e.y, e.w, e.h)) {
            const dmg = e.type === 'shooter' ? 10 : 15;
            p.stats.hp -= dmg; p.invTimer = 45;
            burst(p.worldX, p.y + p.h/2, '#ff4444', 8);
            setDmgFlash(true); setTimeout(() => setDmgFlash(false), 280);
            if (p.stats.hp <= 0) { p.stats.hp = 0; setScoreDisp(s.score); setPhaseSync('dead'); }
            setHpDisp(Math.max(0, p.stats.hp));
          }

          drawEnemy(ctx, e, s.camera);
        }

        // ── Пули ──
        const alive: Bullet[] = [];
        for (const b of s.bullets) {
          b.worldX += b.vx; b.y += b.vy; b.life--;
          if (b.life <= 0) continue;
          const sx = b.worldX - s.camera;
          if (sx < -20 || sx > W + 20 || b.y < -20 || b.y > H + 20) continue;

          if (b.owner === 'player') {
            const keep = true;
            for (const e of s.enemies) {
              if (e.hp <= 0 || b.pierce <= 0) continue;
              if (collidesWorld(b.worldX, b.y, b.w, b.h, e.worldX, e.y, e.w, e.h)) {
                e.hp -= b.dmg; b.pierce--;
                burst(e.worldX + e.w/2, e.y + e.h/2, ECOL[e.type].glow, 5);
                if (e.hp <= 0) {
                  s.score += e.reward;
                  burst(e.worldX + e.w/2, e.y + e.h/2, '#ffd700', 14);
                  setScoreDisp(s.score);
                }
              }
            }
            if (b.pierce > 0) { alive.push(b); drawBullet(ctx, b, s.camera); }
            else if (keep) drawBullet(ctx, b, s.camera);
          } else {
            const p2 = s.player;
            if (p2.invTimer === 0 && collidesWorld(b.worldX, b.y, b.w, b.h, p2.worldX, p2.y, p2.w, p2.h)) {
              p2.stats.hp -= b.dmg; p2.invTimer = 30;
              burst(p2.worldX, p2.y + p2.h/2, '#ff4444', 6);
              setDmgFlash(true); setTimeout(() => setDmgFlash(false), 280);
              if (p2.stats.hp <= 0) { p2.stats.hp = 0; setScoreDisp(s.score); setPhaseSync('dead'); }
              setHpDisp(Math.max(0, p2.stats.hp));
            } else { alive.push(b); drawBullet(ctx, b, s.camera); }
          }
        }
        s.bullets = alive;
        s.enemies = s.enemies.filter(e => e.hp > 0);

        // ── Частицы ──
        s.particles = s.particles.filter(pt => { pt.x+=pt.vx; pt.y+=pt.vy; pt.vx*=0.9; pt.vy*=0.9; pt.life--; drawParticle(ctx, pt); return pt.life>0; });

        // ── Финишный портал ──
        drawFinish(ctx, s.finishX - s.camera, 0, s.tick);

        // ── Игрок ──
        drawPlayer(ctx, p, s.camera, s.mouseWorldX);

        // ── Прицел ──
        const msx = s.mouseWorldX - s.camera;
        ctx.strokeStyle = '#00ff8870'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(msx - 12, s.mouseY); ctx.lineTo(msx + 12, s.mouseY);
        ctx.moveTo(msx, s.mouseY - 12); ctx.lineTo(msx, s.mouseY + 12);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(msx, s.mouseY, 8, 0, Math.PI*2); ctx.stroke();

        // ── Прогресс-бар ──
        drawProgressBar(ctx, p.worldX, lvl.length);

        // ── Обновляем HUD ──
        setHpDisp(Math.max(0, p.stats.hp));

        // ── Финиш ──
        if (p.worldX >= s.finishX) {
          setUpgradeOpts(pickUpgrades(3));
          setScoreDisp(s.score);
          setPhaseSync('upgrade');
        }

      } else {
        // Рисуем частицы вне игры
        s.particles = s.particles.filter(pt => { pt.x+=pt.vx; pt.y+=pt.vy; pt.life--; drawParticle(ctx,pt); return pt.life>0; });
        drawFinish(ctx, s.finishX - s.camera, 0, s.tick);
      }

      s.frameId = requestAnimationFrame(loop);
    };

    s.frameId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(s.frameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup',   onKeyUp);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mousedown', onClick);
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: '#060a08' }}>
      <div className="mb-3 text-center">
        <h1 className="font-pixel glow-green" style={{ fontSize: 18, letterSpacing: 4 }}>PIXEL RANGER</h1>
        <p className="font-pixel mt-1" style={{ fontSize: 7, color: '#00ff4140' }}>2D SIDE-SCROLLING SHOOTER</p>
      </div>

      {/* HUD */}
      {phase === 'playing' && (
        <div className="flex gap-4 mb-2 items-end px-2 w-full" style={{ maxWidth: W }}>
          <div style={{ flex: 2 }}>
            <div className="font-pixel glow-red mb-1" style={{ fontSize: 8 }}>HP</div>
            <div className="hp-bar-outer">
              <div className="hp-bar-inner" style={{ width: `${Math.max(0,(hpDisp/maxHpDisp)*100)}%` }} />
            </div>
            <div className="font-pixel mt-1" style={{ fontSize: 7, color: '#ff6060' }}>{Math.max(0,hpDisp)} / {maxHpDisp}</div>
          </div>
          <div className="text-center" style={{ flex: 1 }}>
            <div className="font-pixel glow-yellow" style={{ fontSize: 8 }}>УРОВЕНЬ</div>
            <div className="font-pixel glow-yellow" style={{ fontSize: 20 }}>{lvlDisp}</div>
            <div className="font-pixel" style={{ fontSize: 7, color: '#ffd70060' }}>{LEVELS[lvlDisp - 1]?.name}</div>
          </div>
          <div className="text-right" style={{ flex: 1 }}>
            <div className="font-pixel glow-green" style={{ fontSize: 8 }}>ОЧКИ</div>
            <div className="font-pixel glow-green" style={{ fontSize: 18 }}>{scoreDisp}</div>
          </div>
        </div>
      )}

      {/* Canvas */}
      <div className="relative" style={{ width: '100%', maxWidth: W, border: '3px solid #00ff4130' }}>
        <canvas
          ref={canvasRef} width={W} height={H}
          className={`w-full block ${dmgFlash ? 'damage-flash' : ''}`}
          style={{ imageRendering: 'pixelated', display: 'block', background: '#060a08' }}
        />

        {/* МЕНЮ */}
        {phase === 'menu' && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#060a08ee' }}>
            <div className="text-center px-10 py-8 pixel-border" style={{ background: '#0a0e0a', minWidth: 340 }}>
              <div className="font-pixel glow-green mb-1" style={{ fontSize: 24 }}>PIXEL RANGER</div>
              <div className="font-pixel glow-yellow mb-6" style={{ fontSize: 8 }}>2D ПИКСЕЛЬНЫЙ ШУТЕР</div>
              <div className="font-pixel mb-2" style={{ fontSize: 8, color: '#00ff4190', lineHeight: 3 }}>
                A / D — движение<br/>
                W / SHIFT — прыжок<br/>
                🖱 Мышь — прицел и стрельба<br/>
                ПРОБЕЛ — автоогонь<br/>
                🚩 Дойди до портала — пройди уровень
              </div>
              <div className="font-pixel mb-6" style={{ fontSize: 7, color: '#ffd70070', lineHeight: 2.5 }}>
                👾 Красный — ходит &nbsp;|&nbsp; 🔵 Синий — прыгает &nbsp;|&nbsp; 🟢 Зелёный — стреляет
              </div>
              <button className="btn-pixel" style={{ fontSize: 11 }} onClick={() => { st.current.score = 0; setScoreDisp(0); startLevel(0); }}>
                ▶ НАЧАТЬ
              </button>
            </div>
          </div>
        )}

        {/* АПГРЕЙДЫ */}
        {phase === 'upgrade' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4" style={{ background: '#060a08f2' }}>
            <div className="font-pixel glow-green mb-1" style={{ fontSize: 14 }}>✓ УРОВЕНЬ {lvlDisp} ПРОЙДЕН!</div>
            <div className="font-pixel glow-yellow mb-4" style={{ fontSize: 8 }}>ОЧКИ: {scoreDisp} &nbsp;|&nbsp; ВЫБЕРИ УЛУЧШЕНИЕ</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, width: '100%', maxWidth: 660 }}>
              {upgradeOpts.map(u => (
                <div key={u.id} className="upgrade-card" onClick={() => applyUpgrade(u)} style={{ minHeight: 150 }}>
                  <div style={{ fontSize: 34, marginBottom: 8 }}>{u.icon}</div>
                  <div className="font-pixel mb-2" style={{ fontSize: 8, color: u.color, lineHeight: 2 }}>{u.name}</div>
                  <div className="font-pixel" style={{ fontSize: 7, color: '#00ff4180', lineHeight: 2.2 }}>{u.desc}</div>
                  <div className="font-pixel mt-3" style={{ fontSize: 7, color: '#00ff4150' }}>[ ВЫБРАТЬ ]</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ПОБЕДА */}
        {phase === 'win' && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#060a08f2' }}>
            <div className="text-center px-10 py-8 pixel-border" style={{ background: '#0a0e0a', minWidth: 300 }}>
              <div className="font-pixel glow-yellow mb-2" style={{ fontSize: 20 }}>🏆 ПОБЕДА!</div>
              <div className="font-pixel glow-green mb-1" style={{ fontSize: 9 }}>ВСЕ УРОВНИ ПРОЙДЕНЫ</div>
              <div className="font-pixel glow-green mb-6" style={{ fontSize: 24 }}>{scoreDisp} ОЧКОВ</div>
              <button className="btn-pixel" style={{ fontSize: 10 }} onClick={() => { st.current.score = 0; setScoreDisp(0); startLevel(0); }}>↺ СНОВА</button>
            </div>
          </div>
        )}

        {/* СМЕРТЬ */}
        {phase === 'dead' && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#060a08f2' }}>
            <div className="text-center px-10 py-8 pixel-border-red" style={{ background: '#0a0e0a', minWidth: 300 }}>
              <div className="font-pixel glow-red mb-1" style={{ fontSize: 20 }}>GAME OVER</div>
              <div className="font-pixel mb-2" style={{ fontSize: 8, color: '#ff6060' }}>ТЫ ПОГИБ</div>
              <div className="font-pixel glow-yellow mb-1" style={{ fontSize: 8 }}>УРОВЕНЬ: {lvlDisp}</div>
              <div className="font-pixel glow-green mb-6" style={{ fontSize: 22 }}>{scoreDisp} ОЧКОВ</div>
              <button className="btn-pixel" style={{ fontSize: 10 }} onClick={() => { st.current.score = 0; setScoreDisp(0); startLevel(0); }}>↺ СНОВА</button>
            </div>
          </div>
        )}
      </div>

      {phase === 'playing' && (
        <div className="mt-2 font-pixel text-center" style={{ fontSize: 7, color: '#00ff4130' }}>
          A/D — ДВИЖЕНИЕ &nbsp;|&nbsp; W/SHIFT — ПРЫЖОК &nbsp;|&nbsp; МЫШЬ — ПРИЦЕЛ &nbsp;|&nbsp; ПРОБЕЛ — ОГОНЬ &nbsp;|&nbsp; ДОЙДИ ДО ПОРТАЛА!
        </div>
      )}
    </div>
  );
}