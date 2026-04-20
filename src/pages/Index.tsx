import { useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────
//  КОНСТАНТЫ
// ─────────────────────────────────────────────
const W = 800;
const H = 400;
const GRAVITY = 0.55;
const GROUND_Y = H - 64; // верх земли
const TILE = 32;

let _id = 1;
const uid = () => _id++;

// ─────────────────────────────────────────────
//  ТИПЫ
// ─────────────────────────────────────────────
interface Rect { x: number; y: number; w: number; h: number }
interface Stats {
  hp: number; maxHp: number;
  damage: number;
  fireRate: number;   // ms между выстрелами
  speed: number;
  bulletSpeed: number;
  pierce: number;     // пробитие (1 = обычная пуля)
  doubleShot: boolean;
}
interface Player extends Rect {
  vy: number; onGround: boolean;
  stats: Stats;
  lastShot: number;
  facing: 1 | -1; // 1 = вправо, -1 = влево
  invTimer: number; // кадры неуязвимости
  frame: number;    // анимация
}
interface Enemy extends Rect {
  id: number; hp: number; maxHp: number;
  speed: number; vy: number; onGround: boolean;
  type: 'walker' | 'jumper' | 'shooter';
  shootTimer: number;
  reward: number; xp: number;
}
interface Bullet extends Rect {
  id: number; vx: number; vy: number;
  dmg: number; owner: 'player' | 'enemy';
  pierce: number;
  life: number;
}
interface Particle {
  id: number; x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  color: string; size: number;
}
interface Platform { x: number; y: number; w: number; h: number }
interface Upgrade {
  id: string; name: string; desc: string; icon: string; color: string;
  apply: (s: Stats) => Stats;
}
type Phase = 'menu' | 'playing' | 'upgrade' | 'win' | 'dead';

// ─────────────────────────────────────────────
//  АПГРЕЙДЫ
// ─────────────────────────────────────────────
const UPGRADES: Upgrade[] = [
  { id: 'dmg',    name: 'ДАМАГ +50%',      desc: 'Каждая пуля бьёт сильнее',       icon: '💥', color: '#ff5555', apply: s => ({ ...s, damage: Math.round(s.damage * 1.5) }) },
  { id: 'fire',   name: 'СКОРОСТЬ ОГНЯ',   desc: 'Стреляешь чаще',                 icon: '🔥', color: '#ffd700', apply: s => ({ ...s, fireRate: Math.max(80, Math.round(s.fireRate * 0.65)) }) },
  { id: 'hp',     name: 'АПТЕЧКА',         desc: 'Восстанавливает 40 HP',           icon: '❤️', color: '#ff4444', apply: s => ({ ...s, hp: Math.min(s.hp + 40, s.maxHp) }) },
  { id: 'maxhp',  name: 'MAX HP +30',      desc: 'Увеличивает максимальное HP',     icon: '💊', color: '#ff7777', apply: s => ({ ...s, maxHp: s.maxHp + 30, hp: s.hp + 30 }) },
  { id: 'spd',    name: 'СКОРОСТЬ',        desc: 'Передвигаешься быстрее',          icon: '👟', color: '#00bfff', apply: s => ({ ...s, speed: s.speed + 1.2 }) },
  { id: 'bspd',   name: 'ПУЛЯ +',         desc: 'Пули летят быстрее',              icon: '⚡', color: '#aaff00', apply: s => ({ ...s, bulletSpeed: s.bulletSpeed + 3 }) },
  { id: 'pierce', name: 'ПРОБИТИЕ',        desc: 'Пуля пронзает 2 врагов',         icon: '🎯', color: '#ff8c00', apply: s => ({ ...s, pierce: s.pierce + 1 }) },
  { id: 'double', name: 'ДВОЙНОЙ ВЫСТРЕЛ', desc: 'Стреляешь двумя пулями сразу',   icon: '🔫', color: '#cc44ff', apply: s => ({ ...s, doubleShot: true }) },
  { id: 'dmg2',   name: 'КРИТИЧЕСКИЙ УДАР',desc: 'Урон ×2',                         icon: '💣', color: '#ff2020', apply: s => ({ ...s, damage: s.damage * 2 }) },
];

function pickUpgrades(count = 3): Upgrade[] {
  return [...UPGRADES].sort(() => Math.random() - 0.5).slice(0, count);
}

// ─────────────────────────────────────────────
//  УРОВНИ — набор врагов и платформ
// ─────────────────────────────────────────────
interface LevelDef {
  name: string;
  bg: string;         // цвет неба
  groundColor: string;
  platformColor: string;
  enemyWaves: Array<{ type: Enemy['type']; count: number; delay: number }>;
  platforms: Platform[];
}

const LEVELS: LevelDef[] = [
  {
    name: 'ЛЕСНАЯ ЗОНА',
    bg: '#0a1a0a',
    groundColor: '#1a4d1a',
    platformColor: '#2d6b2d',
    enemyWaves: [
      { type: 'walker',  count: 5, delay: 1800 },
      { type: 'walker',  count: 4, delay: 1200 },
      { type: 'jumper',  count: 3, delay: 1500 },
    ],
    platforms: [
      { x: 300, y: GROUND_Y - 80,  w: 100, h: 16 },
      { x: 520, y: GROUND_Y - 130, w: 120, h: 16 },
      { x: 700, y: GROUND_Y - 80,  w: 100, h: 16 },
    ],
  },
  {
    name: 'ПРОМЗОНА',
    bg: '#0a0a1a',
    groundColor: '#2a2a3d',
    platformColor: '#3d3d5c',
    enemyWaves: [
      { type: 'walker',  count: 6, delay: 1400 },
      { type: 'jumper',  count: 4, delay: 1200 },
      { type: 'shooter', count: 3, delay: 2000 },
    ],
    platforms: [
      { x: 250, y: GROUND_Y - 100, w: 90,  h: 16 },
      { x: 450, y: GROUND_Y - 60,  w: 80,  h: 16 },
      { x: 620, y: GROUND_Y - 140, w: 110, h: 16 },
    ],
  },
  {
    name: 'РУИНЫ',
    bg: '#1a0a00',
    groundColor: '#3d2000',
    platformColor: '#5c3000',
    enemyWaves: [
      { type: 'walker',  count: 5, delay: 1200 },
      { type: 'shooter', count: 4, delay: 1600 },
      { type: 'jumper',  count: 5, delay: 1000 },
      { type: 'shooter', count: 3, delay: 1400 },
    ],
    platforms: [
      { x: 200, y: GROUND_Y - 90,  w: 80,  h: 16 },
      { x: 380, y: GROUND_Y - 150, w: 100, h: 16 },
      { x: 580, y: GROUND_Y - 90,  w: 90,  h: 16 },
      { x: 730, y: GROUND_Y - 160, w: 80,  h: 16 },
    ],
  },
  {
    name: 'ФИНАЛ — КРЕПОСТЬ',
    bg: '#0d0005',
    groundColor: '#2d0015',
    platformColor: '#5a002a',
    enemyWaves: [
      { type: 'walker',  count: 8,  delay: 1000 },
      { type: 'jumper',  count: 6,  delay: 1000 },
      { type: 'shooter', count: 5,  delay: 1200 },
      { type: 'walker',  count: 6,  delay: 800  },
      { type: 'shooter', count: 6,  delay: 1000 },
    ],
    platforms: [
      { x: 180, y: GROUND_Y - 80,  w: 80,  h: 16 },
      { x: 320, y: GROUND_Y - 140, w: 100, h: 16 },
      { x: 500, y: GROUND_Y - 80,  w: 80,  h: 16 },
      { x: 650, y: GROUND_Y - 160, w: 120, h: 16 },
    ],
  },
];

// ─────────────────────────────────────────────
//  ЦВЕТА ВРАГОВ
// ─────────────────────────────────────────────
const ENEMY_COLOR: Record<Enemy['type'], { body: string; eye: string; glow: string }> = {
  walker:  { body: '#880000', eye: '#ffff00', glow: '#ff2020' },
  jumper:  { body: '#005588', eye: '#00ffff', glow: '#00bfff' },
  shooter: { body: '#336600', eye: '#ff8800', glow: '#aaff00' },
};

// ─────────────────────────────────────────────
//  РИСОВАЛКИ
// ─────────────────────────────────────────────
function drawPixelRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, glow?: string) {
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 8; }
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
  if (glow) ctx.shadowBlur = 0;
}

function drawPlayer(ctx: CanvasRenderingContext2D, p: Player, mouseX: number) {
  const { x, y, w, h } = p;
  const facing = mouseX > x + w / 2 ? 1 : -1;
  const flash = p.invTimer > 0 && Math.floor(p.invTimer / 3) % 2 === 0;
  if (flash) { ctx.globalAlpha = 0.4; }

  // Тело
  ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 10;
  ctx.fillStyle = '#1a8a3a'; ctx.fillRect(Math.round(x + 4), Math.round(y + 10), w - 8, h - 10);
  // Голова
  ctx.fillStyle = '#2aaa55'; ctx.fillRect(Math.round(x + 6), Math.round(y), w - 12, 14);
  // Глаз
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#00ffaa';
  const eyeX = facing === 1 ? x + w - 10 : x + 6;
  ctx.fillRect(Math.round(eyeX), Math.round(y + 4), 5, 4);
  // Пиксельный шлем
  ctx.fillStyle = '#0d5522';
  ctx.fillRect(Math.round(x + 4), Math.round(y), w - 8, 5);
  // Ноги (анимация)
  const legOff = Math.sin(p.frame * 0.3) * 3;
  ctx.fillStyle = '#0d5522';
  ctx.fillRect(Math.round(x + 5), Math.round(y + h - 10), 8, 10 + (p.onGround ? Math.round(legOff) : 0));
  ctx.fillRect(Math.round(x + w - 13), Math.round(y + h - 10), 8, 10 - (p.onGround ? Math.round(legOff) : 0));
  // Оружие
  ctx.fillStyle = '#888';
  if (facing === 1) {
    ctx.fillRect(Math.round(x + w - 6), Math.round(y + 14), 14, 5);
  } else {
    ctx.fillRect(Math.round(x - 8), Math.round(y + 14), 14, 5);
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy) {
  const { x, y, w, h } = e;
  const col = ENEMY_COLOR[e.type];
  ctx.shadowColor = col.glow; ctx.shadowBlur = 8;
  // Тело
  ctx.fillStyle = col.body; ctx.fillRect(Math.round(x), Math.round(y + 6), w, h - 6);
  // Голова
  ctx.fillStyle = col.body; ctx.fillRect(Math.round(x + 4), Math.round(y), w - 8, 12);
  // Глаза
  ctx.shadowBlur = 0; ctx.fillStyle = col.eye;
  ctx.fillRect(Math.round(x + 4), Math.round(y + 3), 5, 4);
  ctx.fillRect(Math.round(x + w - 9), Math.round(y + 3), 5, 4);
  // Shooter — антенна
  if (e.type === 'shooter') {
    ctx.fillStyle = col.glow;
    ctx.fillRect(Math.round(x + w/2 - 2), Math.round(y - 8), 4, 8);
    ctx.fillRect(Math.round(x + w/2 - 6), Math.round(y - 10), 12, 4);
  }
  // HP bar
  if (e.hp < e.maxHp) {
    ctx.fillStyle = '#330000'; ctx.fillRect(Math.round(x), Math.round(y - 10), w, 5);
    ctx.fillStyle = '#ff2020'; ctx.fillRect(Math.round(x), Math.round(y - 10), w * (e.hp / e.maxHp), 5);
  }
}

function drawBullet(ctx: CanvasRenderingContext2D, b: Bullet) {
  const color = b.owner === 'player' ? '#ffd700' : '#ff4444';
  const glow  = b.owner === 'player' ? '#ffa500' : '#ff0000';
  ctx.shadowColor = glow; ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(b.x), Math.round(b.y), b.w, b.h);
  ctx.shadowBlur = 0;
}

function drawBackground(ctx: CanvasRenderingContext2D, lvl: LevelDef, cameraX: number) {
  // Небо
  ctx.fillStyle = lvl.bg; ctx.fillRect(0, 0, W, H);

  // Звёзды/фон (параллакс ×0.2)
  ctx.fillStyle = '#ffffff18';
  const px = cameraX * 0.2;
  for (let i = 0; i < 40; i++) {
    const sx = ((i * 137 + 50 - px) % W + W) % W;
    const sy = (i * 73) % (GROUND_Y - 20);
    ctx.fillRect(sx, sy, 2, 2);
  }

  // Дальний слой — горы (параллакс ×0.4)
  ctx.fillStyle = '#ffffff08';
  const mx = cameraX * 0.4;
  for (let i = 0; i < 8; i++) {
    const base = ((i * 200 - mx) % (W + 200) + W + 200) % (W + 200) - 100;
    const mh = 60 + (i * 47) % 80;
    ctx.beginPath();
    ctx.moveTo(base, GROUND_Y);
    ctx.lineTo(base + 80, GROUND_Y - mh);
    ctx.lineTo(base + 160, GROUND_Y);
    ctx.fill();
  }

  // Земля
  ctx.fillStyle = lvl.groundColor;
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  // Линия травы
  ctx.fillStyle = lvl.platformColor;
  ctx.fillRect(0, GROUND_Y, W, TILE / 2);

  // Пиксельный узор земли
  ctx.fillStyle = '#ffffff08';
  for (let gx = 0; gx < W; gx += TILE) {
    ctx.fillRect(gx, GROUND_Y, TILE / 2, TILE / 2);
  }

  // Платформы
  for (const p of lvl.platforms) {
    const px2 = p.x - cameraX;
    if (px2 > -p.w && px2 < W + p.w) {
      ctx.fillStyle = lvl.platformColor;
      ctx.fillRect(Math.round(px2), p.y, p.w, p.h);
      ctx.fillStyle = '#ffffff18';
      ctx.fillRect(Math.round(px2), p.y, p.w, 4);
      // Опоры
      ctx.fillStyle = lvl.groundColor;
      ctx.fillRect(Math.round(px2 + 8), p.y + p.h, 8, GROUND_Y - p.y - p.h);
      ctx.fillRect(Math.round(px2 + p.w - 16), p.y + p.h, 8, GROUND_Y - p.y - p.h);
    }
  }
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
  ctx.globalAlpha = p.life / p.maxLife;
  ctx.fillStyle = p.color;
  ctx.fillRect(Math.round(p.x - p.size/2), Math.round(p.y - p.size/2), p.size, p.size);
  ctx.globalAlpha = 1;
}

// ─────────────────────────────────────────────
//  ФИЗИКА
// ─────────────────────────────────────────────
function collidesRect(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ─────────────────────────────────────────────
//  СОЗДАНИЕ ПЕРСОНАЖА
// ─────────────────────────────────────────────
function makePlayer(stats?: Stats): Player {
  return {
    x: 60, y: GROUND_Y - 40, w: 26, h: 36,
    vy: 0, onGround: true,
    lastShot: 0, facing: 1, invTimer: 0, frame: 0,
    stats: stats ?? {
      hp: 100, maxHp: 100,
      damage: 18,
      fireRate: 350,
      speed: 3.5,
      bulletSpeed: 9,
      pierce: 1,
      doubleShot: false,
    },
  };
}

function spawnEnemy(type: Enemy['type'], levelIndex: number): Enemy {
  const hp = type === 'walker'  ? 40  + levelIndex * 15
           : type === 'jumper'  ? 30  + levelIndex * 12
           :                      55  + levelIndex * 20;
  const speed = type === 'speeder' ? 3 : type === 'jumper' ? 1.8 : 1.4 + levelIndex * 0.1;
  return {
    id: uid(),
    x: W + 60 + Math.random() * 80,
    y: GROUND_Y - 40,
    w: 26, h: 36,
    hp, maxHp: hp,
    speed, vy: 0, onGround: true,
    type,
    shootTimer: 0,
    reward: type === 'shooter' ? 30 : type === 'jumper' ? 20 : 10,
    xp: 5,
  };
}

// ─────────────────────────────────────────────
//  КОМПОНЕНТ
// ─────────────────────────────────────────────
export default function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>('menu');
  const [hpDisplay, setHpDisplay] = useState(100);
  const [maxHpDisplay, setMaxHpDisplay] = useState(100);
  const [levelDisplay, setLevelDisplay] = useState(1);
  const [scoreDisplay, setScoreDisplay] = useState(0);
  const [upgradeOptions, setUpgradeOptions] = useState<Upgrade[]>([]);
  const [damageFlash, setDamageFlash] = useState(false);
  const [killedDisplay, setKilledDisplay] = useState(0);

  const phaseRef = useRef<Phase>('menu');
  const setPhaseSync = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  const stateRef = useRef({
    player: makePlayer(),
    enemies: [] as Enemy[],
    bullets: [] as Bullet[],
    particles: [] as Particle[],
    keys: {} as Record<string, boolean>,
    mouse: { x: W / 2, y: H / 2 },
    cameraX: 0,
    score: 0,
    levelIndex: 0,
    killed: 0,

    // Волны
    waveIndex: 0,
    waveTimer: 0,
    waveQueue: [] as Array<{ type: Enemy['type']; delay: number }>,
    waveSpawned: 0,
    totalEnemies: 0,

    frameId: 0,
  });

  // ── Начать уровень ──
  const startLevel = (lvlIdx: number, stats?: Stats) => {
    const st = stateRef.current;
    const lvl = LEVELS[lvlIdx];

    // Собираем очередь врагов
    const queue: Array<{ type: Enemy['type']; delay: number }> = [];
    for (const wave of lvl.enemyWaves) {
      for (let i = 0; i < wave.count; i++) queue.push({ type: wave.type, delay: wave.delay });
    }

    st.player = makePlayer(stats);
    st.enemies = [];
    st.bullets = [];
    st.particles = [];
    st.cameraX = 0;
    st.levelIndex = lvlIdx;
    st.waveQueue = queue;
    st.waveTimer = 0;
    st.waveSpawned = 0;
    st.totalEnemies = queue.length;
    st.killed = 0;

    setLevelDisplay(lvlIdx + 1);
    setHpDisplay(st.player.stats.hp);
    setMaxHpDisplay(st.player.stats.maxHp);
    setKilledDisplay(0);
    setPhaseSync('playing');
  };

  // ── Апгрейд ──
  const applyUpgrade = (upg: Upgrade) => {
    const st = stateRef.current;
    const newStats = upg.apply({ ...st.player.stats });
    const nextLvl = st.levelIndex + 1;
    if (nextLvl >= LEVELS.length) {
      setPhaseSync('win');
    } else {
      startLevel(nextLvl, newStats);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const st = stateRef.current;

    // ── Ввод ──
    const onKey = (e: KeyboardEvent, down: boolean) => { st.keys[e.code] = down; e.preventDefault(); };
    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      st.mouse.x = (e.clientX - r.left) * (W / r.width);
      st.mouse.y = (e.clientY - r.top)  * (H / r.height);
    };
    const onClick = () => {
      if (phaseRef.current !== 'playing') return;
      const p = st.player;
      const now = Date.now();
      if (now - p.lastShot < p.stats.fireRate) return;
      p.lastShot = now;

      const dx = st.mouse.x - (p.x + p.w / 2);
      const dy = st.mouse.y - (p.y + p.h / 2);
      const len = Math.sqrt(dx*dx + dy*dy) || 1;
      const spd = p.stats.bulletSpeed;

      const shots = p.stats.doubleShot ? [-0.1, 0.1] : [0];
      for (const offset of shots) {
        st.bullets.push({
          id: uid(),
          x: p.x + p.w/2 - 4, y: p.y + 14,
          w: 10, h: 5,
          vx: (dx/len) * spd + offset * spd,
          vy: (dy/len) * spd,
          dmg: p.stats.damage,
          owner: 'player',
          pierce: p.stats.pierce,
          life: 80,
        });
      }
    };

    window.addEventListener('keydown', e => onKey(e, true));
    window.addEventListener('keyup',   e => onKey(e, false));
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mousedown', onClick);

    const burst = (x: number, y: number, color: string, n = 8) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = Math.random() * 3 + 1;
        st.particles.push({ id: uid(), x, y, vx: Math.cos(a)*spd, vy: Math.sin(a)*spd, life: 35, maxLife: 35, color, size: Math.floor(Math.random()*5)+2 });
      }
    };

    let last = 0;
    const loop = (ts: number) => {
      const dt = Math.min(ts - last, 50);
      last = ts;
      const lvl = LEVELS[st.levelIndex] ?? LEVELS[0];

      // ── Рисуем фон ──
      drawBackground(ctx, lvl, st.cameraX);

      if (phaseRef.current === 'playing') {
        const p = st.player;

        // Движение игрока
        if (st.keys['KeyA'] || st.keys['ArrowLeft'])  { p.x -= p.stats.speed; p.facing = -1; }
        if (st.keys['KeyD'] || st.keys['ArrowRight']) { p.x += p.stats.speed; p.facing =  1; }
        // Зажатая стрельба
        if (st.keys['Space'] || st.keys['KeyZ']) {
          const now = Date.now();
          if (now - p.lastShot >= p.stats.fireRate) {
            p.lastShot = now;
            const dx = st.mouse.x - (p.x + p.w/2);
            const dy = st.mouse.y - (p.y + p.h/2);
            const len = Math.sqrt(dx*dx+dy*dy)||1;
            const spd = p.stats.bulletSpeed;
            const shots = p.stats.doubleShot ? [-0.1, 0.1] : [0];
            for (const off of shots) {
              st.bullets.push({ id: uid(), x: p.x+p.w/2-4, y: p.y+14, w: 10, h: 5,
                vx: (dx/len)*spd+off*spd, vy: (dy/len)*spd,
                dmg: p.stats.damage, owner: 'player', pierce: p.stats.pierce, life: 80 });
            }
          }
        }
        // Прыжок
        if ((st.keys['KeyW'] || st.keys['ArrowUp'] || st.keys['ShiftLeft']) && p.onGround) {
          p.vy = -12;
        }

        // Ограничение по экрану
        p.x = Math.max(10, Math.min(p.x, W - p.w - 10));

        // Физика игрока
        p.vy += GRAVITY; p.y += p.vy; p.onGround = false;
        if (p.y + p.h >= GROUND_Y) { p.y = GROUND_Y - p.h; p.vy = 0; p.onGround = true; }
        for (const pl of lvl.platforms) {
          const wx = pl.x - st.cameraX;
          if (p.x + p.w > wx && p.x < wx + pl.w && p.y + p.h > pl.y && p.y + p.h - p.vy <= pl.y + 4) {
            p.y = pl.y - p.h; p.vy = 0; p.onGround = true;
          }
        }

        p.frame++;
        if (p.invTimer > 0) p.invTimer--;

        // ── Спавн врагов ──
        if (st.waveSpawned < st.totalEnemies) {
          st.waveTimer += dt;
          const next = st.waveQueue[st.waveSpawned];
          if (next && st.waveTimer >= next.delay) {
            st.waveTimer = 0;
            st.enemies.push(spawnEnemy(next.type, st.levelIndex));
            st.waveSpawned++;
          }
        }

        // ── Враги ──
        const aliveEnemies: Enemy[] = [];
        for (const e of st.enemies) {
          // Физика врага
          e.vy += GRAVITY; e.y += e.vy; e.onGround = false;
          if (e.y + e.h >= GROUND_Y) { e.y = GROUND_Y - e.h; e.vy = 0; e.onGround = true; }
          for (const pl of lvl.platforms) {
            const wx = pl.x - st.cameraX;
            if (e.x + e.w > wx && e.x < wx + pl.w && e.y + e.h > pl.y && e.y + e.h - e.vy <= pl.y + 4) {
              e.y = pl.y - e.h; e.vy = 0; e.onGround = true;
            }
          }

          // Движение к игроку
          const dx = (p.x + p.w/2) - (e.x + e.w/2);
          if (Math.abs(dx) > 10) e.x += (dx / Math.abs(dx)) * e.speed;

          // Jumper прыгает
          if (e.type === 'jumper' && e.onGround && Math.abs(dx) < 200 && Math.random() < 0.015) {
            e.vy = -10;
          }

          // Shooter стреляет
          if (e.type === 'shooter') {
            e.shootTimer += dt;
            if (e.shootTimer > 2200 && Math.abs(dx) < 350) {
              e.shootTimer = 0;
              const edx = dx / (Math.abs(dx)||1);
              st.bullets.push({ id: uid(), x: e.x + e.w/2, y: e.y + 10, w: 8, h: 4,
                vx: edx * 5, vy: -0.5, dmg: 12, owner: 'enemy', pierce: 1, life: 100 });
            }
          }

          // Урон игроку при контакте
          if (collidesRect(e, { x: p.x, y: p.y, w: p.w, h: p.h }) && p.invTimer === 0) {
            p.stats.hp -= e.type === 'tank' ? 20 : 15;
            p.invTimer = 45;
            burst(p.x + p.w/2, p.y + p.h/2, '#ff4444', 10);
            setDamageFlash(true);
            setTimeout(() => setDamageFlash(false), 280);
            if (p.stats.hp <= 0) { p.stats.hp = 0; setPhaseSync('dead'); setScoreDisplay(st.score); }
            setHpDisplay(Math.max(0, p.stats.hp));
          }

          if (e.hp > 0) aliveEnemies.push(e);
          drawEnemy(ctx, e);
        }
        st.enemies = aliveEnemies;

        // ── Пули ──
        const aliveBullets: Bullet[] = [];
        for (const b of st.bullets) {
          b.x += b.vx; b.y += b.vy; b.life--;
          if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) continue;

          if (b.owner === 'player') {
            let hitSomething = false;
            for (const e of st.enemies) {
              if (b.pierce <= 0) break;
              if (collidesRect(b, e)) {
                e.hp -= b.dmg;
                b.pierce--;
                hitSomething = true;
                burst(e.x + e.w/2, e.y + e.h/2, ENEMY_COLOR[e.type].glow, 5);
                if (e.hp <= 0) {
                  st.score += e.reward; st.killed++;
                  burst(e.x + e.w/2, e.y + e.h/2, '#ffd700', 12);
                  setScoreDisplay(st.score);
                  setKilledDisplay(st.killed);
                }
              }
            }
            st.enemies = st.enemies.filter(e => e.hp > 0);
            if (b.pierce > 0) { aliveBullets.push(b); drawBullet(ctx, b); }
            else if (!hitSomething) { aliveBullets.push(b); drawBullet(ctx, b); }
          } else {
            // Вражеская пуля
            if (collidesRect(b, { x: p.x, y: p.y, w: p.w, h: p.h }) && p.invTimer === 0) {
              p.stats.hp -= b.dmg; p.invTimer = 30;
              burst(p.x+p.w/2, p.y+p.h/2, '#ff4444', 6);
              setDamageFlash(true); setTimeout(() => setDamageFlash(false), 280);
              if (p.stats.hp <= 0) { p.stats.hp = 0; setPhaseSync('dead'); setScoreDisplay(st.score); }
              setHpDisplay(Math.max(0, p.stats.hp));
            } else {
              aliveBullets.push(b); drawBullet(ctx, b);
            }
          }
        }
        st.bullets = aliveBullets;

        // ── Частицы ──
        st.particles = st.particles.filter(pt => {
          pt.x += pt.vx; pt.y += pt.vy; pt.vx *= 0.9; pt.vy *= 0.9; pt.life--;
          drawParticle(ctx, pt);
          return pt.life > 0;
        });

        // ── Игрок ──
        drawPlayer(ctx, p, st.mouse.x);

        // ── Прицел ──
        ctx.strokeStyle = '#00ff8880'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(st.mouse.x - 12, st.mouse.y); ctx.lineTo(st.mouse.x + 12, st.mouse.y);
        ctx.moveTo(st.mouse.x, st.mouse.y - 12); ctx.lineTo(st.mouse.x, st.mouse.y + 12);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(st.mouse.x, st.mouse.y, 8, 0, Math.PI*2); ctx.stroke();

        // ── HP HUD ──
        setHpDisplay(Math.max(0, p.stats.hp));

        // ── Проверка конца уровня ──
        if (st.waveSpawned >= st.totalEnemies && st.enemies.length === 0 && phaseRef.current === 'playing') {
          const opts = pickUpgrades(3);
          setUpgradeOptions(opts);
          setScoreDisplay(st.score);
          setPhaseSync('upgrade');
        }
      } else {
        // Частицы рисуем даже в паузе
        st.particles = st.particles.filter(pt => {
          pt.x += pt.vx; pt.y += pt.vy; pt.life--;
          drawParticle(ctx, pt);
          return pt.life > 0;
        });
      }

      st.frameId = requestAnimationFrame(loop);
    };

    st.frameId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(st.frameId);
      window.removeEventListener('keydown', e => onKey(e, true));
      window.removeEventListener('keyup',   e => onKey(e, false));
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mousedown', onClick);
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: '#060a08' }}>
      {/* Заголовок */}
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
              <div className="hp-bar-inner" style={{ width: `${Math.max(0, (hpDisplay / maxHpDisplay) * 100)}%` }} />
            </div>
            <div className="font-pixel mt-1" style={{ fontSize: 7, color: '#ff6060' }}>{Math.max(0, hpDisplay)} / {maxHpDisplay}</div>
          </div>
          <div className="text-center" style={{ flex: 1 }}>
            <div className="font-pixel glow-yellow" style={{ fontSize: 8 }}>УРОВЕНЬ</div>
            <div className="font-pixel glow-yellow" style={{ fontSize: 20 }}>{levelDisplay}</div>
            <div className="font-pixel" style={{ fontSize: 7, color: '#ffd70060' }}>{LEVELS[levelDisplay - 1]?.name}</div>
          </div>
          <div className="text-center" style={{ flex: 1 }}>
            <div className="font-pixel" style={{ fontSize: 8, color: '#ff4040' }}>УБИТО</div>
            <div className="font-pixel glow-red" style={{ fontSize: 18 }}>{killedDisplay}</div>
          </div>
          <div className="text-right" style={{ flex: 1 }}>
            <div className="font-pixel glow-green" style={{ fontSize: 8 }}>ОЧКИ</div>
            <div className="font-pixel glow-green" style={{ fontSize: 18 }}>{scoreDisplay}</div>
          </div>
        </div>
      )}

      {/* Canvas */}
      <div
        className="relative"
        style={{ width: '100%', maxWidth: W, border: '3px solid #00ff4130' }}
      >
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className={`w-full block ${damageFlash ? 'damage-flash' : ''}`}
          style={{ imageRendering: 'pixelated', display: 'block', background: '#060a08' }}
        />

        {/* МЕНЮ */}
        {phase === 'menu' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: '#060a08ee' }}>
            <div className="text-center px-10 py-8 pixel-border" style={{ background: '#0a0e0a', minWidth: 340 }}>
              <div className="font-pixel glow-green mb-1" style={{ fontSize: 26 }}>PIXEL RANGER</div>
              <div className="font-pixel glow-yellow mb-6" style={{ fontSize: 8 }}>2D ПИКСЕЛЬНЫЙ ШУТЕР</div>
              <div className="font-pixel mb-6" style={{ fontSize: 8, color: '#00ff4190', lineHeight: 3.2 }}>
                🎮 A / D — движение влево-вправо<br/>
                W / SHIFT — прыжок<br/>
                🖱 Мышь — прицел &amp; стрельба<br/>
                ПРОБЕЛ — автоматический огонь
              </div>
              <div className="font-pixel mb-6" style={{ fontSize: 7, color: '#ffd70070', lineHeight: 2.5 }}>
                👾 Красный — обычный<br/>
                🔵 Синий — прыгун<br/>
                🟢 Зелёный — снайпер
              </div>
              <button className="btn-pixel" style={{ fontSize: 11 }} onClick={() => startLevel(0)}>
                ▶ НАЧАТЬ ИГРУ
              </button>
            </div>
          </div>
        )}

        {/* АПГРЕЙДЫ */}
        {phase === 'upgrade' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4" style={{ background: '#060a08f2' }}>
            <div className="font-pixel glow-green mb-1" style={{ fontSize: 14 }}>
              ✓ УРОВЕНЬ {levelDisplay} ПРОЙДЕН!
            </div>
            <div className="font-pixel glow-yellow mb-4" style={{ fontSize: 8 }}>
              ОЧКИ: {scoreDisplay} &nbsp;|&nbsp; ВЫБЕРИ УЛУЧШЕНИЕ
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, width: '100%', maxWidth: 660 }}>
              {upgradeOptions.map(u => (
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
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: '#060a08f2' }}>
            <div className="text-center px-10 py-8 pixel-border" style={{ background: '#0a0e0a', minWidth: 300 }}>
              <div className="font-pixel glow-yellow mb-2" style={{ fontSize: 20 }}>🏆 ПОБЕДА!</div>
              <div className="font-pixel glow-green mb-1" style={{ fontSize: 9 }}>ВСЕ УРОВНИ ПРОЙДЕНЫ</div>
              <div className="font-pixel glow-green mb-6" style={{ fontSize: 24 }}>{scoreDisplay} ОЧКОВ</div>
              <button className="btn-pixel" style={{ fontSize: 10 }} onClick={() => { stateRef.current.score = 0; setScoreDisplay(0); startLevel(0); }}>
                ↺ ИГРАТЬ СНОВА
              </button>
            </div>
          </div>
        )}

        {/* СМЕРТЬ */}
        {phase === 'dead' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: '#060a08f2' }}>
            <div className="text-center px-10 py-8 pixel-border-red" style={{ background: '#0a0e0a', minWidth: 300 }}>
              <div className="font-pixel glow-red mb-1" style={{ fontSize: 20 }}>GAME OVER</div>
              <div className="font-pixel mb-2" style={{ fontSize: 8, color: '#ff6060' }}>ТЫ ПОГИБ</div>
              <div className="font-pixel glow-yellow mb-1" style={{ fontSize: 8 }}>УРОВЕНЬ: {levelDisplay}</div>
              <div className="font-pixel glow-green mb-6" style={{ fontSize: 22 }}>{scoreDisplay} ОЧКОВ</div>
              <button className="btn-pixel" style={{ fontSize: 10 }} onClick={() => { stateRef.current.score = 0; setScoreDisplay(0); startLevel(0); }}>
                ↺ СНОВА
              </button>
            </div>
          </div>
        )}
      </div>

      {phase === 'playing' && (
        <div className="mt-2 font-pixel text-center" style={{ fontSize: 7, color: '#00ff4130' }}>
          A/D — ДВИЖЕНИЕ &nbsp;|&nbsp; W/SHIFT — ПРЫЖОК &nbsp;|&nbsp; МЫШЬ — ПРИЦЕЛ И ОГОНЬ
        </div>
      )}
    </div>
  );
}