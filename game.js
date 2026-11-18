(() => {
  'use strict';

  /* ---------- 常量 ---------- */

  const TILE = 24;
  const COLS = 21;
  const ROWS = 21;
  const W = COLS * TILE;
  const H = ROWS * TILE;
  const TANK_SIZE = 22;
  const OFFSET = (TILE - TANK_SIZE) / 2;

  const EMPTY = 0;
  const BRICK = 1;
  const STEEL = 2;
  const WATER = 3;
  const GRASS = 4;
  const BASE = 5;
  const SOLID = new Set([BRICK, STEEL, WATER, BASE]);

  const BASE_TX = 9;
  const BASE_TY = 19;
  const BASE_CX = (BASE_TX + 1) * TILE;
  const BASE_CY = (BASE_TY + 1) * TILE;

  const DIRS = {
    up: { x: 0, y: -1, angle: 0 },
    right: { x: 1, y: 0, angle: Math.PI / 2 },
    down: { x: 0, y: 1, angle: Math.PI },
    left: { x: -1, y: 0, angle: -Math.PI / 2 },
  };

  const PLAYER_SPAWN = { tx: 6, ty: 19 };
  const ENEMY_SPAWNS = [
    { tx: 0, ty: 0 },
    { tx: 10, ty: 0 },
    { tx: 20, ty: 0 },
  ];
  const MAX_ACTIVE = 4;

  const PLAYER_CFG = { speed: 96, bulletSpeed: 310, fireInterval: 0.28 };

  const ENEMY_CFG = {
    basic: { speed: 54, bulletSpeed: 185, fireInterval: 1.15, hp: 1, score: 100, body: '#c3c9d6', trim: '#7c8494' },
    fast: { speed: 92, bulletSpeed: 205, fireInterval: 1.0, hp: 1, score: 200, body: '#e06a3f', trim: '#8c3a1c' },
    heavy: { speed: 42, bulletSpeed: 225, fireInterval: 0.9, hp: 3, score: 400, body: '#8ca05f', trim: '#4e5f33' },
  };

  /* ---------- 关卡 ---------- */

  const LEVELS = [
    {
      name: '绿洲',
      composition: { basic: 20 },
      ops: [
        ['brick', 2, 2, 2, 1],
        ['brick', 2, 3, 1, 3],
        ['steel', 5, 2, 1, 1],
        ['brick', 5, 5, 3, 1],
        ['brick', 3, 7, 1, 4],
        ['brick', 6, 8, 2, 2],
        ['water', 8, 4, 5, 2],
        ['grass', 1, 10, 3, 3],
        ['brick', 9, 12, 1, 1],
        ['brick', 6, 14, 2, 4],
        ['brick', 0, 13, 1, 4],
        ['steel', 2, 16, 1, 1],
      ],
    },
    {
      name: '河谷',
      composition: { basic: 12, fast: 5, heavy: 3 },
      ops: [
        ['steel', 3, 2, 1, 3],
        ['brick', 1, 4, 2, 2],
        ['brick', 6, 3, 2, 1],
        ['water', 8, 6, 5, 3],
        ['brick', 0, 8, 4, 1],
        ['brick', 5, 9, 3, 1],
        ['steel', 10, 11, 1, 2],
        ['brick', 5, 12, 2, 5],
        ['grass', 2, 13, 3, 2],
        ['brick', 0, 16, 2, 1],
        ['steel', 3, 17, 1, 1],
      ],
    },
    {
      name: '迷宫',
      composition: { basic: 8, fast: 6, heavy: 6 },
      ops: [
        ['brick', 3, 2, 1, 6],
        ['brick', 5, 4, 4, 1],
        ['steel', 10, 2, 1, 2],
        ['brick', 7, 7, 2, 2],
        ['water', 9, 9, 3, 2],
        ['brick', 0, 10, 3, 1],
        ['brick', 4, 12, 2, 3],
        ['steel', 9, 13, 3, 1],
        ['grass', 6, 15, 3, 2],
        ['brick', 1, 16, 2, 1],
        ['steel', 10, 16, 1, 1],
      ],
    },
  ];

  /* ---------- DOM ---------- */

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const els = {
    overlay: document.getElementById('overlay'),
    toast: document.getElementById('toast'),
    enemyIcons: document.getElementById('enemy-icons'),
    lifeIcons: document.getElementById('life-icons'),
    level: document.getElementById('level'),
    score: document.getElementById('score'),
    best: document.getElementById('best'),
    muteBtn: document.getElementById('mute-btn'),
  };

  /* ---------- 音效 ---------- */

  const Sound = {
    ctx: null,
    muted: false,
    init() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    tone({ freq = 440, end = freq, dur = 0.1, type = 'square', vol = 0.05, delay = 0 }) {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;
      const t0 = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(end, 1), t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    },
    noise({ dur = 0.2, vol = 0.08, delay = 0, cutoff = 900 }) {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;
      const ac = this.ctx;
      const t0 = ac.currentTime + delay;
      const len = Math.max(1, Math.floor(ac.sampleRate * dur));
      const buffer = ac.createBuffer(1, len, ac.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ac.createBufferSource();
      src.buffer = buffer;
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      const gain = ac.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter).connect(gain).connect(ac.destination);
      src.start(t0);
    },
    shoot() {
      this.tone({ freq: 560, end: 180, dur: 0.08, type: 'square', vol: 0.028 });
    },
    tick() {
      this.tone({ freq: 320, end: 210, dur: 0.045, type: 'square', vol: 0.018 });
    },
    boom() {
      this.noise({ dur: 0.3, vol: 0.1, cutoff: 800 });
      this.tone({ freq: 120, end: 40, dur: 0.28, type: 'sawtooth', vol: 0.04 });
    },
    bigBoom() {
      this.noise({ dur: 0.6, vol: 0.16, cutoff: 650 });
      this.tone({ freq: 90, end: 30, dur: 0.55, type: 'sawtooth', vol: 0.07 });
    },
    levelClear() {
      [523, 659, 784, 1047].forEach((f, i) =>
        this.tone({ freq: f, dur: 0.16, type: 'square', vol: 0.035, delay: i * 0.11 })
      );
    },
    gameOver() {
      [392, 330, 262, 196].forEach((f, i) =>
        this.tone({ freq: f, dur: 0.32, type: 'triangle', vol: 0.05, delay: i * 0.2 })
      );
    },
  };

  /* ---------- 工具函数 ---------- */

  function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function hash(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return Math.abs(Math.floor(x * 1000));
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- 游戏状态 ---------- */

  const game = {
    state: 'title',
    level: 0,
    score: 0,
    best: 0,
    lives: 3,
    time: 0,
    grid: null,
    player: null,
    enemies: [],
    bullets: [],
    particles: [],
    enemyQueue: [],
    totalEnemies: 20,
    spawned: 0,
    killed: 0,
    spawnTimer: 0,
    respawnTimer: 0,
    clearDelay: 0,
    baseAlive: true,
    shake: 0,
  };

  try {
    game.best = Number(localStorage.getItem('tank-battle-best') || 0) || 0;
  } catch (err) {
    game.best = 0;
  }

  const keys = Object.create(null);

  function clearKeys() {
    for (const k in keys) keys[k] = false;
  }

  /* ---------- 地图构建 ---------- */

  function buildGrid(level) {
    const grid = [];
    for (let y = 0; y < ROWS; y++) grid.push(new Array(COLS).fill(EMPTY));

    const set = (v, x, y, w, h) => {
      for (let j = y; j < y + h; j++) {
        for (let i = x; i < x + w; i++) {
          if (i >= 0 && i < COLS && j >= 0 && j < ROWS) grid[j][i] = v;
        }
      }
    };

    const codes = { brick: BRICK, steel: STEEL, water: WATER, grass: GRASS };
    for (const [type, x, y, w, h] of level.ops) {
      const v = codes[type];
      if (v === undefined) continue;
      set(v, x, y, w, h);
      set(v, COLS - x - w, y, w, h);
    }

    set(BRICK, 8, 18, 4, 1);
    set(BRICK, 8, 19, 1, 2);
    set(BRICK, 11, 19, 1, 2);
    set(BASE, BASE_TX, BASE_TY, 2, 2);

    for (const p of ENEMY_SPAWNS) set(EMPTY, p.tx - 1, p.ty, 3, 2);
    set(EMPTY, PLAYER_SPAWN.tx - 1, PLAYER_SPAWN.ty - 1, 3, 3);

    return grid;
  }

  function buildQueue(composition) {
    const queue = [];
    for (const [type, count] of Object.entries(composition)) {
      for (let i = 0; i < count; i++) queue.push(type);
    }
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    return queue;
  }

  /* ---------- 实体 ---------- */

  class Tank {
    constructor(x, y, isPlayer, type) {
      this.x = x;
      this.y = y;
      this.isPlayer = isPlayer;
      this.type = isPlayer ? 'player' : type;
      this.dir = isPlayer ? 'up' : 'down';
      this.alive = true;
      this.cooldown = 0;
      this.think = 0;
      this.fireTimer = 1.2;
      this.tread = 0;
      this.hitFlash = 0;
      this.shield = 0;
      this.spawning = false;
      this.spawnTimer = 0;

      if (isPlayer) {
        this.speed = PLAYER_CFG.speed;
        this.bulletSpeed = PLAYER_CFG.bulletSpeed;
        this.fireInterval = PLAYER_CFG.fireInterval;
        this.hp = 1;
        this.maxHp = 1;
        this.scoreValue = 0;
        this.shield = 2.5;
      } else {
        const cfg = ENEMY_CFG[type];
        this.speed = cfg.speed;
        this.bulletSpeed = cfg.bulletSpeed;
        this.fireInterval = cfg.fireInterval;
        this.hp = cfg.hp;
        this.maxHp = cfg.hp;
        this.scoreValue = cfg.score;
        this.spawning = true;
        this.spawnTimer = 0.9;
      }
    }

    get style() {
      return this.isPlayer ? { body: '#6fce55', trim: '#2f6b22' } : ENEMY_CFG[this.type];
    }
  }

  /* ---------- UI ---------- */

  function updateHUD() {
    els.level.textContent = String(game.level + 1);
    els.score.textContent = String(game.score).padStart(5, '0');

    if (game.score > game.best) {
      game.best = game.score;
      try {
        localStorage.setItem('tank-battle-best', String(game.best));
      } catch (err) {
        /* 忽略隐私模式下的存储失败 */
      }
    }
    els.best.textContent = String(game.best).padStart(5, '0');

    const remaining = Math.max(0, game.totalEnemies - game.killed);
    els.enemyIcons.innerHTML = '<span class="icon"></span>'.repeat(remaining);
    els.lifeIcons.innerHTML = '<span class="icon life"></span>'.repeat(Math.max(0, game.lives));
  }

  function setOverlay(html, onPrimary) {
    els.overlay.innerHTML = html;
    els.overlay.classList.remove('hidden');
    const btn = els.overlay.querySelector('button');
    if (btn && onPrimary) btn.addEventListener('click', onPrimary);
  }

  function hideOverlay() {
    els.overlay.classList.add('hidden');
    els.overlay.innerHTML = '';
  }

  let toastTimer = 0;
  function showToast(text) {
    els.toast.textContent = text;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 1500);
  }

  function showTitle() {
    setOverlay(
      `<div class="panel">
        <h1>坦克大战</h1>
        <p class="sub">Battle City</p>
        <button>开始游戏</button>
        <p class="hint">WASD / 方向键 移动 · 空格 射击<br>P 暂停 · M 静音<br>守住基地，消灭全部敌军</p>
      </div>`,
      newGame
    );
  }

  /* ---------- 游戏流程 ---------- */

  function startLevel(index) {
    const level = LEVELS[index];
    game.level = index;
    game.grid = buildGrid(level);
    game.totalEnemies = Object.values(level.composition).reduce((sum, n) => sum + n, 0);
    game.enemyQueue = buildQueue(level.composition);
    game.spawned = 0;
    game.killed = 0;
    game.clearDelay = 0;
    game.enemies = [];
    game.bullets = [];
    game.particles = [];
    game.player = null;
    game.baseAlive = true;
    game.spawnTimer = 1.2;
    game.respawnTimer = 0;
    game.shake = 0;
    game.state = 'playing';

    clearKeys();
    hideOverlay();
    spawnPlayer();
    updateHUD();
    showToast(`第 ${index + 1} 关 · ${level.name}`);
  }

  function newGame() {
    Sound.init();
    game.score = 0;
    game.lives = 3;
    startLevel(0);
  }

  function spawnPlayer() {
    const x = PLAYER_SPAWN.tx * TILE + OFFSET;
    const y = PLAYER_SPAWN.ty * TILE + OFFSET;
    const blocked = game.enemies.some((e) =>
      aabb(x, y, TANK_SIZE, TANK_SIZE, e.x, e.y, TANK_SIZE, TANK_SIZE)
    );
    if (blocked) {
      game.respawnTimer = 0.5;
      return;
    }
    game.player = new Tank(x, y, true);
  }

  function levelClear() {
    game.state = 'levelclear';
    game.bullets = [];
    game.score += 500;
    updateHUD();
    Sound.levelClear();

    if (game.level >= LEVELS.length - 1) {
      game.state = 'win';
      setOverlay(
        `<div class="panel">
          <h1>胜利</h1>
          <p class="sub">All Clear</p>
          <p class="score-line">最终得分<b>${game.score}</b></p>
          <button>再来一局</button>
        </div>`,
        newGame
      );
      return;
    }

    setOverlay(
      `<div class="panel">
        <h1>第 ${game.level + 1} 关完成</h1>
        <p class="sub">Stage Clear</p>
        <p class="score-line">本关奖励 +500<b>${game.score}</b></p>
        <button>进入下一关</button>
      </div>`,
      () => startLevel(game.level + 1)
    );
  }

  function gameOver(reason) {
    if (game.state === 'gameover' || game.state === 'win') return;
    game.state = 'gameover';
    Sound.gameOver();
    updateHUD();
    setOverlay(
      `<div class="panel">
        <h1 class="danger">游戏结束</h1>
        <p class="sub">${reason}</p>
        <p class="score-line">得分<b>${game.score}</b></p>
        <button>重新开始</button>
      </div>`,
      newGame
    );
  }

  function togglePause() {
    if (game.state === 'playing') {
      game.state = 'paused';
      setOverlay(
        `<div class="panel">
          <h1>暂停</h1>
          <p class="sub">Paused</p>
          <button>继续游戏</button>
          <p class="hint">按 P 或回车继续</p>
        </div>`,
        resumeGame
      );
    } else if (game.state === 'paused') {
      resumeGame();
    }
  }

  function resumeGame() {
    if (game.state !== 'paused') return;
    game.state = 'playing';
    hideOverlay();
    lastTime = performance.now();
  }

  /* ---------- 移动与碰撞 ---------- */

  function nearestAligned(v) {
    const nearest = Math.round((v - OFFSET) / TILE) * TILE + OFFSET;
    return Math.abs(nearest - v) <= 10 ? nearest : null;
  }

  function isBlocked(tank, x, y) {
    if (x < 0 || y < 0 || x + TANK_SIZE > W || y + TANK_SIZE > H) return true;

    const x0 = Math.floor(x / TILE);
    const x1 = Math.floor((x + TANK_SIZE - 1) / TILE);
    const y0 = Math.floor(y / TILE);
    const y1 = Math.floor((y + TANK_SIZE - 1) / TILE);

    for (let ry = y0; ry <= y1; ry++) {
      for (let rx = x0; rx <= x1; rx++) {
        if (SOLID.has(game.grid[ry][rx])) return true;
      }
    }

    const others = tank.isPlayer ? game.enemies : game.enemies.concat(game.player || []);
    for (const o of others) {
      if (o === tank || !o.alive) continue;
      if (aabb(x, y, TANK_SIZE, TANK_SIZE, o.x, o.y, TANK_SIZE, TANK_SIZE)) return true;
    }
    return false;
  }

  function moveTank(tank, dir, dt) {
    const d = DIRS[dir];
    const dist = tank.speed * dt;
    let nx = tank.x + d.x * dist;
    let ny = tank.y + d.y * dist;

    if (d.x !== 0) {
      const aligned = nearestAligned(tank.y);
      if (aligned !== null && !isBlocked(tank, nx, aligned)) ny = aligned;
    } else {
      const aligned = nearestAligned(tank.x);
      if (aligned !== null && !isBlocked(tank, aligned, ny)) nx = aligned;
    }

    if (isBlocked(tank, nx, ny)) return false;
    tank.x = nx;
    tank.y = ny;
    return true;
  }

  /* ---------- 射击 ---------- */

  function allTanks() {
    const arr = [];
    if (game.player) arr.push(game.player);
    for (const e of game.enemies) arr.push(e);
    return arr;
  }

  function fireFrom(tank) {
    if (tank.cooldown > 0 || tank.spawning) return false;
    tank.cooldown = tank.fireInterval;

    const d = DIRS[tank.dir];
    const cx = tank.x + TANK_SIZE / 2;
    const cy = tank.y + TANK_SIZE / 2;
    const half = TANK_SIZE / 2 + 3;

    game.bullets.push({
      x: cx + d.x * half,
      y: cy + d.y * half,
      dir: tank.dir,
      owner: tank,
      player: tank.isPlayer,
      speed: tank.bulletSpeed,
      alive: true,
    });

    Sound.shoot();
    return true;
  }

  function updateBullets(dt) {
    for (const b of game.bullets) {
      if (!b.alive) continue;
      const d = DIRS[b.dir];
      let remaining = b.speed * dt;

      while (remaining > 0 && b.alive) {
        const step = Math.min(remaining, 4);
        remaining -= step;
        b.x += d.x * step;
        b.y += d.y * step;

        if (b.x < 0 || b.x > W || b.y < 0 || b.y > H) {
          b.alive = false;
          break;
        }
        if (hitWall(b) || hitTank(b) || hitBullet(b)) break;
      }
    }
  }

  function hitWall(b) {
    const r = 3;
    const x0 = Math.floor((b.x - r) / TILE);
    const x1 = Math.floor((b.x + r) / TILE);
    const y0 = Math.floor((b.y - r) / TILE);
    const y1 = Math.floor((b.y + r) / TILE);

    for (let ry = y0; ry <= y1; ry++) {
      for (let rx = x0; rx <= x1; rx++) {
        if (rx < 0 || ry < 0 || rx >= COLS || ry >= ROWS) continue;
        const t = game.grid[ry][rx];
        if (t === EMPTY || t === GRASS || t === WATER) continue;

        if (t === BRICK) {
          game.grid[ry][rx] = EMPTY;
          spawnBrickDebris(rx * TILE + TILE / 2, ry * TILE + TILE / 2);
          b.alive = false;
          Sound.tick();
          return true;
        }
        if (t === STEEL) {
          spawnSpark(b.x, b.y, 5);
          b.alive = false;
          Sound.tick();
          return true;
        }
        if (t === BASE) {
          b.alive = false;
          destroyBase();
          return true;
        }
      }
    }
    return false;
  }

  function hitTank(b) {
    for (const t of allTanks()) {
      if (!t.alive || t === b.owner || t.spawning) continue;
      if (t.isPlayer === b.player) continue;
      if (!aabb(b.x - 3, b.y - 3, 6, 6, t.x, t.y, TANK_SIZE, TANK_SIZE)) continue;

      b.alive = false;
      if (t.isPlayer) {
        if (t.shield > 0) {
          spawnSpark(b.x, b.y, 6);
          Sound.tick();
        } else {
          playerHit();
        }
      } else {
        damageEnemy(t);
      }
      return true;
    }
    return false;
  }

  function hitBullet(b) {
    for (const o of game.bullets) {
      if (o === b || !o.alive || o.player === b.player) continue;
      if (aabb(b.x - 3, b.y - 3, 6, 6, o.x - 3, o.y - 3, 6, 6)) {
        b.alive = false;
        o.alive = false;
        spawnSpark(b.x, b.y, 6);
        return true;
      }
    }
    return false;
  }

  function damageEnemy(t) {
    t.hp -= 1;
    const cx = t.x + TANK_SIZE / 2;
    const cy = t.y + TANK_SIZE / 2;

    if (t.hp > 0) {
      t.hitFlash = 0.12;
      spawnSpark(cx, cy, 6);
      Sound.tick();
      return;
    }

    t.alive = false;
    game.killed += 1;
    game.score += t.scoreValue;
    explosion(cx, cy, 1);
    Sound.boom();
    game.shake = Math.max(game.shake, 0.12);
    updateHUD();
  }

  function playerHit() {
    const p = game.player;
    if (!p) return;
    p.alive = false;
    game.player = null;
    game.lives -= 1;
    explosion(p.x + TANK_SIZE / 2, p.y + TANK_SIZE / 2, 1.6);
    Sound.bigBoom();
    game.shake = 0.5;
    updateHUD();

    if (game.lives <= 0) {
      gameOver('战车全部损毁');
    } else {
      game.respawnTimer = 1.5;
    }
  }

  function destroyBase() {
    if (!game.baseAlive) return;
    game.baseAlive = false;
    explosion(BASE_CX, BASE_CY, 2);
    Sound.bigBoom();
    game.shake = 0.7;
    gameOver('基地被摧毁');
  }

  /* ---------- 粒子 ---------- */

  function spawnSpark(x, y, count = 4) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 110;
      const life = 0.15 + Math.random() * 0.2;
      game.particles.push({
        kind: 'spark',
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life,
        max: life,
        size: 1.5 + Math.random() * 2,
        color: Math.random() < 0.5 ? '#ffe9b0' : '#ffb066',
      });
    }
  }

  function spawnBrickDebris(x, y) {
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 30 + Math.random() * 90;
      const life = 0.25 + Math.random() * 0.3;
      game.particles.push({
        kind: 'spark',
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life,
        max: life,
        size: 2 + Math.random() * 3,
        color: ['#b04a2a', '#d66a3a', '#7d2f18'][i % 3],
      });
    }
  }

  function explosion(x, y, scale = 1) {
    const count = Math.floor(16 * scale);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (40 + Math.random() * 160) * scale;
      const life = 0.3 + Math.random() * 0.45;
      game.particles.push({
        kind: 'spark',
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life,
        max: life,
        size: 2 + Math.random() * 3 * scale,
        color: ['#ffd166', '#ff8a3d', '#ff4d2e', '#ffe9b0'][Math.floor(Math.random() * 4)],
      });
    }
    const life = 0.38;
    game.particles.push({ kind: 'ring', x, y, vx: 0, vy: 0, life, max: life });
  }

  function updateParticles(dt) {
    for (const p of game.particles) {
      p.life -= dt;
      if (p.kind !== 'ring') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.96;
        p.vy *= 0.96;
      }
    }
    game.particles = game.particles.filter((p) => p.life > 0);
  }

  /* ---------- 玩家 ---------- */

  function updatePlayer(dt) {
    const p = game.player;
    if (!p) return;

    p.cooldown -= dt;
    p.shield = Math.max(0, p.shield - dt);
    p.hitFlash -= dt;

    let dir = null;
    if (keys['w'] || keys['arrowup']) dir = 'up';
    else if (keys['s'] || keys['arrowdown']) dir = 'down';
    else if (keys['a'] || keys['arrowleft']) dir = 'left';
    else if (keys['d'] || keys['arrowright']) dir = 'right';

    if (dir) {
      p.dir = dir;
      if (moveTank(p, dir, dt)) p.tread += p.speed * dt * 0.6;
    }

    if (keys[' ']) fireFrom(p);
  }

  /* ---------- 敌人 ---------- */

  function chooseEnemyDir(e) {
    const target = game.player && game.player.alive
      ? { x: game.player.x + TANK_SIZE / 2, y: game.player.y + TANK_SIZE / 2 }
      : { x: BASE_CX, y: BASE_CY };

    const ex = e.x + TANK_SIZE / 2;
    const ey = e.y + TANK_SIZE / 2;
    const dx = target.x - ex;
    const dy = target.y - ey;

    if (Math.random() < 0.5) {
      if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
      return dy > 0 ? 'down' : 'up';
    }

    const r = Math.random();
    return r < 0.4 ? 'down' : r < 0.62 ? 'left' : r < 0.84 ? 'right' : 'up';
  }

  function aimedAtTarget(e) {
    const ex = e.x + TANK_SIZE / 2;
    const ey = e.y + TANK_SIZE / 2;
    const targets = [];
    if (game.player && game.player.alive) {
      targets.push({ x: game.player.x + TANK_SIZE / 2, y: game.player.y + TANK_SIZE / 2 });
    }
    if (game.baseAlive) targets.push({ x: BASE_CX, y: BASE_CY - 6 });

    for (const tg of targets) {
      const dx = tg.x - ex;
      const dy = tg.y - ey;
      if (Math.abs(dx) < 12 && Math.abs(dy) > 10) {
        if ((dy > 0 && e.dir === 'down') || (dy < 0 && e.dir === 'up')) return true;
      }
      if (Math.abs(dy) < 12 && Math.abs(dx) > 10) {
        if ((dx > 0 && e.dir === 'right') || (dx < 0 && e.dir === 'left')) return true;
      }
    }
    return false;
  }

  function updateEnemy(e, dt) {
    if (!e.alive) return;

    if (e.spawning) {
      e.spawnTimer -= dt;
      if (e.spawnTimer <= 0) {
        e.spawning = false;
        e.think = 0;
        e.fireTimer = 0.8 + Math.random() * 0.6;
      }
      return;
    }

    e.cooldown -= dt;
    e.hitFlash -= dt;
    e.think -= dt;

    if (e.think <= 0) {
      e.dir = chooseEnemyDir(e);
      e.think = 0.5 + Math.random() * 1.3;
    }

    if (moveTank(e, e.dir, dt)) e.tread += e.speed * dt * 0.6;
    else e.think = 0;

    e.fireTimer -= dt;
    if (e.fireTimer <= 0) {
      if (aimedAtTarget(e) && fireFrom(e)) {
        e.fireTimer = 0.9 + Math.random();
      } else if (Math.random() < 0.35 && fireFrom(e)) {
        e.fireTimer = 1.1 + Math.random() * 1.2;
      } else {
        e.fireTimer = 0.35;
      }
    }
  }

  /* ---------- 生成 ---------- */

  function trySpawnEnemy(type) {
    const points = ENEMY_SPAWNS.slice();
    for (let i = points.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [points[i], points[j]] = [points[j], points[i]];
    }

    for (const p of points) {
      const x = p.tx * TILE + OFFSET;
      const y = p.ty * TILE + OFFSET;
      const blocked =
        game.enemies.some((e) => aabb(x, y, TANK_SIZE, TANK_SIZE, e.x, e.y, TANK_SIZE, TANK_SIZE)) ||
        (game.player && aabb(x, y, TANK_SIZE, TANK_SIZE, game.player.x, game.player.y, TANK_SIZE, TANK_SIZE));
      if (blocked) continue;

      game.enemies.push(new Tank(x, y, false, type));
      return true;
    }
    return false;
  }

  function updateSpawns(dt) {
    if (game.spawned >= game.totalEnemies) return;
    if (game.enemies.length >= MAX_ACTIVE) return;

    game.spawnTimer -= dt;
    if (game.spawnTimer > 0) return;

    const type = game.enemyQueue[game.spawned];
    if (trySpawnEnemy(type)) {
      game.spawned += 1;
      game.spawnTimer = 1.6;
    } else {
      game.spawnTimer = 0.4;
    }
  }

  /* ---------- 主更新 ---------- */

  function update(dt) {
    game.time += dt;
    game.shake = Math.max(0, game.shake - dt * 2.5);

    updateSpawns(dt);
    if (game.player) updatePlayer(dt);
    for (const e of game.enemies) updateEnemy(e, dt);
    updateBullets(dt);
    updateParticles(dt);

    game.enemies = game.enemies.filter((e) => e.alive);
    game.bullets = game.bullets.filter((b) => b.alive);

    if (!game.player) {
      game.respawnTimer -= dt;
      if (game.respawnTimer <= 0) spawnPlayer();
    }

    if (game.state !== 'playing') return;

    if (game.spawned >= game.totalEnemies && game.enemies.length === 0) {
      game.clearDelay += dt;
      if (game.clearDelay > 1.1) levelClear();
    } else {
      game.clearDelay = 0;
    }
  }

  /* ---------- 绘制 ---------- */

  function drawBrick(x, y) {
    ctx.fillStyle = '#43190e';
    ctx.fillRect(x, y, TILE, TILE);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, TILE, TILE);
    ctx.clip();

    for (let row = 0; row < 3; row++) {
      const off = row % 2 ? -6 : 0;
      for (let col = -1; col < 3; col++) {
        const bx = x + off + col * 12;
        const by = y + row * 8;
        ctx.fillStyle = '#b04a2a';
        ctx.fillRect(bx, by, 11, 7);
        ctx.fillStyle = 'rgba(255, 190, 150, 0.22)';
        ctx.fillRect(bx, by, 11, 1);
      }
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
  }

  function drawSteel(x, y) {
    ctx.fillStyle = '#59636f';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#a9b3bf';
    ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
    ctx.fillStyle = '#e4ebf3';
    ctx.fillRect(x + 2, y + 2, TILE - 4, 4);
    ctx.fillStyle = '#7b8693';
    ctx.fillRect(x + 2, y + TILE - 6, TILE - 4, 4);

    ctx.fillStyle = '#65717e';
    for (const [dx, dy] of [[6, 6], [TILE - 6, 6], [6, TILE - 6], [TILE - 6, TILE - 6]]) {
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawWater(x, y, t) {
    ctx.fillStyle = '#0c2654';
    ctx.fillRect(x, y, TILE, TILE);

    ctx.strokeStyle = 'rgba(96, 168, 255, 0.55)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      const yy = y + 7 + i * 9;
      for (let px = 0; px <= TILE; px += 4) {
        const wave = Math.sin((px + x) * 0.35 + t * 2 + i * 1.7) * 1.8;
        if (px === 0) ctx.moveTo(x + px, yy + wave);
        else ctx.lineTo(x + px, yy + wave);
      }
      ctx.stroke();
    }
  }

  function drawGrassTile(x, y, t) {
    ctx.fillStyle = 'rgba(23, 88, 38, 0.92)';
    ctx.fillRect(x, y, TILE, TILE);

    ctx.strokeStyle = 'rgba(96, 190, 90, 0.55)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 6; i++) {
      const h = hash(x + i * 37 + y * 91);
      const bx = x + 3 + (h % 18);
      const by = y + 5 + ((h >> 3) % 15);
      const sway = Math.sin(t * 2 + h) * 1.6;
      ctx.beginPath();
      ctx.moveTo(bx, by + 5);
      ctx.quadraticCurveTo(bx + sway, by + 1, bx + sway * 2, by - 3);
      ctx.stroke();
    }
  }

  function drawTiles(t) {
    for (let ry = 0; ry < ROWS; ry++) {
      for (let rx = 0; rx < COLS; rx++) {
        const v = game.grid[ry][rx];
        const x = rx * TILE;
        const y = ry * TILE;
        if (v === BRICK) drawBrick(x, y);
        else if (v === STEEL) drawSteel(x, y);
        else if (v === WATER) drawWater(x, y, t);
      }
    }
  }

  function drawGrass(t) {
    for (let ry = 0; ry < ROWS; ry++) {
      for (let rx = 0; rx < COLS; rx++) {
        if (game.grid[ry][rx] === GRASS) drawGrassTile(rx * TILE, ry * TILE, t);
      }
    }
  }

  function drawBase() {
    const x = BASE_TX * TILE;
    const y = BASE_TY * TILE;
    const s = TILE * 2;

    if (!game.baseAlive) {
      ctx.fillStyle = '#171a1f';
      ctx.fillRect(x + 3, y + 3, s - 6, s - 6);
      ctx.fillStyle = '#39312d';
      ctx.beginPath();
      ctx.moveTo(x + 8, y + 41);
      ctx.lineTo(x + 18, y + 21);
      ctx.lineTo(x + 28, y + 41);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e0563f';
      ctx.fillRect(x + 12, y + 14, 24, 4);
      return;
    }

    ctx.fillStyle = '#0d1218';
    ctx.fillRect(x + 2, y + 2, s - 4, s - 4);
    ctx.strokeStyle = '#3b4655';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 4, y + 4, s - 8, s - 8);

    const cx = x + s / 2;
    const cy = y + s / 2 + 2;

    ctx.fillStyle = '#e8b83e';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx - 16, cy - 14);
    ctx.lineTo(cx - 12, cy + 2);
    ctx.lineTo(cx - 4, cy + 6);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx + 16, cy - 14);
    ctx.lineTo(cx + 12, cy + 2);
    ctx.lineTo(cx + 4, cy + 6);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, 6, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy - 9, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f5d374';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 5);
    ctx.lineTo(cx + 5, cy - 2);
    ctx.lineTo(cx, cy - 1);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#101318';
    ctx.beginPath();
    ctx.arc(cx + 2, cy - 10, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSpawnStar(cx, cy, t) {
    const pulse = 0.6 + 0.4 * Math.sin(t * 22);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 9);
    ctx.strokeStyle = `rgba(180, 240, 255, ${pulse.toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 === 0 ? 13 : 5;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  function drawTank(tank, t) {
    const cx = tank.x + TANK_SIZE / 2;
    const cy = tank.y + TANK_SIZE / 2;

    if (tank.spawning) {
      drawSpawnStar(cx, cy, t);
      return;
    }

    const style = tank.style;
    const h = TANK_SIZE / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(DIRS[tank.dir].angle);

    ctx.fillStyle = '#232830';
    ctx.fillRect(-h, -h, 5, TANK_SIZE);
    ctx.fillRect(h - 5, -h, 5, TANK_SIZE);

    ctx.fillStyle = '#3d4552';
    for (let i = 0; i < 4; i++) {
      const ty = -h + ((i * 5 + tank.tread) % 21);
      ctx.fillRect(-h, ty, 5, 2);
      ctx.fillRect(h - 5, ty, 5, 2);
    }

    ctx.fillStyle = tank.hitFlash > 0 ? '#ffffff' : style.body;
    roundRect(-h + 4, -h + 3, TANK_SIZE - 8, TANK_SIZE - 6, 3);
    ctx.fill();
    ctx.strokeStyle = style.trim;
    ctx.lineWidth = 1.5;
    roundRect(-h + 4, -h + 3, TANK_SIZE - 8, TANK_SIZE - 6, 3);
    ctx.stroke();

    ctx.fillStyle = style.trim;
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = style.body;
    ctx.beginPath();
    ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e8eef6';
    ctx.fillRect(-1.5, -h - 3, 3, h + 5);
    ctx.fillStyle = style.trim;
    ctx.fillRect(-2, -h - 3, 4, 3);

    ctx.restore();

    if (tank.shield > 0) {
      const alpha = 0.35 + 0.35 * Math.sin(t * 18);
      ctx.strokeStyle = `rgba(120, 220, 255, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(120, 220, 255, ${(alpha * 0.35).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, 19.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawBullets() {
    for (const b of game.bullets) {
      ctx.save();
      ctx.shadowColor = b.player ? 'rgba(255, 225, 130, 0.9)' : 'rgba(255, 120, 90, 0.9)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = b.player ? '#fff2bf' : '#ffb59e';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const p of game.particles) {
      const k = Math.max(0, p.life / p.max);
      if (p.kind === 'ring') {
        ctx.strokeStyle = `rgba(255, 190, 90, ${(k * 0.8).toFixed(3)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8 + (1 - k) * 36, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        ctx.globalAlpha = 1;
      }
    }
  }

  function render(t) {
    ctx.save();
    if (game.shake > 0) {
      const s = game.shake * 6;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }

    ctx.fillStyle = '#05070a';
    ctx.fillRect(-16, -16, W + 32, H + 32);

    drawTiles(t);
    drawBase();

    for (const e of game.enemies) drawTank(e, t);
    if (game.player) drawTank(game.player, t);

    drawBullets();
    drawGrass(t);
    drawParticles();

    ctx.restore();
  }

  /* ---------- 输入 ---------- */

  function toggleMute() {
    Sound.muted = !Sound.muted;
    els.muteBtn.textContent = Sound.muted ? '声音：关' : '声音：开';
  }

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright' || k === ' ') {
      e.preventDefault();
    }
    keys[k] = true;
    Sound.init();

    if (k === 'p') togglePause();
    if (k === 'm') toggleMute();
    if (k === 'enter' && game.state !== 'playing') {
      const btn = els.overlay.querySelector('button');
      if (btn) btn.click();
    }
    if (k === ' ' && (game.state === 'title' || game.state === 'gameover' || game.state === 'win')) {
      const btn = els.overlay.querySelector('button');
      if (btn) btn.click();
    }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  window.addEventListener('blur', clearKeys);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'playing') togglePause();
  });

  els.muteBtn.addEventListener('click', toggleMute);

  document.querySelectorAll('.tbtn').forEach((btn) => {
    const key = btn.dataset.key;
    const press = (ev) => {
      ev.preventDefault();
      keys[key] = true;
      btn.classList.add('active');
      Sound.init();
    };
    const release = (ev) => {
      ev.preventDefault();
      keys[key] = false;
      btn.classList.remove('active');
    };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('contextmenu', (ev) => ev.preventDefault());
  });

  /* ---------- 初始化 ---------- */

  game.grid = buildGrid(LEVELS[0]);
  updateHUD();
  showTitle();

  let lastTime = performance.now();

  function frame(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (game.state === 'playing') update(dt);
    render(now / 1000);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
