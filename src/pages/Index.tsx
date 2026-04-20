import { useEffect, useRef, useState, useCallback } from 'react';

// ============ ТИПЫ ============
interface Enemy { id: number; x: number; y: number; hp: number; maxHp: number; speed: number; size: number; type: 'grunt' | 'tank' | 'speeder'; reward: number }
interface Bullet { id: number; x: number; y: number; vx: number; vy: number; dmg: number }
interface Particle { id: number; x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number }
interface PlayerStats { damage: number; fireRate: number; bulletSpeed: number; maxAmmo: number; baseMaxHp: number }
interface Upgrade { id: string; name: string; desc: string; icon: string; apply: (s: PlayerStats) => PlayerStats; color: string }

// ============ КОНСТАНТЫ ============
const CANVAS_W = 800;
const CANVAS_H = 560;
const BASE_SIZE = 40;
const BASE_X = CANVAS_W / 2;
const BASE_Y = CANVAS_H / 2;

let nextId = 1;
const uid = () => nextId++;

// ============ АПГРЕЙДЫ ============
const ALL_UPGRADES: Upgrade[] = [
  { id: 'dmg1', name: 'УРОН +50%', desc: 'Пули наносят больше урона', icon: '💥', color: '#ff6060',
    apply: s => ({ ...s, damage: Math.round(s.damage * 1.5) }) },
  { id: 'fire1', name: 'СКОРОСТЬ ОГНЯ', desc: 'Стрелять чаще', icon: '🔥', color: '#ffd700',
    apply: s => ({ ...s, fireRate: Math.round(s.fireRate * 0.7) }) },
  { id: 'speed1', name: 'БЫСТРЫЕ ПУЛИ', desc: 'Пули летят быстрее', icon: '⚡', color: '#00bfff',
    apply: s => ({ ...s, bulletSpeed: s.bulletSpeed + 3 }) },
  { id: 'hp1', name: 'РЕМОНТ БАЗЫ', desc: 'База +30 HP', icon: '🛡️', color: '#00ff41',
    apply: s => ({ ...s, baseMaxHp: s.baseMaxHp + 30 }) },
  { id: 'triple', name: 'РАЗБРОС', desc: 'Больше пуль за выстрел', icon: '🎯', color: '#ff8c00',
    apply: s => ({ ...s, maxAmmo: Math.min(s.maxAmmo + 2, 7) }) },
  { id: 'dmg2', name: 'БРОНЕБОЙ', desc: 'Урон x2', icon: '💣', color: '#ff2020',
    apply: s => ({ ...s, damage: s.damage * 2 }) },
  { id: 'fire2', name: 'ШКВАЛЬНЫЙ ОГОНЬ', desc: 'Скорость огня x2', icon: '🔫', color: '#ff6000',
    apply: s => ({ ...s, fireRate: Math.round(s.fireRate * 0.5) }) },
  { id: 'allrnd', name: 'БОЛЬШОЙ АПГРЕЙД', desc: 'Всё улучшается немного', icon: '⭐', color: '#ffd700',
    apply: s => ({ ...s, damage: Math.round(s.damage * 1.2), fireRate: Math.round(s.fireRate * 0.85), bulletSpeed: s.bulletSpeed + 1, baseMaxHp: s.baseMaxHp + 15 }) },
];

function getRandomUpgrades(count = 3): Upgrade[] {
  return [...ALL_UPGRADES].sort(() => Math.random() - 0.5).slice(0, count);
}

function spawnEnemy(wave: number): Enemy {
  const edge = Math.floor(Math.random() * 4);
  let x = 0, y = 0;
  if (edge === 0) { x = Math.random() * CANVAS_W; y = -30; }
  else if (edge === 1) { x = CANVAS_W + 30; y = Math.random() * CANVAS_H; }
  else if (edge === 2) { x = Math.random() * CANVAS_W; y = CANVAS_H + 30; }
  else { x = -30; y = Math.random() * CANVAS_H; }
  const roll = Math.random();
  const isTank = roll < 0.12 + wave * 0.02;
  const isSpeeder = !isTank && roll < 0.28 + wave * 0.03;
  if (isTank) return { id: uid(), x, y, hp: 80 + wave * 20, maxHp: 80 + wave * 20, speed: 0.5 + wave * 0.05, size: 20, type: 'tank', reward: 30 };
  if (isSpeeder) return { id: uid(), x, y, hp: 20 + wave * 5, maxHp: 20 + wave * 5, speed: 2 + wave * 0.15, size: 10, type: 'speeder', reward: 20 };
  return { id: uid(), x, y, hp: 40 + wave * 10, maxHp: 40 + wave * 10, speed: 1 + wave * 0.1, size: 14, type: 'grunt', reward: 10 };
}

// ============ ОТРИСОВКА ============
function drawGrid(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = '#00ff4108';
  ctx.lineWidth = 1;
  for (let x = 0; x < CANVAS_W; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke(); }
  for (let y = 0; y < CANVAS_H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke(); }
}

function drawBase(ctx: CanvasRenderingContext2D, hp: number, maxHp: number) {
  const ratio = hp / maxHp;
  const s = BASE_SIZE;
  ctx.fillStyle = '#000000aa';
  ctx.fillRect(BASE_X - s/2 + 4, BASE_Y - s/2 + 4, s, s);
  ctx.fillStyle = ratio > 0.5 ? '#1a6b2e' : ratio > 0.25 ? '#7a4a00' : '#6b1a1a';
  ctx.fillRect(BASE_X - s/2, BASE_Y - s/2, s, s);
  ctx.fillStyle = ratio > 0.5 ? '#28a845' : ratio > 0.25 ? '#c07a00' : '#a82828';
  ctx.fillRect(BASE_X - s/2, BASE_Y - s/2, s, 4);
  ctx.fillRect(BASE_X - s/2, BASE_Y - s/2, 4, s);
  ctx.fillStyle = '#ffffff22';
  ctx.fillRect(BASE_X - s/2 + 8, BASE_Y - s/2 + 8, 8, 8);
  ctx.fillRect(BASE_X + s/2 - 16, BASE_Y + s/2 - 16, 8, 8);
  ctx.fillStyle = '#00ff41';
  ctx.fillRect(BASE_X - 2, BASE_Y - s/2 - 12, 4, 12);
  ctx.fillRect(BASE_X - 6, BASE_Y - s/2 - 14, 12, 4);
  ctx.shadowColor = ratio > 0.5 ? '#00ff41' : ratio > 0.25 ? '#ffd700' : '#ff2020';
  ctx.shadowBlur = 14;
  ctx.strokeStyle = ratio > 0.5 ? '#00ff41' : ratio > 0.25 ? '#ffd700' : '#ff2020';
  ctx.lineWidth = 2;
  ctx.strokeRect(BASE_X - s/2, BASE_Y - s/2, s, s);
  ctx.shadowBlur = 0;
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy) {
  const s = e.size;
  ctx.shadowBlur = 6;
  if (e.type === 'tank') {
    ctx.shadowColor = '#ff6000';
    ctx.fillStyle = '#cc3300'; ctx.fillRect(e.x - s, e.y - s, s*2, s*2);
    ctx.fillStyle = '#ff6000'; ctx.fillRect(e.x - s, e.y - s, s*2, 4); ctx.fillRect(e.x - s, e.y - s, 4, s*2);
    ctx.fillStyle = '#ff2020'; ctx.fillRect(e.x - 4, e.y - 4, 8, 8);
    ctx.fillStyle = '#442200'; ctx.fillRect(e.x - s - 4, e.y - s, 4, s*2); ctx.fillRect(e.x + s, e.y - s, 4, s*2);
  } else if (e.type === 'speeder') {
    ctx.shadowColor = '#00bfff';
    ctx.fillStyle = '#0066aa'; ctx.fillRect(e.x - s, e.y - s, s*2, s*2);
    ctx.fillStyle = '#00bfff'; ctx.fillRect(e.x - 2, e.y - s, 4, s*2);
    ctx.fillStyle = '#00e5ff'; ctx.fillRect(e.x - s, e.y - 2, s*2, 4);
  } else {
    ctx.shadowColor = '#ff2020';
    ctx.fillStyle = '#880000'; ctx.fillRect(e.x - s, e.y - s, s*2, s*2);
    ctx.fillStyle = '#cc0000'; ctx.fillRect(e.x - s, e.y - s, s*2, 3);
    ctx.fillStyle = '#ff2020'; ctx.fillRect(e.x - 3, e.y - 3, 6, 6);
    ctx.fillStyle = '#ffff00'; ctx.fillRect(e.x - s + 3, e.y - s + 4, 4, 4); ctx.fillRect(e.x + s - 7, e.y - s + 4, 4, 4);
  }
  ctx.shadowBlur = 0;
  if (e.hp < e.maxHp) {
    const bw = s * 2 + 4, bh = 4, bx = e.x - bw/2, by = e.y - s - 10;
    ctx.fillStyle = '#330000'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#ff2020'; ctx.fillRect(bx, by, bw * (e.hp / e.maxHp), bh);
  }
}

function drawBullet(ctx: CanvasRenderingContext2D, b: Bullet) {
  ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 8;
  ctx.fillStyle = '#ffd700'; ctx.fillRect(Math.round(b.x - 3), Math.round(b.y - 3), 6, 6);
  ctx.shadowBlur = 0;
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
  ctx.globalAlpha = p.life / p.maxLife;
  ctx.fillStyle = p.color;
  ctx.fillRect(Math.round(p.x - p.size/2), Math.round(p.y - p.size/2), p.size, p.size);
  ctx.globalAlpha = 1;
}

type GamePhase = 'menu' | 'playing' | 'upgrade' | 'gameover';

export default function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    enemies: [] as Enemy[], bullets: [] as Bullet[], particles: [] as Particle[],
    mouse: { x: BASE_X, y: BASE_Y }, lastShot: 0, frameId: 0,
    spawnTimer: 0, baseHp: 100, baseMaxHp: 100, score: 0, wave: 1,
    enemiesLeft: 0, waveEnemiesTotal: 0,
    stats: { damage: 20, fireRate: 400, bulletSpeed: 8, maxAmmo: 1, baseMaxHp: 100 } as PlayerStats,
    phase: 'menu' as GamePhase,
  });

  const [phase, setPhase] = useState<GamePhase>('menu');
  const [score, setScore] = useState(0);
  const [wave, setWave] = useState(1);
  const [baseHp, setBaseHp] = useState(100);
  const [baseMaxHp, setBaseMaxHp] = useState(100);
  const [upgradeOptions, setUpgradeOptions] = useState<Upgrade[]>([]);
  const [damageFlash, setDamageFlash] = useState(false);
  const [enemiesDisplay, setEnemiesDisplay] = useState(0);

  const spawnParticles = useCallback((x: number, y: number, color: string, count = 8) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3 + 1;
      stateRef.current.particles.push({ id: uid(), x, y, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed, life: 40, maxLife: 40, color, size: Math.floor(Math.random()*5)+2 });
    }
  }, []);

  const startWave = useCallback((waveNum: number, stats: PlayerStats, currentHp: number) => {
    const st = stateRef.current;
    const count = 8 + waveNum * 4;
    st.wave = waveNum; st.enemiesLeft = count; st.waveEnemiesTotal = count;
    st.enemies = []; st.bullets = []; st.spawnTimer = 0;
    st.stats = stats; st.baseHp = currentHp; st.baseMaxHp = stats.baseMaxHp;
    st.phase = 'playing';
    setPhase('playing'); setWave(waveNum); setEnemiesDisplay(count);
    setBaseHp(currentHp); setBaseMaxHp(stats.baseMaxHp);
  }, []);

  const handleUpgrade = useCallback((upg: Upgrade) => {
    const st = stateRef.current;
    const newStats = upg.apply(st.stats);
    let newHp = st.baseHp;
    if (upg.id === 'hp1') newHp = Math.min(st.baseHp + 30, newStats.baseMaxHp);
    startWave(st.wave + 1, newStats, newHp);
  }, [startWave]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      stateRef.current.mouse.x = (e.clientX - rect.left) * (CANVAS_W / rect.width);
      stateRef.current.mouse.y = (e.clientY - rect.top) * (CANVAS_H / rect.height);
    };

    const onMouseDown = () => {
      const st = stateRef.current;
      if (st.phase !== 'playing') return;
      const now = Date.now();
      if (now - st.lastShot < st.stats.fireRate) return;
      st.lastShot = now;
      for (let i = 0; i < st.stats.maxAmmo; i++) {
        const offset = st.stats.maxAmmo > 1 ? (i - (st.stats.maxAmmo-1)/2) * 0.15 : 0;
        const dx = st.mouse.x - BASE_X, dy = st.mouse.y - BASE_Y;
        const angle = Math.atan2(dy, dx) + offset;
        st.bullets.push({ id: uid(), x: BASE_X, y: BASE_Y, vx: Math.cos(angle)*st.stats.bulletSpeed, vy: Math.sin(angle)*st.stats.bulletSpeed, dmg: st.stats.damage });
      }
    };

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);

    let lastTime = 0;
    const loop = (time: number) => {
      const dt = Math.min(time - lastTime, 50);
      lastTime = time;
      const st = stateRef.current;

      ctx.fillStyle = '#0a0e1a';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      drawGrid(ctx);

      if (st.phase === 'playing') {
        // Spawn
        const spawnInterval = Math.max(900 - st.wave * 60, 250);
        st.spawnTimer += dt;
        if (st.spawnTimer >= spawnInterval && st.enemiesLeft > 0) {
          st.spawnTimer = 0;
          const toSpawn = Math.min(1 + Math.floor(st.wave / 3), 3);
          for (let i = 0; i < toSpawn && st.enemiesLeft > 0; i++) { st.enemies.push(spawnEnemy(st.wave)); st.enemiesLeft--; }
        }

        // Bullets
        const survivingBullets: Bullet[] = [];
        for (const b of st.bullets) {
          b.x += b.vx; b.y += b.vy;
          if (b.x < -20 || b.x > CANVAS_W+20 || b.y < -20 || b.y > CANVAS_H+20) continue;
          let hit = false;
          for (const e of st.enemies) {
            if (hit) break;
            const dx = b.x - e.x, dy = b.y - e.y;
            if (Math.sqrt(dx*dx + dy*dy) < e.size + 4) {
              hit = true; e.hp -= b.dmg;
              spawnParticles(e.x, e.y, e.type === 'tank' ? '#ff6000' : e.type === 'speeder' ? '#00bfff' : '#ff3030', 5);
            }
          }
          // Remove dead enemies
          for (const e of st.enemies) {
            if (e.hp <= 0) { st.score += e.reward; spawnParticles(e.x, e.y, '#ffd700', 14); }
          }
          st.enemies = st.enemies.filter(e => e.hp > 0);
          if (!hit) { survivingBullets.push(b); drawBullet(ctx, b); }
        }
        st.bullets = survivingBullets;

        // Enemies
        const survivingEnemies: Enemy[] = [];
        for (const e of st.enemies) {
          const dx = BASE_X - e.x, dy = BASE_Y - e.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < BASE_SIZE/2 + e.size) {
            const dmg = e.type === 'tank' ? 20 : e.type === 'speeder' ? 8 : 15;
            st.baseHp -= dmg;
            spawnParticles(BASE_X, BASE_Y, '#ff2020', 10);
            setDamageFlash(true);
            setTimeout(() => setDamageFlash(false), 300);
            if (st.baseHp <= 0) { st.phase = 'gameover'; setPhase('gameover'); setScore(st.score); }
          } else {
            e.x += (dx/dist) * e.speed; e.y += (dy/dist) * e.speed;
            drawEnemy(ctx, e);
            survivingEnemies.push(e);
          }
        }
        st.enemies = survivingEnemies;

        // Particles
        st.particles = st.particles.filter(p => { p.x+=p.vx; p.y+=p.vy; p.vx*=0.92; p.vy*=0.92; p.life--; drawParticle(ctx,p); return p.life>0; });

        // Base
        drawBase(ctx, Math.max(0, st.baseHp), st.baseMaxHp);

        // Crosshair
        ctx.strokeStyle = '#00ff4180'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(st.mouse.x-12, st.mouse.y); ctx.lineTo(st.mouse.x+12, st.mouse.y);
        ctx.moveTo(st.mouse.x, st.mouse.y-12); ctx.lineTo(st.mouse.x, st.mouse.y+12); ctx.stroke();
        ctx.beginPath(); ctx.arc(st.mouse.x, st.mouse.y, 8, 0, Math.PI*2); ctx.stroke();

        // Update HUD
        setBaseHp(Math.max(0, st.baseHp));
        setEnemiesDisplay(st.enemies.length + st.enemiesLeft);
        setScore(st.score);

        // Wave complete
        if (st.enemies.length === 0 && st.enemiesLeft === 0) {
          st.phase = 'upgrade';
          setPhase('upgrade');
          setUpgradeOptions(getRandomUpgrades(3));
        }
      } else {
        // Still draw particles & base when not playing
        st.particles = st.particles.filter(p => { p.x+=p.vx; p.y+=p.vy; p.vx*=0.92; p.vy*=0.92; p.life--; drawParticle(ctx,p); return p.life>0; });
        drawBase(ctx, Math.max(0, st.baseHp), st.baseMaxHp);
      }

      stateRef.current.frameId = requestAnimationFrame(loop);
    };

    stateRef.current.frameId = requestAnimationFrame(loop);
    return () => {
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      cancelAnimationFrame(stateRef.current.frameId);
    };
  }, [spawnParticles]);

  const handleStart = () => {
    stateRef.current.score = 0;
    const initStats: PlayerStats = { damage: 20, fireRate: 400, bulletSpeed: 8, maxAmmo: 1, baseMaxHp: 100 };
    startWave(1, initStats, 100);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: '#060a14' }}>
      <div className="mb-3 text-center">
        <h1 className="font-pixel glow-green" style={{ fontSize: 20, letterSpacing: 4 }}>PIXEL SIEGE</h1>
        <p className="font-pixel mt-1" style={{ fontSize: 8, color: '#00ff4150' }}>РЕЖИМ ВЫЖИВАНИЯ</p>
      </div>

      {/* HUD */}
      {phase === 'playing' && (
        <div className="flex gap-4 mb-2 w-full items-end px-2" style={{ maxWidth: CANVAS_W }}>
          <div style={{ flex: 2 }}>
            <div className="font-pixel glow-red mb-1" style={{ fontSize: 8 }}>БАЗА</div>
            <div className="hp-bar-outer">
              <div className="hp-bar-inner" style={{ width: `${Math.max(0,(baseHp/baseMaxHp)*100)}%` }} />
            </div>
            <div className="font-pixel mt-1" style={{ fontSize: 8, color: '#ff6060' }}>{Math.max(0,baseHp)} / {baseMaxHp}</div>
          </div>
          <div className="text-center" style={{ flex: 1 }}>
            <div className="font-pixel glow-yellow" style={{ fontSize: 8 }}>ВОЛНА</div>
            <div className="font-pixel glow-yellow" style={{ fontSize: 22 }}>{wave}</div>
          </div>
          <div className="text-center" style={{ flex: 1 }}>
            <div className="font-pixel" style={{ fontSize: 8, color: '#ff4040' }}>ВРАГОВ</div>
            <div className="font-pixel glow-red" style={{ fontSize: 18 }}>{enemiesDisplay}</div>
          </div>
          <div className="text-right" style={{ flex: 1 }}>
            <div className="font-pixel glow-green" style={{ fontSize: 8 }}>ОЧКИ</div>
            <div className="font-pixel glow-green" style={{ fontSize: 18 }}>{score}</div>
          </div>
        </div>
      )}

      {/* Canvas */}
      <div className={`relative ${damageFlash ? 'damage-flash' : ''}`} style={{ width: '100%', maxWidth: CANVAS_W }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="w-full block"
          style={{ imageRendering: 'pixelated', display: 'block', border: '3px solid #00ff4130' }}
        />

        {/* MENU */}
        {phase === 'menu' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: '#060a14ee' }}>
            <div className="text-center px-10 py-8 pixel-border" style={{ background: '#0a0e1a', minWidth: 320 }}>
              <div className="font-pixel glow-green mb-1" style={{ fontSize: 28 }}>PIXEL SIEGE</div>
              <div className="font-pixel glow-yellow mb-8" style={{ fontSize: 9 }}>— ВЫЖИВАНИЕ —</div>
              <div className="font-pixel mb-8" style={{ fontSize: 9, color: '#00ff4190', lineHeight: 3 }}>
                🖱 Клик — огонь в точку прицела<br/>
                ⚡ Не давай врагам добраться до базы<br/>
                🛡 Улучшай оружие между волнами
              </div>
              <div className="flex flex-col gap-3 items-center mb-4">
                <div className="font-pixel" style={{ fontSize: 8, color: '#00bfff90' }}>
                  💀 RUNT — быстрый &nbsp;|&nbsp; 🔴 ТАНК — прочный &nbsp;|&nbsp; ⚡ СПИДЕР — шустрый
                </div>
              </div>
              <button className="btn-pixel" onClick={handleStart} style={{ fontSize: 11 }}>
                ▶ НАЧАТЬ ИГРУ
              </button>
            </div>
          </div>
        )}

        {/* UPGRADE */}
        {phase === 'upgrade' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6" style={{ background: '#060a14f0' }}>
            <div className="font-pixel glow-green mb-1" style={{ fontSize: 18 }}>✓ ВОЛНА {wave} ПРОЙДЕНА!</div>
            <div className="font-pixel glow-yellow mb-5" style={{ fontSize: 9 }}>ОЧКИ: {score} &nbsp;|&nbsp; ВЫБЕРИ УЛУЧШЕНИЕ</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, width: '100%', maxWidth: 660 }}>
              {upgradeOptions.map(upg => (
                <div key={upg.id} className="upgrade-card" onClick={() => handleUpgrade(upg)} style={{ minHeight: 160 }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>{upg.icon}</div>
                  <div className="font-pixel mb-2" style={{ fontSize: 9, color: upg.color, lineHeight: 2 }}>{upg.name}</div>
                  <div className="font-pixel" style={{ fontSize: 7, color: '#00ff4180', lineHeight: 2.2 }}>{upg.desc}</div>
                  <div className="font-pixel mt-4" style={{ fontSize: 7, color: '#00ff4150' }}>[ ВЫБРАТЬ ]</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* GAME OVER */}
        {phase === 'gameover' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: '#060a14f0' }}>
            <div className="text-center px-10 py-8 pixel-border-red" style={{ background: '#0a0e1a', minWidth: 300 }}>
              <div className="font-pixel glow-red mb-1" style={{ fontSize: 22 }}>БАЗА УНИЧТОЖЕНА</div>
              <div className="font-pixel mb-2" style={{ fontSize: 9, color: '#ff6060' }}>GAME OVER</div>
              <div className="font-pixel glow-yellow mb-1" style={{ fontSize: 9 }}>ДОЖИЛ до волны: {wave}</div>
              <div className="font-pixel glow-green mb-8" style={{ fontSize: 24 }}>{score} ОЧКОВ</div>
              <button className="btn-pixel" onClick={handleStart} style={{ fontSize: 10 }}>
                ↺ ИГРАТЬ СНОВА
              </button>
            </div>
          </div>
        )}
      </div>

      {phase === 'playing' && (
        <div className="mt-2 font-pixel text-center" style={{ fontSize: 7, color: '#00ff4130' }}>
          УДЕРЖИВАЙ КЛИК ДЛЯ АВТОМАТИЧЕСКОГО ОГНЯ
        </div>
      )}
    </div>
  );
}
