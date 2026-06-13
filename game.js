/**
 * Nebula Academy Game Engine
 * Handles gameplay canvas rendering, entities, physics, collision detection, and input.
 * Fully gamified educational suite with dynamic STEM question injects.
 */

class GameEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    
    // Canvas standard dimensions
    this.width = 1000;
    this.height = 700;
    
    // Game state
    this.gameState = 'menu'; // menu, playing, paused, shop, gameover
    this.score = 0;
    this.wave = 1;
    this.shardsCollected = 0;
    this.timeDilation = 1.0;
    
    // Educational State
    this.simTopic = 'math_mult'; // math_mult, math_eq, cs_binary, cs_boolean
    this.activeQuest = null;
    this.speedModifier = 1.0; // Accessibility Reaction Time (0.5 to 1.0)
    this.reducedMotion = false; // Photosensitivity protects (no shake, no flashes)
    
    // Ship customization parameters
    this.activeCustomFlame = 'pink'; // pink, green, gold
    this.activeCustomShield = 'cyan'; // cyan, hex
    
    // Combat Statistics Logs
    this.combatAccuracy = 100;
    this.solvedCount = 0;
    this.wrongCount = 0;
    this.totalQuestTime = 0;
    this.solvedQuestsCount = 0;
    this.questStartTime = 0;

    // Upgrades
    this.upgrades = {
      weapon: 1,
      shield: 1,
      regen: 1,
      engine: 1,
      magnet: 1
    };

    this.shipType = 'interceptor';
    
    // Entities
    this.player = null;
    this.lasers = [];
    this.enemies = [];
    this.particles = [];
    this.shards = [];
    this.powerups = [];
    
    // Stars background
    this.stars = [];
    this.initStars();
    
    // Controls
    this.keys = {};
    this.mouse = { x: this.width / 2, y: this.height - 100, isDown: false };
    this.controlMode = 'keyboard';
    
    // Timers
    this.waveTimer = 0;
    this.enemySpawnTimer = 0;
    this.bossActive = false;
    
    // Screen shake
    this.shakeIntensity = 0;
    this.shakeDecay = 0.95;

    this.setupInput();
  }

  // --- INITIALIZATION ---

  initStars() {
    this.stars = [];
    for (let i = 0; i < 60; i++) {
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        size: Math.random() * 1.5 + 0.5,
        speed: Math.random() * 0.5 + 0.1,
        color: '#7b2cbf'
      });
    }
    for (let i = 0; i < 40; i++) {
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        size: Math.random() * 2 + 1,
        speed: Math.random() * 1 + 0.5,
        color: '#00f3ff'
      });
    }
    for (let i = 0; i < 15; i++) {
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        size: Math.random() * 2.5 + 1.5,
        speed: Math.random() * 2 + 1.5,
        color: '#ff007f'
      });
    }
  }

  setupInput() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      this.controlMode = 'keyboard';
      if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'Space') && this.gameState === 'playing') {
        this.triggerPlayerAbility();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    const getCanvasMousePos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.width / rect.width;
      const scaleY = this.height / rect.height;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    };

    const handleStart = (e) => {
      if (this.gameState !== 'playing') return;
      this.controlMode = 'mouse';
      const pos = getCanvasMousePos(e);
      this.mouse.x = pos.x;
      this.mouse.y = pos.y;
      this.mouse.isDown = true;
    };

    const handleMove = (e) => {
      if (this.gameState !== 'playing') return;
      this.controlMode = 'mouse';
      const pos = getCanvasMousePos(e);
      this.mouse.x = pos.x;
      this.mouse.y = pos.y;
    };

    const handleEnd = () => {
      this.mouse.isDown = false;
    };

    this.canvas.addEventListener('mousedown', handleStart);
    this.canvas.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);

    this.canvas.addEventListener('touchstart', (e) => {
      handleStart(e);
      e.preventDefault();
    }, { passive: false });
    
    this.canvas.addEventListener('touchmove', (e) => {
      handleMove(e);
      e.preventDefault();
    }, { passive: false });
    
    window.addEventListener('touchend', handleEnd);
  }

  triggerShake(intensity) {
    if (this.reducedMotion) return; // Accessibility toggle blocks screenshake
    this.shakeIntensity = intensity;
  }

  // --- QUEST GENERATOR ENGINE (STEM Injector) ---

  generateNewQuest() {
    const topic = this.simTopic || 'math_mult';
    let question = "";
    let correctAnswer = "";
    let choices = [];

    if (topic === 'math_mult') {
      // Multiplication table 3-11
      const a = Math.floor(Math.random() * 9) + 3;
      const b = Math.floor(Math.random() * 10) + 2;
      question = `${a} x ${b} = ?`;
      correctAnswer = (a * b).toString();
      
      while (choices.length < 3) {
        const delta = (Math.floor(Math.random() * 9) - 4) * (Math.random() > 0.5 ? a : b);
        const wrong = a * b + (delta === 0 ? 5 : delta);
        const wrongStr = Math.abs(wrong).toString();
        if (wrongStr !== correctAnswer && !choices.includes(wrongStr)) {
          choices.push(wrongStr);
        }
      }
    } 
    else if (topic === 'math_eq') {
      // ax +/- b = c
      const x = Math.floor(Math.random() * 8) + 2; // Solution 2 to 9
      const a = Math.floor(Math.random() * 4) + 2; // 2 to 5
      const b = Math.floor(Math.random() * 10) + 1; // 1 to 10
      const plus = Math.random() > 0.5;
      
      let c = 0;
      if (plus) {
        c = a * x + b;
        question = `${a}x + ${b} = ${c}`;
      } else {
        c = a * x - b;
        question = `${a}x - ${b} = ${c}`;
      }
      correctAnswer = x.toString();

      while (choices.length < 3) {
        const wrong = (x + Math.floor(Math.random() * 5) - 2).toString();
        if (wrong !== correctAnswer && parseInt(wrong) > 0 && !choices.includes(wrong)) {
          choices.push(wrong);
        }
      }
    } 
    else if (topic === 'cs_binary') {
      // 4-bit binary values
      const val = Math.floor(Math.random() * 15) + 1;
      const bin = val.toString(2).padStart(4, '0');
      question = `BIN ${bin} = DEC ?`;
      correctAnswer = val.toString();

      while (choices.length < 3) {
        const wrong = (val + Math.floor(Math.random() * 6) - 3).toString();
        if (wrong !== correctAnswer && parseInt(wrong) >= 0 && !choices.includes(wrong)) {
          choices.push(wrong);
        }
      }
    } 
    else {
      // Boolean logic
      const A = Math.random() > 0.5;
      const B = Math.random() > 0.5;
      const gates = ['AND', 'OR', 'XOR'];
      const gate = gates[Math.floor(Math.random() * gates.length)];
      
      question = `${A ? 'T' : 'F'} ${gate} ${B ? 'T' : 'F'} = ?`;
      
      let res = false;
      if (gate === 'AND') res = A && B;
      else if (gate === 'OR') res = A || B;
      else res = A !== B;

      correctAnswer = res ? 'T' : 'F';
      choices = [res ? 'F' : 'T'];
    }

    this.activeQuest = {
      question: question,
      correctAnswer: correctAnswer,
      choices: choices
    };

    this.questStartTime = Date.now();

    // Render Quest text in HUD
    const qLabel = document.getElementById('sim-quest-text');
    if (qLabel) {
      qLabel.innerText = `РЕШИТЕ: ${question}`;
    }
  }

  // --- CORE GAME ACTIONS ---

  start(shipType, upgrades, simTopic, speedModifier = 1.0, reducedMotion = false) {
    this.shipType = shipType;
    this.upgrades = upgrades;
    this.simTopic = simTopic;
    
    // Accessibility options
    this.speedModifier = speedModifier;
    this.reducedMotion = reducedMotion;

    this.score = 0;
    this.wave = 1;
    this.shardsCollected = 0;
    this.timeDilation = 1.0;
    
    // Reset metrics
    this.solvedCount = 0;
    this.wrongCount = 0;
    this.totalQuestTime = 0;
    this.solvedQuestsCount = 0;
    this.combatAccuracy = 100;

    this.lasers = [];
    this.enemies = [];
    this.particles = [];
    this.shards = [];
    this.powerups = [];
    
    this.bossActive = false;
    this.waveTimer = 0;
    this.enemySpawnTimer = 0;
    
    this.spawnPlayer();
    this.generateNewQuest();
    
    this.gameState = 'playing';
    this.triggerShake(5);
    
    // Unhide HUD and Canvas Container
    const hud = document.getElementById('hud');
    const canvasContainer = document.getElementById('game-canvas-container');
    if (hud) hud.classList.remove('hidden');
    if (canvasContainer) canvasContainer.classList.remove('hidden');

    this.lastTime = performance.now();
    if (!this.loopRunning) {
      this.loopRunning = true;
      const tick = (timestamp) => {
        if (!this.loopRunning) return;
        
        const dt = timestamp - this.lastTime;
        this.lastTime = timestamp;
        
        // Cap dt to prevent massive jumps if tab was blurred/backgrounded
        const cappedDt = Math.min(dt, 100);
        
        this.update(cappedDt);
        this.draw();
        
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    
    gameAudio.startMusic();
    gameAudio.setUrgency(false);
  }

  spawnPlayer() {
    let maxShield = 100;
    let baseSpeed = 6.0;
    let color = '#00f3ff';
    let baseHull = 100;

    if (this.shipType === 'dreadnought') {
      maxShield = 150;
      baseSpeed = 4.2;
      color = '#ff007f';
      baseHull = 120;
    } else if (this.shipType === 'phantom') {
      maxShield = 80;
      baseSpeed = 7.0;
      color = '#39ff14';
      baseHull = 80;
    }

    const finalMaxShield = maxShield * (1 + (this.upgrades.shield - 1) * 0.2);
    const finalSpeed = baseSpeed * (1 + (this.upgrades.engine - 1) * 0.1);
    const regenRate = 0.5 + (this.upgrades.regen - 1) * 0.5;

    this.player = {
      x: this.width / 2,
      y: this.height - 120,
      width: 48,
      height: 48,
      vx: 0,
      vy: 0,
      speed: finalSpeed,
      shield: finalMaxShield,
      maxShield: finalMaxShield,
      hull: baseHull,
      maxHull: baseHull,
      color: color,
      shootCooldown: 0,
      shootSpeed: 180,
      abilityCooldown: 0,
      abilityMaxCooldown: 12000,
      abilityActiveDuration: 0,
      abilityActive: false,
      regenTimer: 0,
      regenRate: regenRate,
      damageTint: 0
    };
  }

  spawnEnemy() {
    if (this.bossActive) return;
    if (!this.activeQuest) return;

    const waveMult = 1 + (this.wave - 1) * 0.15;
    
    // Choose enemy class
    const rand = Math.random();
    let type = 'scout';
    let health = 15 * waveMult;
    let width = 42;
    let height = 42;
    let speed = (Math.random() * 1.0 + 1.2) * this.speedModifier; // Decelerate enemy down rate using Reaction Assist
    let color = '#bfbdd3';
    let shootCooldown = Math.random() * 3000 + 2000;

    if (rand > 0.85) {
      type = 'cruiser';
      health = 40 * waveMult;
      width = 58;
      height = 58;
      speed = (Math.random() * 0.4 + 0.8) * this.speedModifier;
      color = '#e0aaff';
    } else if (rand > 0.65) {
      type = 'kamikaze';
      health = 10 * waveMult;
      width = 32;
      height = 32;
      speed = (Math.random() * 1.5 + 2.5) * this.speedModifier;
      color = '#ff9100';
      shootCooldown = 99999; // kamikazes do not shoot
    }

    // Determine target answer choice
    let answerText = "";
    
    // Check if there is already a "correct answer" enemy present on the board
    const correctOnScreen = this.enemies.some(en => en.isCorrectAnswer);
    
    if (!correctOnScreen && (Math.random() > 0.4 || this.enemies.length === 0)) {
      answerText = this.activeQuest.correctAnswer;
    } else {
      // Pick random dummy incorrect choice
      const wrongChoices = this.activeQuest.choices;
      answerText = wrongChoices[Math.floor(Math.random() * wrongChoices.length)] || "0";
    }

    const isCorrectAnswer = (answerText === this.activeQuest.correctAnswer);

    this.enemies.push({
      x: Math.random() * (this.width - width - 120) + 60 + width / 2,
      y: -height,
      vx: type === 'striker' ? (Math.random() > 0.5 ? speed : -speed) : 0,
      vy: speed,
      width: width,
      height: height,
      type: type,
      health: health,
      maxHealth: health,
      color: isCorrectAnswer ? '#00f3ff' : color,
      shootCooldown: shootCooldown,
      bulletSpeed: 4.5 * this.speedModifier,
      scoreValue: Math.floor(100 * waveMult),
      pulseTime: Math.random() * 100,
      
      // STEM attributes
      answerText: answerText,
      isCorrectAnswer: isCorrectAnswer
    });
  }

  spawnBoss() {
    this.bossActive = true;
    gameAudio.playBossAlarmSound();
    gameAudio.setUrgency(true);
    
    const waveMult = 1 + (this.wave - 1) * 0.2;
    const bossHealth = 500 * waveMult;

    const alarm = document.getElementById('boss-alarm');
    alarm.classList.remove('hidden');
    setTimeout(() => {
      alarm.classList.add('hidden');
    }, 3000);

    this.enemies.push({
      x: this.width / 2,
      y: -100,
      vx: 1.5 * this.speedModifier,
      vy: 1.0 * this.speedModifier,
      width: 120,
      height: 90,
      type: 'boss',
      health: bossHealth,
      maxHealth: bossHealth,
      color: '#ff007f',
      shootCooldown: 1500,
      attackPhase: 0,
      phaseTimer: 0,
      scoreValue: 5000,
      isBoss: true,
      
      // Boss always carries correct answer as weakpoint
      answerText: "WEAK",
      isCorrectAnswer: true
    });
  }

  spawnPowerup(x, y) {
    if (Math.random() > 0.15) return;
    const types = ['heal', 'overdrive', 'shield_overload', 'slowmo'];
    const type = types[Math.floor(Math.random() * types.length)];
    let color = '#39ff14';
    if (type === 'overdrive') color = '#ff007f';
    if (type === 'shield_overload') color = '#00f3ff';
    if (type === 'slowmo') color = '#9900ff';

    this.powerups.push({
      x: x,
      y: y,
      vy: 2.0,
      width: 24,
      height: 24,
      type: type,
      color: color,
      pulse: 0
    });
  }

  spawnParticles(x, y, color, count = 8, velocityScale = 1.0) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (Math.random() * 4 + 1.5) * velocityScale;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 4 + 1.5,
        alpha: 1.0,
        decay: Math.random() * 0.02 + 0.015,
        color: color
      });
    }
  }

  spawnShards(x, y, count = 3) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3 + 1;
      this.shards.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        width: 10,
        height: 10,
        color: '#ff007f'
      });
    }
  }

  triggerPlayerAbility() {
    const p = this.player;
    if (p.abilityCooldown > 0 || p.abilityActive) return;

    p.abilityActive = true;
    p.abilityCooldown = p.abilityMaxCooldown;
    
    gameAudio.playPowerupSound();

    if (this.shipType === 'interceptor') {
      p.abilityActiveDuration = 5000;
      this.spawnParticles(p.x, p.y, '#00f3ff', 25, 1.5);
    } 
    else if (this.shipType === 'dreadnought') {
      p.abilityActiveDuration = 100;
      const steps = 18;
      for (let i = 0; i < steps; i++) {
        const angle = (i * Math.PI * 2) / steps;
        this.lasers.push({
          x: p.x,
          y: p.y,
          vx: Math.cos(angle) * 10,
          vy: Math.sin(angle) * 10,
          isPlayer: true,
          damage: 30,
          color: '#ff007f',
          width: 8,
          height: 18,
          angle: angle + Math.PI/2
        });
      }
      this.triggerShake(12);
      p.abilityActive = false;
      gameAudio.playExplosionSound(1.5);
    } 
    else if (this.shipType === 'phantom') {
      p.abilityActiveDuration = 6000;
      this.timeDilation = 0.3;
      this.spawnParticles(p.x, p.y, '#39ff14', 25, 1.2);
    }
  }

  // --- CORE GAME LOOP UPDATES ---

  update(dt) {
    if (this.gameState !== 'playing') return;

    if (this.shakeIntensity > 0.1) {
      this.shakeIntensity *= this.shakeDecay;
    } else {
      this.shakeIntensity = 0;
    }

    // Stars scrolling
    this.stars.forEach(star => {
      star.y += star.speed;
      if (star.y > this.height) {
        star.y = 0;
        star.x = Math.random() * this.width;
      }
    });

    this.updatePlayer(dt);
    this.updateLasers(dt);
    this.updateEnemies(dt);
    this.updatePowerups(dt);
    this.updateShards(dt);
    this.updateParticles(dt);
    this.checkCollisions();
  }

  updatePlayer(dt) {
    const p = this.player;
    if (!p) return;

    if (p.abilityCooldown > 0) {
      p.abilityCooldown -= dt;
      if (p.abilityCooldown < 0) p.abilityCooldown = 0;
    }

    if (p.abilityActive) {
      p.abilityActiveDuration -= dt;
      if (p.abilityActiveDuration <= 0) {
        p.abilityActive = false;
        if (this.shipType === 'phantom') {
          this.timeDilation = 1.0;
        }
      }
    }

    if (p.shield < p.maxShield) {
      p.regenTimer += dt;
      if (p.regenTimer >= 1000) {
        p.shield = Math.min(p.maxShield, p.shield + p.regenRate);
        p.regenTimer = 0;
      }
    }

    if (p.shootCooldown > 0) {
      p.shootCooldown -= dt;
    }

    if (p.damageTint > 0) p.damageTint--;

    if (this.controlMode === 'keyboard') {
      let dx = 0;
      let dy = 0;
      if (this.keys['KeyA'] || this.keys['ArrowLeft']) dx = -1;
      if (this.keys['KeyD'] || this.keys['ArrowRight']) dx = 1;
      if (this.keys['KeyW'] || this.keys['ArrowUp']) dy = -1;
      if (this.keys['KeyS'] || this.keys['ArrowDown']) dy = 1;

      if (dx !== 0 && dy !== 0) {
        dx *= 0.7071;
        dy *= 0.7071;
      }

      p.vx = dx * p.speed;
      p.vy = dy * p.speed;
      p.x += p.vx;
      p.y += p.vy;
    } else {
      const dx = this.mouse.x - p.x;
      const dy = this.mouse.y - p.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 5) {
        p.x += dx * 0.15;
        p.y += dy * 0.15;
      }
    }

    p.x = Math.max(p.width / 2, Math.min(this.width - p.width / 2, p.x));
    p.y = Math.max(p.height / 2, Math.min(this.height - p.height / 2, p.y));

    const wantsToShoot = this.keys['KeyF'] || this.keys['Space'] || this.mouse.isDown || this.controlMode === 'mouse';
    if (wantsToShoot && p.shootCooldown <= 0) {
      this.firePlayerWeapon();
    }
  }

  firePlayerWeapon() {
    const p = this.player;
    let cooldown = p.shootSpeed;
    if (this.shipType === 'interceptor' && p.abilityActive) {
      cooldown /= 3.0;
    }
    p.shootCooldown = cooldown;

    const lvl = this.upgrades.weapon;
    const baseDamage = 10;
    
    gameAudio.playLaserSound(1.0 + (lvl * 0.05));

    if (lvl === 1) {
      this.lasers.push(this.createLaser(p.x, p.y - 20, 0, -12, true, baseDamage, p.color));
    } 
    else if (lvl === 2) {
      this.lasers.push(this.createLaser(p.x - 12, p.y - 15, 0, -12, true, baseDamage, p.color));
      this.lasers.push(this.createLaser(p.x + 12, p.y - 15, 0, -12, true, baseDamage, p.color));
    } 
    else if (lvl === 3) {
      this.lasers.push(this.createLaser(p.x, p.y - 20, 0, -12, true, baseDamage, p.color));
      this.lasers.push(this.createLaser(p.x - 14, p.y - 12, -2, -11.5, true, baseDamage, p.color, -Math.PI / 16));
      this.lasers.push(this.createLaser(p.x + 14, p.y - 12, 2, -11.5, true, baseDamage, p.color, Math.PI / 16));
    } 
    else if (lvl === 4) {
      this.lasers.push(this.createLaser(p.x - 8, p.y - 20, -1, -12, true, baseDamage * 0.9, p.color, -Math.PI / 24));
      this.lasers.push(this.createLaser(p.x + 8, p.y - 20, 1, -12, true, baseDamage * 0.9, p.color, Math.PI / 24));
      this.lasers.push(this.createLaser(p.x - 20, p.y - 10, -3.5, -11, true, baseDamage * 0.8, p.color, -Math.PI / 10));
      this.lasers.push(this.createLaser(p.x + 20, p.y - 10, 3.5, -11, true, baseDamage * 0.8, p.color, Math.PI / 10));
    } 
    else {
      this.lasers.push(this.createLaser(p.x - 10, p.y - 20, 0, -14, true, baseDamage, p.color));
      this.lasers.push(this.createLaser(p.x + 10, p.y - 20, 0, -14, true, baseDamage, p.color));
      this.lasers.push(this.createLaser(p.x - 24, p.y - 10, -4, -12, true, baseDamage, p.color, -Math.PI / 10));
      this.lasers.push(this.createLaser(p.x + 24, p.y - 10, 4, -12, true, baseDamage, p.color, Math.PI / 10));
      this.spawnParticles(p.x - 10, p.y - 22, p.color, 1, 0.4);
      this.spawnParticles(p.x + 10, p.y - 22, p.color, 1, 0.4);
    }
  }

  createLaser(x, y, vx, vy, isPlayer, damage, color, angle = 0) {
    return {
      x: x,
      y: y,
      vx: vx,
      vy: vy,
      isPlayer: isPlayer,
      damage: damage,
      color: color,
      width: 4,
      height: 14,
      angle: angle
    };
  }

  updateLasers(dt) {
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const l = this.lasers[i];
      const speedScale = l.isPlayer ? 1.0 : this.timeDilation;
      l.x += l.vx * speedScale;
      l.y += l.vy * speedScale;

      if (l.y < -30 || l.y > this.height + 30 || l.x < -30 || l.x > this.width + 30) {
        this.lasers.splice(i, 1);
      }
    }
  }

  updateEnemies(dt) {
    this.waveTimer += dt;
    this.enemySpawnTimer += dt;

    const isBossWave = this.wave % 5 === 0;

    if (!this.bossActive) {
      // Scale spawn rates dynamically
      let spawnRate = Math.max(1000, 2500 - (this.wave * 150));
      
      if (isBossWave) {
        if (this.enemies.length === 0 && this.waveTimer > 3000) {
          this.spawnBoss();
        }
      } else {
        if (this.enemySpawnTimer >= spawnRate) {
          this.spawnEnemy();
          this.enemySpawnTimer = 0;
        }
        
        if (this.waveTimer >= 35000) {
          this.wave++;
          this.waveTimer = 0;
          this.enemySpawnTimer = 0;
          gameAudio.playPowerupSound();
        }
      }
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.x += e.vx * this.timeDilation;
      e.y += e.vy * this.timeDilation;

      if (e.shootCooldown > 0) {
        e.shootCooldown -= dt * this.timeDilation;
      }

      if (e.type === 'boss') {
        this.updateBossBehavior(e, dt);
      } else {
        // Normal enemy shooting
        if (e.shootCooldown <= 0 && e.type === 'cruiser') {
          e.shootCooldown = Math.random() * 3000 + 2000;
          gameAudio.playEnemyLaserSound();
          this.lasers.push(this.createLaser(e.x, e.y + 20, 0, e.bulletSpeed, false, 15, '#ff0055'));
          this.lasers.push(this.createLaser(e.x - 10, e.y + 15, -1.2, e.bulletSpeed - 0.5, false, 15, '#ff0055', -0.15));
          this.lasers.push(this.createLaser(e.x + 10, e.y + 15, 1.2, e.bulletSpeed - 0.5, false, 15, '#ff0055', 0.15));
        } 
        else if (e.shootCooldown <= 0 && e.type === 'scout') {
          e.shootCooldown = Math.random() * 2500 + 1500;
          gameAudio.playEnemyLaserSound();
          this.lasers.push(this.createLaser(e.x, e.y + 20, 0, e.bulletSpeed, false, 10, '#ff9e00'));
        }

        // Cleanup offscreen targets
        if (e.y > this.height + e.height) {
          // If the player let the CORRECT target pass without shooting it, regenerate quest!
          if (e.isCorrectAnswer && e.type !== 'boss') {
            this.generateNewQuest();
          }
          this.enemies.splice(i, 1);
        }
      }
    }
  }

  updateBossBehavior(boss, dt) {
    if (boss.y < 120) {
      boss.y += boss.vy * this.timeDilation;
      return;
    }

    if (boss.x < 100 || boss.x > this.width - 100) {
      boss.vx *= -1;
    }
    boss.x += boss.vx * this.timeDilation;
    boss.phaseTimer += dt * this.timeDilation;

    if (boss.phaseTimer >= 6500) {
      boss.attackPhase = (boss.attackPhase + 1) % 3;
      boss.phaseTimer = 0;
    }

    if (boss.shootCooldown > 0) return;

    if (boss.attackPhase === 0) {
      const count = 12;
      for (let i = 0; i < count; i++) {
        const angle = (i * Math.PI * 2) / count + (boss.phaseTimer / 1000);
        this.lasers.push({
          x: boss.x,
          y: boss.y + 20,
          vx: Math.cos(angle) * 4.0,
          vy: Math.sin(angle) * 4.0,
          isPlayer: false,
          damage: 12,
          color: '#ff0055',
          width: 5,
          height: 14,
          angle: angle + Math.PI/2
        });
      }
      gameAudio.playEnemyLaserSound();
      boss.shootCooldown = 1800;
    } 
    else if (boss.attackPhase === 1) {
      if (this.player) {
        const angle = Math.atan2(this.player.y - boss.y, this.player.x - boss.x);
        this.lasers.push({
          x: boss.x - 30,
          y: boss.y + 20,
          vx: Math.cos(angle - 0.1) * 6.5,
          vy: Math.sin(angle - 0.1) * 6.5,
          isPlayer: false,
          damage: 15,
          color: '#9900ff',
          width: 6,
          height: 16,
          angle: angle + Math.PI/2
        });
        this.lasers.push({
          x: boss.x + 30,
          y: boss.y + 20,
          vx: Math.cos(angle + 0.1) * 6.5,
          vy: Math.sin(angle + 0.1) * 6.5,
          isPlayer: false,
          damage: 15,
          color: '#9900ff',
          width: 6,
          height: 16,
          angle: angle + Math.PI/2
        });
        gameAudio.playEnemyLaserSound();
      }
      boss.shootCooldown = 450;
    } 
    else {
      // Interceptor launch drones
      if (this.enemies.length < 5) {
        this.enemies.push({
          x: boss.x - 40,
          y: boss.y + 20,
          vx: -2.0 * this.speedModifier,
          vy: 1.8 * this.speedModifier,
          width: 28,
          height: 28,
          type: 'kamikaze',
          health: 12,
          maxHealth: 12,
          color: '#ff9100',
          shootCooldown: 99999,
          scoreValue: 50,
          answerText: "DRONE",
          isCorrectAnswer: false
        });
        this.enemies.push({
          x: boss.x + 40,
          y: boss.y + 20,
          vx: 2.0 * this.speedModifier,
          vy: 1.8 * this.speedModifier,
          width: 28,
          height: 28,
          type: 'kamikaze',
          health: 12,
          maxHealth: 12,
          color: '#ff9100',
          shootCooldown: 99999,
          scoreValue: 50,
          answerText: "DRONE",
          isCorrectAnswer: false
        });
        gameAudio.playPowerupSound();
      }
      boss.shootCooldown = 3200;
    }
  }

  updatePowerups(dt) {
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const pu = this.powerups[i];
      pu.y += pu.vy * this.timeDilation;
      pu.pulse += 0.08;
      if (pu.y > this.height + 40) {
        this.powerups.splice(i, 1);
      }
    }
  }

  updateShards(dt) {
    const p = this.player;
    if (!p) return;

    const magnetRadius = 80 + (this.upgrades.magnet - 1) * 45;

    for (let i = this.shards.length - 1; i >= 0; i--) {
      const sh = this.shards[i];
      const dx = p.x - sh.x;
      const dy = p.y - sh.y;
      const dist = Math.hypot(dx, dy);

      if (dist < magnetRadius) {
        const pullSpeed = Math.min(15, (magnetRadius - dist) * 0.15 + 2);
        sh.vx = (dx / dist) * pullSpeed;
        sh.vy = (dy / dist) * pullSpeed;
      } else {
        sh.vx *= 0.95;
        sh.vy = Math.min(2.5, sh.vy + 0.08);
      }

      sh.x += sh.vx * this.timeDilation;
      sh.y += sh.vy * this.timeDilation;
      sh.x = Math.max(10, Math.min(this.width - 10, sh.x));

      if (sh.y > this.height + 20) {
        this.shards.splice(i, 1);
      }
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pa = this.particles[i];
      pa.x += pa.vx;
      pa.y += pa.vy;
      pa.alpha -= pa.decay;
      if (pa.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  // --- COLLISION LOGIC ---

  checkCollisions() {
    const p = this.player;
    if (!p) return;

    const isOverlapping = (e1, e2) => {
      return Math.abs(e1.x - e2.x) < (e1.width / 2 + e2.width / 2) &&
             Math.abs(e1.y - e2.y) < (e1.height / 2 + e2.height / 2);
    };

    // 1. Player lasers colliding with Enemies
    for (let lIdx = this.lasers.length - 1; lIdx >= 0; lIdx--) {
      const l = this.lasers[lIdx];
      if (!l.isPlayer) continue;

      for (let eIdx = this.enemies.length - 1; eIdx >= 0; eIdx--) {
        const e = this.enemies[eIdx];
        
        if (isOverlapping(l, e)) {
          this.spawnParticles(l.x, l.y, l.color, 4, 0.6);
          e.health -= l.damage;
          this.lasers.splice(lIdx, 1);
          
          if (e.health <= 0) {
            this.handleEnemyDeath(e);
            this.enemies.splice(eIdx, 1);
          }
          break; // break inner loop
        }
      }
    }

    // 2. Enemy Lasers colliding with Player
    for (let lIdx = this.lasers.length - 1; lIdx >= 0; lIdx--) {
      const l = this.lasers[lIdx];
      if (l.isPlayer) continue;

      if (isOverlapping(l, p)) {
        this.damagePlayer(l.damage);
        this.lasers.splice(lIdx, 1);
      }
    }

    // 3. Enemy Ship body crash into Player
    for (let eIdx = this.enemies.length - 1; eIdx >= 0; eIdx--) {
      const e = this.enemies[eIdx];
      if (isOverlapping(e, p)) {
        const crashDamage = e.type === 'boss' ? 50 : Math.floor(e.maxHealth * 0.5);
        this.damagePlayer(crashDamage);
        
        if (e.type !== 'boss') {
          // If player crashed into correct answer, record as correct but penalize for crashing
          if (e.isCorrectAnswer) {
            this.recordSolveMetric(true);
            this.generateNewQuest();
          }
          this.handleEnemyDeath(e, false); // Detonate without loot payout
          this.enemies.splice(eIdx, 1);
        } else {
          p.y += 40;
          this.triggerShake(10);
        }
      }
    }

    // 4. Powerups collection
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const pu = this.powerups[i];
      if (isOverlapping(pu, p)) {
        this.applyPowerup(pu);
        this.powerups.splice(i, 1);
      }
    }

    // 5. Shards collection
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const sh = this.shards[i];
      if (isOverlapping(sh, p)) {
        this.shardsCollected++;
        gameAudio.playPowerupSound();
        this.spawnParticles(sh.x, sh.y, '#ff007f', 3, 0.4);
        this.shards.splice(i, 1);
      }
    }
  }

  // Record education analytics
  recordSolveMetric(isCorrect) {
    if (isCorrect) {
      this.solvedCount++;
      const timeElapsed = Date.now() - this.questStartTime;
      this.totalQuestTime += timeElapsed;
      this.solvedQuestsCount++;
    } else {
      this.wrongCount++;
    }
    
    // Recalculate accuracy ratio
    const total = this.solvedCount + this.wrongCount;
    this.combatAccuracy = total > 0 ? Math.round((this.solvedCount / total) * 100) : 100;
  }

  handleEnemyDeath(enemy, payoutLoot = true) {
    this.score += enemy.scoreValue;
    this.triggerShake(enemy.type === 'boss' ? 25 : 4);
    
    const expScale = enemy.type === 'boss' ? 2.5 : (enemy.type === 'cruiser' ? 1.4 : 0.8);
    gameAudio.playExplosionSound(expScale);
    
    const color = enemy.color;
    const particleCount = enemy.type === 'boss' ? 70 : (enemy.type === 'cruiser' ? 20 : 8);
    this.spawnParticles(enemy.x, enemy.y, color, particleCount, enemy.type === 'boss' ? 1.5 : 1.0);

    // --- STEM HIT OUTCOMES ---
    if (enemy.type !== 'boss' && enemy.answerText && enemy.answerText !== "DRONE") {
      if (enemy.isCorrectAnswer) {
        // Uplifting success chime
        gameAudio.playCorrectSound();
        this.recordSolveMetric(true);
        
        // Spawn positive particles
        this.spawnParticles(enemy.x, enemy.y, '#39ff14', 15, 1.2);
        
        // Generate new quest!
        this.generateNewQuest();
      } else {
        // Heavy error buzz
        gameAudio.playWrongSound();
        this.recordSolveMetric(false);

        // Deduct player shields as error penalty
        this.damagePlayer(15);
        this.spawnParticles(enemy.x, enemy.y, '#ff0055', 15, 1.2);
        
        // DO NOT generate new quest immediately, let them shoot correct target
      }
    }

    if (enemy.type === 'boss') {
      this.bossActive = false;
      this.wave++;
      this.waveTimer = 0;
      gameAudio.setUrgency(false);
      this.spawnShards(enemy.x, enemy.y, 25);
    } else if (payoutLoot) {
      this.spawnShards(enemy.x, enemy.y, enemy.type === 'cruiser' ? 5 : (enemy.type === 'kamikaze' ? 1 : 2));
      this.spawnPowerup(enemy.x, enemy.y);
    }
  }

  damagePlayer(damage) {
    const p = this.player;
    if (!p) return;

    p.damageTint = 5;
    this.triggerShake(7);
    gameAudio.playHitSound();

    if (p.shield > 0) {
      p.shield -= damage;
      if (p.shield < 0) {
        p.hull += p.shield;
        p.shield = 0;
      }
    } else {
      p.hull -= damage;
    }

    if (p.hull <= 0) {
      p.hull = 0;
      this.gameOver();
    }
  }

  applyPowerup(pu) {
    const p = this.player;
    gameAudio.playPowerupSound();
    
    const indicator = document.getElementById('powerup-hud');
    const text = indicator.querySelector('.powerup-text');
    const bar = indicator.querySelector('.powerup-timer-bar .bar');

    if (pu.type === 'heal') {
      p.hull = Math.min(p.maxHull, p.hull + p.maxHull * 0.4);
      this.spawnParticles(p.x, p.y, '#39ff14', 15);
      text.innerText = "РЕМОНТ КОРПУСА";
      text.style.color = '#39ff14';
      bar.style.backgroundColor = '#39ff14';
      indicator.classList.remove('hidden');
      setTimeout(() => indicator.classList.add('hidden'), 1500);
    } 
    else if (pu.type === 'overdrive') {
      p.abilityActive = true;
      p.abilityActiveDuration = 6000;
      this.spawnParticles(p.x, p.y, '#ff007f', 15);
      
      text.innerText = "ФОРСАЖ ОРУЖИЯ";
      text.style.color = '#ff007f';
      bar.style.backgroundColor = '#ff007f';
      indicator.classList.remove('hidden');
      
      const start = p.abilityActiveDuration;
      const dec = setInterval(() => {
        if (!p.abilityActive || p.abilityActiveDuration <= 0) {
          indicator.classList.add('hidden');
          clearInterval(dec);
        } else {
          bar.style.width = `${(p.abilityActiveDuration / start) * 100}%`;
        }
      }, 100);
    } 
    else if (pu.type === 'shield_overload') {
      p.shield = p.maxShield * 1.5;
      this.spawnParticles(p.x, p.y, '#00f3ff', 15);
      text.innerText = "ПЕРЕГРУЗКА ЩИТА";
      text.style.color = '#00f3ff';
      bar.style.backgroundColor = '#00f3ff';
      indicator.classList.remove('hidden');
      setTimeout(() => indicator.classList.add('hidden'), 1500);
    } 
    else if (pu.type === 'slowmo') {
      this.timeDilation = 0.35;
      setTimeout(() => {
        this.timeDilation = 1.0;
        indicator.classList.add('hidden');
      }, 5000);
      
      text.innerText = "ИСКАЖЕНИЕ ВРЕМЕНИ";
      text.style.color = '#9900ff';
      bar.style.backgroundColor = '#9900ff';
      indicator.classList.remove('hidden');
      bar.style.width = '100%';
      let elapsed = 0;
      const dec = setInterval(() => {
        elapsed += 100;
        bar.style.width = `${(1 - elapsed / 5000) * 100}%`;
        if (elapsed >= 5000) clearInterval(dec);
      }, 100);
    }
  }

  gameOver() {
    this.gameState = 'gameover';
    this.loopRunning = false;
    this.triggerShake(40);
    gameAudio.playExplosionSound(3.0);
    gameAudio.stopMusic();

    // Hide HUD and Canvas Container
    const hud = document.getElementById('hud');
    const canvasContainer = document.getElementById('game-canvas-container');
    if (hud) hud.classList.add('hidden');
    if (canvasContainer) canvasContainer.classList.add('hidden');

    this.spawnParticles(this.player.x, this.player.y, '#ff0055', 80, 2.0);
    this.spawnParticles(this.player.x, this.player.y, '#9900ff', 40, 1.2);
    
    // Average solving speed in milliseconds
    const avgSpeed = this.solvedQuestsCount > 0 ? Math.round(this.totalQuestTime / this.solvedQuestsCount) : 0;

    if (window.onGameOver) {
      window.onGameOver(this.score, this.wave, this.shardsCollected, this.combatAccuracy, this.solvedCount, avgSpeed);
    }
  }

  // --- RENDER CODE ---

  draw() {
    this.ctx.fillStyle = 'rgba(7, 3, 19, 0.25)';
    this.ctx.fillRect(0, 0, this.width, this.height);

    this.ctx.save();
    if (this.shakeIntensity > 0.1) {
      const dx = (Math.random() - 0.5) * this.shakeIntensity;
      const dy = (Math.random() - 0.5) * this.shakeIntensity;
      this.ctx.translate(dx, dy);
    }

    // 1. Draw Starfield
    this.stars.forEach(star => {
      this.ctx.fillStyle = star.color;
      this.ctx.fillRect(star.x, star.y, star.size, star.size);
    });

    // 2. Draw powerups
    this.powerups.forEach(pu => {
      this.ctx.save();
      this.ctx.translate(pu.x, pu.y);
      const pulseSize = pu.width + Math.sin(pu.pulse) * 4;
      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = pu.color;
      this.ctx.fillStyle = pu.color;
      this.ctx.rotate(pu.pulse * 0.5);
      this.ctx.fillRect(-pulseSize/2, -pulseSize/2, pulseSize, pulseSize);
      
      this.ctx.shadowBlur = 0;
      this.ctx.fillStyle = '#000000';
      this.ctx.font = 'bold 12px Inter';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      
      let symbol = '+';
      if (pu.type === 'overdrive') symbol = '⚡';
      if (pu.type === 'slowmo') symbol = '⏳';
      if (pu.type === 'shield_overload') symbol = '⛨';
      this.ctx.fillText(symbol, 0, 0);
      this.ctx.restore();
    });

    // 3. Draw shards
    this.shards.forEach(sh => {
      this.ctx.save();
      this.ctx.fillStyle = sh.color;
      this.ctx.shadowBlur = 8;
      this.ctx.shadowColor = sh.color;
      this.ctx.beginPath();
      this.ctx.moveTo(sh.x, sh.y - 6);
      this.ctx.lineTo(sh.x + 5, sh.y);
      this.ctx.lineTo(sh.x, sh.y + 6);
      this.ctx.lineTo(sh.x - 5, sh.y);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.restore();
    });

    // 4. Draw Lasers
    this.lasers.forEach(l => {
      this.ctx.save();
      this.ctx.translate(l.x, l.y);
      this.ctx.rotate(l.angle);
      this.ctx.fillStyle = l.color;
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = l.color;
      this.ctx.beginPath();
      this.ctx.arc(0, -l.height/2, l.width/2, Math.PI, 0);
      this.ctx.lineTo(l.width/2, l.height/2);
      this.ctx.arc(0, l.height/2, l.width/2, 0, Math.PI);
      this.ctx.lineTo(-l.width/2, -l.height/2);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.restore();
    });

    // 5. Draw Enemies with Answer panels
    this.enemies.forEach(e => {
      this.ctx.save();
      
      if (e.type === 'boss') {
        this.drawBoss(e);
      } else {
        this.ctx.translate(e.x, e.y);
        
        // Visual indicator: glowing outline if it has correct answer
        this.ctx.fillStyle = e.color;
        this.ctx.shadowBlur = e.isCorrectAnswer ? 16 : 6;
        this.ctx.shadowColor = e.isCorrectAnswer ? varColor('cyan') : e.color;

        this.ctx.beginPath();
        if (e.type === 'cruiser') {
          this.ctx.moveTo(0, 22);
          this.ctx.lineTo(24, 0);
          this.ctx.lineTo(16, -20);
          this.ctx.lineTo(-16, -20);
          this.ctx.lineTo(-24, 0);
        } else if (e.type === 'kamikaze') {
          this.ctx.moveTo(0, 16);
          this.ctx.lineTo(12, -14);
          this.ctx.lineTo(0, -6);
          this.ctx.lineTo(-12, -14);
        } else {
          this.ctx.moveTo(0, 18);
          this.ctx.lineTo(16, -10);
          this.ctx.lineTo(8, -6);
          this.ctx.lineTo(0, -14);
          this.ctx.lineTo(-8, -6);
          this.ctx.lineTo(-16, -10);
        }
        this.ctx.closePath();
        this.ctx.fill();
        
        this.ctx.shadowBlur = 0;
        this.ctx.fillStyle = '#070313';
        this.ctx.beginPath();
        this.ctx.arc(0, 2, 4, 0, Math.PI*2);
        this.ctx.fill();

        // DRAW HOLOGRAM ANSWER BOARD (EduTech key feature)
        if (e.answerText) {
          this.ctx.save();
          // Draw neat glassmorphic answer frame above enemy
          const panelY = -e.height/2 - 20;
          this.ctx.fillStyle = 'rgba(15, 8, 38, 0.8)';
          this.ctx.strokeStyle = e.isCorrectAnswer ? '#00f3ff' : 'rgba(255, 255, 255, 0.2)';
          this.ctx.lineWidth = 1.5;
          this.ctx.shadowBlur = e.isCorrectAnswer ? 8 : 0;
          this.ctx.shadowColor = '#00f3ff';
          
          const textW = this.ctx.measureText(e.answerText).width + 16;
          
          this.ctx.beginPath();
          this.ctx.roundRect(-textW/2, panelY - 10, textW, 20, 4);
          this.ctx.fill();
          this.ctx.stroke();

          // Answer Value Text
          this.ctx.shadowBlur = 0;
          this.ctx.fillStyle = e.isCorrectAnswer ? '#00f3ff' : '#ffffff';
          this.ctx.font = 'bold 11px Orbitron';
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText(e.answerText, 0, panelY);
          this.ctx.restore();
        }
      }
      this.ctx.restore();
    });

    // 6. Draw particles
    this.particles.forEach(pa => {
      this.ctx.fillStyle = pa.color;
      this.ctx.globalAlpha = pa.alpha;
      this.ctx.beginPath();
      this.ctx.arc(pa.x, pa.y, pa.size, 0, Math.PI * 2);
      this.ctx.fill();
    });
    this.ctx.globalAlpha = 1.0;

    // 7. Draw Player Ship
    if (this.player && this.gameState === 'playing') {
      this.drawPlayerShip();
    }

    this.ctx.restore();
  }

  drawPlayerShip() {
    const p = this.player;
    this.ctx.save();
    this.ctx.translate(p.x, p.y);
    
    // Draw Shield
    if (p.shield > 0) {
      const shieldPulse = 1.0 + Math.sin(Date.now() / 80) * 0.05;
      const radius = p.width * 0.9 * shieldPulse;

      if (this.activeCustomShield === 'hex') {
        // Advanced Hexagonal Grid shield bubble (outstanding visual fidelity!)
        this.ctx.strokeStyle = '#00f3ff';
        this.ctx.shadowBlur = 20;
        this.ctx.shadowColor = '#00f3ff';
        this.ctx.lineWidth = 1.5;
        
        this.ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI * 2) / 6 + (Date.now() / 1500); // rotate hex slowly
          const hx = Math.cos(angle) * radius;
          const hy = Math.sin(angle) * radius;
          if (i === 0) this.ctx.moveTo(hx, hy);
          else this.ctx.lineTo(hx, hy);
        }
        this.ctx.closePath();
        this.ctx.stroke();

        // Inner nested dotted bubble
        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(0, 243, 255, 0.4)';
        this.ctx.setLineDash([4, 6]);
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius * 0.8, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.restore();
      } else {
        // Standard high-glow vector bubble shield
        this.ctx.strokeStyle = '#00f3ff';
        this.ctx.shadowBlur = 18;
        this.ctx.shadowColor = '#00f3ff';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
        this.ctx.stroke();
      }
    }

    this.ctx.shadowBlur = 15;
    if (p.damageTint > 0) {
      this.ctx.fillStyle = '#ff0055';
      this.ctx.shadowColor = '#ff0055';
    } else {
      this.ctx.fillStyle = p.color;
      this.ctx.shadowColor = p.color;
    }

    this.ctx.beginPath();
    if (this.shipType === 'interceptor') {
      this.ctx.moveTo(0, -22);
      this.ctx.lineTo(16, 12);
      this.ctx.lineTo(6, 6);
      this.ctx.lineTo(0, 16);
      this.ctx.lineTo(-6, 6);
      this.ctx.lineTo(-16, 12);
    } 
    else if (this.shipType === 'dreadnought') {
      this.ctx.moveTo(0, -20);
      this.ctx.lineTo(24, -8);
      this.ctx.lineTo(12, 16);
      this.ctx.lineTo(0, 10);
      this.ctx.lineTo(-12, 16);
      this.ctx.lineTo(-24, -8);
    } 
    else {
      this.ctx.moveTo(0, -24);
      this.ctx.lineTo(18, 16);
      this.ctx.lineTo(0, 6);
      this.ctx.lineTo(-18, 16);
    }
    this.ctx.closePath();
    this.ctx.fill();

    // CUSTOM EXHAUST FLAME FILL (loads skin bought in Hangar shop)
    let exhaustColor = '#ff007f'; // default pink
    if (this.activeCustomFlame === 'flame_green') exhaustColor = '#39ff14';
    else if (this.activeCustomFlame === 'flame_gold') exhaustColor = '#ffb703';
    else if (this.activeCustomFlame === 'flame_cyan') exhaustColor = '#00f3ff';

    this.ctx.shadowBlur = 12;
    this.ctx.fillStyle = exhaustColor;
    this.ctx.shadowColor = exhaustColor;
    const flameHeight = Math.random() * 8 + 4;
    this.ctx.beginPath();
    this.ctx.moveTo(-5, 12);
    this.ctx.lineTo(0, 12 + flameHeight);
    this.ctx.lineTo(5, 12);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.restore();
  }

  drawBoss(boss) {
    this.ctx.translate(boss.x, boss.y);
    this.ctx.fillStyle = boss.color;
    this.ctx.shadowBlur = 25;
    this.ctx.shadowColor = boss.color;

    this.ctx.beginPath();
    this.ctx.moveTo(0, -40);
    this.ctx.lineTo(60, -20);
    this.ctx.lineTo(45, 15);
    this.ctx.lineTo(15, 30);
    this.ctx.lineTo(0, 45);
    this.ctx.lineTo(-15, 30);
    this.ctx.lineTo(-45, 15);
    this.ctx.lineTo(-60, -20);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.fillStyle = '#070313';
    this.ctx.shadowBlur = 0;
    this.ctx.beginPath();
    this.ctx.moveTo(-35, -10);
    this.ctx.lineTo(35, -10);
    this.ctx.lineTo(20, 10);
    this.ctx.lineTo(-20, 10);
    this.ctx.closePath();
    this.ctx.fill();

    const corePulse = Math.sin(boss.phaseTimer / 150) * 4 + 10;
    this.ctx.fillStyle = boss.attackPhase === 0 ? '#ff0055' : (boss.attackPhase === 1 ? '#9900ff' : '#00f3ff');
    this.ctx.shadowBlur = 20;
    this.ctx.shadowColor = this.ctx.fillStyle;
    this.ctx.beginPath();
    this.ctx.arc(0, 18, corePulse/2, 0, Math.PI*2);
    this.ctx.fill();
  }
}

// Helpers
function varColor(name) {
  if (name === 'cyan') return '#00f3ff';
  if (name === 'pink') return '#ff007f';
  return '#ffffff';
}
