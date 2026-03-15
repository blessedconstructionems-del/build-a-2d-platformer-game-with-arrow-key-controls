class AudioController {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.musicGain = null;
        this.sfxGain = null;
        this.isInitialized = false;
        this.isMusicEnabled = true;
        this.nextNoteTime = 0;
        this.tempo = 66;
        this.stepIndex = 0;
        this.musicPattern = [
            { note: 98.0, len: 0.7, vol: 0.42 },
            { note: 123.47, len: 0.5, vol: 0.34 },
            { note: 92.5, len: 0.65, vol: 0.4 },
            { note: 110.0, len: 0.55, vol: 0.36 },
            { note: 82.41, len: 0.8, vol: 0.46 },
            { note: 98.0, len: 0.5, vol: 0.35 },
            { note: 77.78, len: 0.9, vol: 0.44 },
            { note: 92.5, len: 0.6, vol: 0.38 }
        ];
    }

    async init() {
        if (this.isInitialized) {
            return;
        }

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            return;
        }

        this.audioContext = new AudioContextClass();
        this.masterGain = this.audioContext.createGain();
        this.musicGain = this.audioContext.createGain();
        this.sfxGain = this.audioContext.createGain();

        this.masterGain.gain.value = 1.0;
        this.musicGain.gain.value = 0.85;
        this.sfxGain.gain.value = 0.9;

        this.musicGain.connect(this.masterGain);
        this.sfxGain.connect(this.masterGain);
        this.masterGain.connect(this.audioContext.destination);

        this.nextNoteTime = this.audioContext.currentTime;
        this.isInitialized = true;
    }

    async unlock() {
        if (!this.isInitialized) {
            await this.init();
        }
        if (!this.audioContext) {
            return;
        }
        if (this.audioContext.state === "suspended") {
            await this.audioContext.resume();
        }
    }

    setMusicEnabled(enabled) {
        this.isMusicEnabled = enabled;
        if (!this.musicGain || !this.audioContext) {
            return;
        }
        this.musicGain.gain.cancelScheduledValues(this.audioContext.currentTime);
        this.musicGain.gain.linearRampToValueAtTime(
            enabled ? 0.85 : 0,
            this.audioContext.currentTime + 0.2
        );
    }

    playShoot() {
        this._playPulse(280, 0.08, 0.35);
    }

    playEnemyHit() {
        this._playPulse(120, 0.12, 0.45);
    }

    _playPulse(frequency, duration, volume) {
        if (!this.audioContext || !this.sfxGain) {
            return;
        }
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        const t = this.audioContext.currentTime;

        osc.type = "square";
        osc.frequency.setValueAtTime(frequency, t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(60, frequency * 0.45), t + duration);

        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(t);
        osc.stop(t + duration + 0.02);
    }

    update() {
        if (!this.isInitialized || !this.audioContext || !this.isMusicEnabled) {
            return;
        }

        const secondsPerBeat = 60 / this.tempo;
        while (this.nextNoteTime < this.audioContext.currentTime + 0.16) {
            const step = this.musicPattern[this.stepIndex];
            this._playScaryNote(step.note, step.len * secondsPerBeat, step.vol, this.nextNoteTime);

            this.stepIndex += 1;
            if (this.stepIndex >= this.musicPattern.length) {
                this.stepIndex = 0;
            }

            this.nextNoteTime += secondsPerBeat * 0.82;
        }
    }

    _playScaryNote(frequency, duration, volume, startTime) {
        if (!this.audioContext || !this.musicGain) {
            return;
        }

        const oscA = this.audioContext.createOscillator();
        const oscB = this.audioContext.createOscillator();
        const lfo = this.audioContext.createOscillator();
        const lfoGain = this.audioContext.createGain();
        const noteGain = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();
        const distortion = this.audioContext.createWaveShaper();

        oscA.type = "sawtooth";
        oscB.type = "triangle";
        oscA.frequency.setValueAtTime(frequency, startTime);
        oscB.frequency.setValueAtTime(frequency * 0.498, startTime);

        lfo.type = "sine";
        lfo.frequency.setValueAtTime(5.2, startTime);
        lfoGain.gain.setValueAtTime(3.4, startTime);
        lfo.connect(lfoGain);
        lfoGain.connect(oscA.frequency);

        filter.type = "bandpass";
        filter.frequency.setValueAtTime(780, startTime);
        filter.Q.value = 3.8;

        distortion.curve = this._makeDistortionCurve(120);
        distortion.oversample = "4x";

        noteGain.gain.setValueAtTime(0.0001, startTime);
        noteGain.gain.exponentialRampToValueAtTime(volume, startTime + 0.03);
        noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        oscA.connect(filter);
        oscB.connect(filter);
        filter.connect(distortion);
        distortion.connect(noteGain);
        noteGain.connect(this.musicGain);

        oscA.start(startTime);
        oscB.start(startTime);
        lfo.start(startTime);

        const stopTime = startTime + duration + 0.03;
        oscA.stop(stopTime);
        oscB.stop(stopTime);
        lfo.stop(stopTime);
    }

    _makeDistortionCurve(amount) {
        const k = typeof amount === "number" ? amount : 50;
        const nSamples = 44100;
        const curve = new Float32Array(nSamples);
        const deg = Math.PI / 180;
        for (let i = 0; i < nSamples; i += 1) {
            const x = (i * 2) / nSamples - 1;
            curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
        }
        return curve;
    }
}

class InputController {
    constructor() {
        this.keys = new Set();
        this.touch = {
            left: false,
            right: false,
            jumpQueued: false,
            attackQueued: false
        };
        this._bindKeyboard();
    }

    _bindKeyboard() {
        window.addEventListener("keydown", (event) => {
            this.keys.add(event.code);
        });

        window.addEventListener("keyup", (event) => {
            this.keys.delete(event.code);
        });
    }

    bindTouchButtons(buttonMap) {
        const bindHold = (button, onDown, onUp) => {
            const down = (event) => {
                event.preventDefault();
                onDown();
            };
            const up = (event) => {
                event.preventDefault();
                onUp();
            };
            button.addEventListener("touchstart", down, { passive: false });
            button.addEventListener("touchend", up, { passive: false });
            button.addEventListener("mousedown", down);
            button.addEventListener("mouseup", up);
            button.addEventListener("mouseleave", up);
        };

        bindHold(buttonMap.leftBtn, () => {
            this.touch.left = true;
        }, () => {
            this.touch.left = false;
        });

        bindHold(buttonMap.rightBtn, () => {
            this.touch.right = true;
        }, () => {
            this.touch.right = false;
        });

        const jumpPress = (event) => {
            event.preventDefault();
            this.touch.jumpQueued = true;
        };
        buttonMap.jumpBtn.addEventListener("touchstart", jumpPress, { passive: false });
        buttonMap.jumpBtn.addEventListener("mousedown", jumpPress);

        const attackPress = (event) => {
            event.preventDefault();
            this.touch.attackQueued = true;
        };
        buttonMap.attackBtn.addEventListener("touchstart", attackPress, { passive: false });
        buttonMap.attackBtn.addEventListener("mousedown", attackPress);
    }

    getMoveAxis() {
        const leftPressed = this.keys.has("ArrowLeft") || this.keys.has("KeyA") || this.touch.left;
        const rightPressed = this.keys.has("ArrowRight") || this.keys.has("KeyD") || this.touch.right;
        if (leftPressed && !rightPressed) {
            return -1;
        }
        if (rightPressed && !leftPressed) {
            return 1;
        }
        return 0;
    }

    consumeJumpPress() {
        const keyboardJump = this.keys.has("ArrowUp") || this.keys.has("KeyW") || this.keys.has("Space");
        if (keyboardJump || this.touch.jumpQueued) {
            this.touch.jumpQueued = false;
            return true;
        }
        return false;
    }

    consumeAttackPress() {
        const keyboardAttack = this.keys.has("KeyF") || this.keys.has("KeyK") || this.keys.has("KeyX");
        if (keyboardAttack || this.touch.attackQueued) {
            this.touch.attackQueued = false;
            return true;
        }
        return false;
    }

    isPausePressed() {
        return this.keys.has("KeyP");
    }
}

class Game {
    constructor(canvas, ui) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        if (!this.ctx) {
            throw new Error("Canvas 2D context not available.");
        }

        this.ui = ui;
        this.audio = new AudioController();
        this.input = new InputController();
        this.input.bindTouchButtons({
            leftBtn: ui.leftBtn,
            rightBtn: ui.rightBtn,
            jumpBtn: ui.jumpBtn,
            attackBtn: ui.attackBtn
        });

        this.state = "menu";
        this.lastTime = 0;
        this.pausePressedLastFrame = false;
        this.camera = { x: 0, y: 0 };
        this.world = this._createWorld();
        this.player = this._createPlayer();
        this.projectiles = [];
        this.score = 0;

        this._bindUI();
        this._resizeCanvas();
        window.addEventListener("resize", () => this._resizeCanvas());
    }

    _createWorld() {
        return {
            width: 3200,
            height: 980,
            gravity: 2200,
            floorY: 800,
            platforms: [
                { x: 220, y: 700, w: 260, h: 24, moving: false, vx: 0, minX: 220, maxX: 220 },
                { x: 620, y: 640, w: 210, h: 24, moving: true, vx: 120, minX: 560, maxX: 920 },
                { x: 980, y: 590, w: 220, h: 24, moving: false, vx: 0, minX: 980, maxX: 980 },
                { x: 1320, y: 540, w: 200, h: 24, moving: true, vx: -140, minX: 1180, maxX: 1520 },
                { x: 1680, y: 610, w: 260, h: 24, moving: false, vx: 0, minX: 1680, maxX: 1680 },
                { x: 2080, y: 560, w: 220, h: 24, moving: true, vx: 130, minX: 1980, maxX: 2360 },
                { x: 2480, y: 500, w: 240, h: 24, moving: false, vx: 0, minX: 2480, maxX: 2480 }
            ],
            coins: [
                { x: 300, y: 655, r: 12, collected: false },
                { x: 710, y: 595, r: 12, collected: false },
                { x: 1080, y: 545, r: 12, collected: false },
                { x: 1410, y: 495, r: 12, collected: false },
                { x: 1780, y: 565, r: 12, collected: false },
                { x: 2200, y: 515, r: 12, collected: false },
                { x: 2590, y: 455, r: 12, collected: false },
                { x: 2900, y: 740, r: 12, collected: false }
            ],
            enemies: [
                { x: 520, y: 760, w: 34, h: 30, vx: 70, minX: 420, maxX: 650, dir: 1, bob: 0, alive: true },
                { x: 1160, y: 550, w: 34, h: 30, vx: 60, minX: 1010, maxX: 1230, dir: -1, bob: 1.2, alive: true },
                { x: 1880, y: 570, w: 34, h: 30, vx: 80, minX: 1710, maxX: 1930, dir: 1, bob: 2.4, alive: true },
                { x: 2660, y: 460, w: 34, h: 30, vx: 75, minX: 2510, maxX: 2700, dir: -1, bob: 0.9, alive: true }
            ]
        };
    }

    _createPlayer() {
        return {
            x: 80,
            y: 690,
            w: 42,
            h: 56,
            vx: 0,
            vy: 0,
            speed: 360,
            jumpPower: 760,
            jumpsUsed: 0,
            maxJumps: 2,
            onGround: false,
            state: "idle",
            facing: 1,
            animTimer: 0,
            attackCooldown: 0
        };
    }

    _bindUI() {
        this.ui.playBtn.addEventListener("click", async () => {
            await this.audio.unlock();
            this.startGame();
        });

        this.ui.restartBtn.addEventListener("click", async () => {
            await this.audio.unlock();
            this.restartGame();
        });

        this.ui.pauseBtn.addEventListener("click", () => {
            if (this.state === "playing") {
                this.setState("paused");
            } else if (this.state === "paused") {
                this.setState("playing");
            }
        });

        this.ui.resumeBtn.addEventListener("click", () => {
            if (this.state === "paused") {
                this.setState("playing");
            }
        });

        this.ui.musicBtn.addEventListener("click", async () => {
            await this.audio.unlock();
            const nextEnabled = !this.audio.isMusicEnabled;
            this.audio.setMusicEnabled(nextEnabled);
            this.ui.musicBtn.textContent = nextEnabled ? "Music: On" : "Music: Off";
        });
    }

    _resizeCanvas() {
        const shell = this.canvas.parentElement;
        if (!shell) {
            return;
        }
        const rect = shell.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = Math.max(320, Math.floor(rect.width * dpr));
        this.canvas.height = Math.max(240, Math.floor(rect.height * dpr));
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    setState(nextState) {
        this.state = nextState;
        this.ui.stateText.textContent = nextState.toUpperCase();

        this.ui.menuOverlay.classList.toggle("overlay--visible", nextState === "menu");
        this.ui.gameOverOverlay.classList.toggle("overlay--visible", nextState === "gameover");
        this.ui.pauseOverlay.classList.toggle("overlay--visible", nextState === "paused");
    }

    startGame() {
        this.setState("playing");
    }

    restartGame() {
        this.world = this._createWorld();
        this.player = this._createPlayer();
        this.projectiles = [];
        this.score = 0;
        this.ui.scoreValue.textContent = "0";
        this.ui.finalScore.textContent = "0";
        this.camera.x = 0;
        this.camera.y = 0;
        this.setState("playing");
    }

    run() {
        requestAnimationFrame((time) => this._loop(time));
    }

    _loop(time) {
        const dt = Math.min(0.033, (time - this.lastTime) / 1000 || 0.016);
        this.lastTime = time;

        if (this.state === "playing") {
            this._update(dt);
        } else {
            this._handlePauseToggle();
        }

        this.audio.update();
        this._render();
        requestAnimationFrame((nextTime) => this._loop(nextTime));
    }

    _handlePauseToggle() {
        const pausePressed = this.input.isPausePressed();
        if (pausePressed && !this.pausePressedLastFrame) {
            if (this.state === "paused") {
                this.setState("playing");
            } else if (this.state === "playing") {
                this.setState("paused");
            }
        }
        this.pausePressedLastFrame = pausePressed;
    }

    _update(dt) {
        this._handlePauseToggle();
        this._updatePlatforms(dt);
        this._updateEnemies(dt);
        this._updatePlayer(dt);
        this._updateProjectiles(dt);
        this._collectCoins();
        this._checkEnemyHit();
        this._updateCamera();
        this._checkFallDeath();
    }

    _updatePlatforms(dt) {
        for (const platform of this.world.platforms) {
            if (!platform.moving) {
                continue;
            }
            platform.x += platform.vx * dt;
            if (platform.x <= platform.minX) {
                platform.x = platform.minX;
                platform.vx = Math.abs(platform.vx);
            } else if (platform.x >= platform.maxX) {
                platform.x = platform.maxX;
                platform.vx = -Math.abs(platform.vx);
            }
        }
    }

    _updateEnemies(dt) {
        for (const enemy of this.world.enemies) {
            if (!enemy.alive) {
                continue;
            }
            enemy.x += enemy.vx * enemy.dir * dt;
            enemy.bob += dt * 4;

            if (enemy.x <= enemy.minX) {
                enemy.x = enemy.minX;
                enemy.dir = 1;
            } else if (enemy.x + enemy.w >= enemy.maxX) {
                enemy.x = enemy.maxX - enemy.w;
                enemy.dir = -1;
            }
        }
    }

    _updatePlayer(dt) {
        const player = this.player;
        const moveAxis = this.input.getMoveAxis();

        player.vx = moveAxis * player.speed;
        if (moveAxis !== 0) {
            player.facing = moveAxis > 0 ? 1 : -1;
        }

        const wantsJump = this.input.consumeJumpPress();
        if (wantsJump && player.jumpsUsed < player.maxJumps) {
            player.vy = -player.jumpPower;
            player.jumpsUsed += 1;
            player.onGround = false;
        }

        player.attackCooldown = Math.max(0, player.attackCooldown - dt);
        const wantsAttack = this.input.consumeAttackPress();
        if (wantsAttack && player.attackCooldown <= 0) {
            this._spawnProjectile();
            player.attackCooldown = 0.28;
            this.audio.playShoot();
        }

        player.vy += this.world.gravity * dt;
        player.x += player.vx * dt;
        player.y += player.vy * dt;

        this._resolveWorldBounds();
        this._resolveCollisions();

        player.animTimer += dt;
        if (!player.onGround) {
            player.state = "jump";
        } else if (Math.abs(player.vx) > 1) {
            player.state = "run";
        } else {
            player.state = "idle";
        }
    }

    _spawnProjectile() {
        const p = this.player;
        const dir = p.facing;
        this.projectiles.push({
            x: p.x + p.w / 2 + dir * 18,
            y: p.y + p.h * 0.45,
            vx: dir * 680,
            r: 6,
            life: 1.2
        });
    }

    _updateProjectiles(dt) {
        for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
            const shot = this.projectiles[i];
            shot.x += shot.vx * dt;
            shot.life -= dt;

            if (shot.life <= 0 || shot.x < 0 || shot.x > this.world.width) {
                this.projectiles.splice(i, 1);
                continue;
            }

            for (const enemy of this.world.enemies) {
                if (!enemy.alive) {
                    continue;
                }
                const hit =
                    shot.x + shot.r > enemy.x &&
                    shot.x - shot.r < enemy.x + enemy.w &&
                    shot.y + shot.r > enemy.y &&
                    shot.y - shot.r < enemy.y + enemy.h;

                if (hit) {
                    enemy.alive = false;
                    this.score += 25;
                    this.ui.scoreValue.textContent = String(this.score);
                    this.audio.playEnemyHit();
                    this.projectiles.splice(i, 1);
                    break;
                }
            }
        }
    }

    _resolveWorldBounds() {
        const player = this.player;
        if (player.x < 0) {
            player.x = 0;
        }
        if (player.x + player.w > this.world.width) {
            player.x = this.world.width - player.w;
        }

        if (player.y + player.h >= this.world.floorY) {
            player.y = this.world.floorY - player.h;
            player.vy = 0;
            player.onGround = true;
            player.jumpsUsed = 0;
        } else {
            player.onGround = false;
        }
    }

    _resolveCollisions() {
        const p = this.player;

        for (const platform of this.world.platforms) {
            const overlapX = p.x < platform.x + platform.w && p.x + p.w > platform.x;
            if (!overlapX) {
                continue;
            }

            const previousBottom = p.y + p.h - p.vy * 0.016;
            const currentBottom = p.y + p.h;

            const landing = previousBottom <= platform.y + 4 && currentBottom >= platform.y;
            if (landing && p.vy >= 0) {
                p.y = platform.y - p.h;
                p.vy = 0;
                p.onGround = true;
                p.jumpsUsed = 0;
                if (platform.moving) {
                    p.x += platform.vx * 0.016;
                }
            }
        }
    }

    _collectCoins() {
        const p = this.player;
        const centerX = p.x + p.w / 2;
        const centerY = p.y + p.h / 2;

        for (const coin of this.world.coins) {
            if (coin.collected) {
                continue;
            }
            const dx = centerX - coin.x;
            const dy = centerY - coin.y;
            const distanceSquared = dx * dx + dy * dy;
            const pickupRadius = coin.r + Math.min(p.w, p.h) * 0.35;
            if (distanceSquared <= pickupRadius * pickupRadius) {
                coin.collected = true;
                this.score += 10;
                this.ui.scoreValue.textContent = String(this.score);
            }
        }
    }

    _checkEnemyHit() {
        const p = this.player;
        for (const enemy of this.world.enemies) {
            if (!enemy.alive) {
                continue;
            }
            const hit =
                p.x < enemy.x + enemy.w &&
                p.x + p.w > enemy.x &&
                p.y < enemy.y + enemy.h &&
                p.y + p.h > enemy.y;
            if (hit) {
                this.ui.finalScore.textContent = String(this.score);
                this.setState("gameover");
                return;
            }
        }
    }

    _updateCamera() {
        const viewWidth = this.canvas.clientWidth;
        const targetX = this.player.x + this.player.w / 2 - viewWidth / 2;
        const maxX = this.world.width - viewWidth;
        const clampedTarget = Math.max(0, Math.min(targetX, Math.max(0, maxX)));
        this.camera.x += (clampedTarget - this.camera.x) * 0.1;
    }

    _checkFallDeath() {
        if (this.player.y > this.world.height + 200) {
            this.ui.finalScore.textContent = String(this.score);
            this.setState("gameover");
        }
    }

    _render() {
        const ctx = this.ctx;
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;

        ctx.clearRect(0, 0, width, height);
        this._drawBackground(ctx, width, height);

        ctx.save();
        ctx.translate(-this.camera.x, 0);

        this._drawLavaMist(ctx, width, height);
        this._drawBackgroundRuins(ctx, height);
        this._drawGround(ctx);
        this._drawSpikes(ctx);
        this._drawPlatforms(ctx);
        this._drawTorches(ctx);
        this._drawCoins(ctx);
        this._drawProjectiles(ctx);
        this._drawEnemies(ctx);
        this._drawPlayer(ctx);

        ctx.restore();
    }

    _drawBackground(ctx, width, height) {
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, "#2f132b");
        gradient.addColorStop(0.5, "#1f1127");
        gradient.addColorStop(1, "#130f1f");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = "rgba(255,120,120,0.06)";
        for (let i = 0; i < 24; i += 1) {
            const x = i * 150 - (this.camera.x * 0.1);
            const h = 60 + (i % 5) * 20;
            ctx.beginPath();
            ctx.moveTo(x, height - 120);
            ctx.lineTo(x + 50, height - 120 - h);
            ctx.lineTo(x + 100, height - 120);
            ctx.closePath();
            ctx.fill();
        }
    }

    _drawLavaMist(ctx, width, height) {
        const pulse = (Math.sin(performance.now() * 0.0015) + 1) * 0.5;
        ctx.fillStyle = `rgba(255, 80, 80, ${0.06 + pulse * 0.05})`;
        ctx.fillRect(this.camera.x, height - 180, width + 120, 180);
    }

    _drawBackgroundRuins(ctx, height) {
        for (let i = 0; i < 16; i += 1) {
            const x = i * 220 + 80;
            const offset = (i % 3) * 20;
            ctx.fillStyle = "rgba(85, 70, 110, 0.35)";
            ctx.fillRect(x, height - 320 - offset, 36, 200 + offset);
            ctx.fillRect(x + 12, height - 350 - offset, 12, 30);
            ctx.fillStyle = "rgba(120, 90, 140, 0.3)";
            ctx.fillRect(x - 10, height - 130, 56, 14);
        }
    }

    _drawGround(ctx) {
        ctx.fillStyle = "#2f2a46";
        ctx.fillRect(0, this.world.floorY, this.world.width, 220);

        ctx.fillStyle = "#4a3b63";
        ctx.fillRect(0, this.world.floorY, this.world.width, 14);

        for (let x = 0; x < this.world.width; x += 34) {
            ctx.fillStyle = x % 68 === 0 ? "#3a3154" : "#342c4d";
            ctx.fillRect(x, this.world.floorY + 24, 30, 12);
        }
    }

    _drawSpikes(ctx) {
        ctx.fillStyle = "#7a6c90";
        for (let i = 0; i < 70; i += 1) {
            const x = i * 46 + 10;
            const y = this.world.floorY - 2;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 10, y - 18);
            ctx.lineTo(x + 20, y);
            ctx.closePath();
            ctx.fill();
        }
    }

    _drawPlatforms(ctx) {
        for (const platform of this.world.platforms) {
            ctx.fillStyle = platform.moving ? "#7a4f8f" : "#5f4b7a";
            ctx.fillRect(platform.x, platform.y, platform.w, platform.h);

            ctx.fillStyle = "rgba(255,170,220,0.22)";
            ctx.fillRect(platform.x, platform.y, platform.w, 5);

            for (let x = platform.x + 6; x < platform.x + platform.w - 6; x += 18) {
                ctx.fillStyle = "rgba(35,24,52,0.45)";
                ctx.fillRect(x, platform.y + 10, 10, 8);
            }
        }
    }

    _drawTorches(ctx) {
        for (let i = 0; i < 12; i += 1) {
            const x = i * 260 + 120;
            const y = this.world.floorY - 52;
            const flame = (Math.sin(performance.now() * 0.01 + i) + 1) * 0.5;

            ctx.fillStyle = "#3f2d24";
            ctx.fillRect(x, y, 8, 30);

            ctx.fillStyle = `rgba(255, 120, 70, ${0.35 + flame * 0.25})`;
            ctx.beginPath();
            ctx.arc(x + 4, y - 6, 10 + flame * 4, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#ffb35c";
            ctx.beginPath();
            ctx.arc(x + 4, y - 8, 5 + flame * 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    _drawCoins(ctx) {
        for (const coin of this.world.coins) {
            if (coin.collected) {
                continue;
            }
            ctx.save();
            ctx.translate(coin.x, coin.y);
            ctx.rotate(Math.sin(performance.now() * 0.004 + coin.x * 0.01) * 0.15);
            ctx.fillStyle = "#ffd166";
            ctx.beginPath();
            ctx.arc(0, 0, coin.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#ffefb0";
            ctx.beginPath();
            ctx.arc(-3, -3, coin.r * 0.35, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    _drawProjectiles(ctx) {
        for (const shot of this.projectiles) {
            ctx.fillStyle = "#ff9f5a";
            ctx.beginPath();
            ctx.arc(shot.x, shot.y, shot.r, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "rgba(255, 210, 130, 0.7)";
            ctx.beginPath();
            ctx.arc(shot.x - Math.sign(shot.vx) * 4, shot.y, shot.r * 0.6, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    _drawEnemies(ctx) {
        for (const enemy of this.world.enemies) {
            if (!enemy.alive) {
                continue;
            }
            const bobY = Math.sin(enemy.bob) * 2;
            const ex = enemy.x;
            const ey = enemy.y + bobY;

            ctx.save();
            ctx.translate(ex + enemy.w / 2, ey + enemy.h / 2);
            ctx.scale(enemy.dir, 1);

            ctx.fillStyle = "#6a1f37";
            ctx.beginPath();
            ctx.roundRect(-17, -14, 34, 28, 8);
            ctx.fill();

            ctx.fillStyle = "#93284d";
            ctx.beginPath();
            ctx.arc(-8, -4, 5, 0, Math.PI * 2);
            ctx.arc(8, -4, 5, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#ffe6ef";
            ctx.beginPath();
            ctx.arc(-7, -4, 2.5, 0, Math.PI * 2);
            ctx.arc(7, -4, 2.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#2f0f1d";
            ctx.beginPath();
            ctx.arc(-6, -4, 1.1, 0, Math.PI * 2);
            ctx.arc(8, -4, 1.1, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#ffd2df";
            ctx.beginPath();
            ctx.moveTo(-10, 10);
            ctx.lineTo(-4, 4);
            ctx.lineTo(-1, 10);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(10, 10);
            ctx.lineTo(4, 4);
            ctx.lineTo(1, 10);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }
    }

    _drawPlayer(ctx) {
        const p = this.player;
        const frame = Math.floor(p.animTimer * 10) - Math.floor(Math.floor(p.animTimer * 10) / 4) * 4;
        const bounce = p.state === "idle" ? Math.sin(p.animTimer * 4) * 1.5 : 0;
        const legOffset = p.state === "run" ? (frame % 2 === 0 ? 4 : -4) : (p.state === "jump" ? -2 : 0);
        const armOffset = p.state === "run" ? (frame % 2 === 0 ? -3 : 3) : (p.state === "jump" ? -4 : 0);

        ctx.save();
        ctx.translate(p.x + p.w / 2, p.y + p.h / 2 + bounce);
        ctx.scale(p.facing, 1);

        ctx.fillStyle = "#ffd8d8";
        ctx.beginPath();
        ctx.moveTo(-12, -20);
        ctx.lineTo(-8, -32);
        ctx.lineTo(-2, -20);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(12, -20);
        ctx.lineTo(8, -32);
        ctx.lineTo(2, -20);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#ff5a5f";
        ctx.beginPath();
        ctx.roundRect(-14, -22, 28, 32, 10);
        ctx.fill();

        ctx.fillStyle = "#ff8a8f";
        ctx.beginPath();
        ctx.ellipse(0, -4, 8, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(-6, -12, 4, 0, Math.PI * 2);
        ctx.arc(6, -12, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#2f3555";
        ctx.beginPath();
        ctx.arc(-5 + (p.facing * 0.7), -11.5, 1.8, 0, Math.PI * 2);
        ctx.arc(7 + (p.facing * 0.7), -11.5, 1.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(255, 200, 210, 0.8)";
        ctx.beginPath();
        ctx.arc(-10, -6, 2.2, 0, Math.PI * 2);
        ctx.arc(10, -6, 2.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "#8e2730";
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (p.state === "jump") {
            ctx.arc(0, -2, 3.2, 0, Math.PI * 2);
        } else {
            ctx.arc(0, -3, 4.5, 0, Math.PI, false);
        }
        ctx.stroke();

        ctx.fillStyle = "#ff5a5f";
        ctx.beginPath();
        ctx.roundRect(-19, -10 + armOffset, 6, 15, 4);
        ctx.roundRect(13, -10 - armOffset, 6, 15, 4);
        ctx.fill();

        if (p.attackCooldown > 0.18) {
            ctx.fillStyle = "#ffb36b";
            ctx.beginPath();
            ctx.arc(20, -2, 5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = "#d93f45";
        ctx.beginPath();
        ctx.roundRect(-11, 8, 8, 10 + legOffset, 4);
        ctx.roundRect(3, 8, 8, 10 - legOffset, 4);
        ctx.fill();

        ctx.restore();
    }
}

const canvas = document.getElementById("gameCanvas");
const ui = {
    scoreValue: document.getElementById("scoreValue"),
    stateText: document.getElementById("stateText"),
    playBtn: document.getElementById("playBtn"),
    restartBtn: document.getElementById("restartBtn"),
    resumeBtn: document.getElementById("resumeBtn"),
    pauseBtn: document.getElementById("pauseBtn"),
    musicBtn: document.getElementById("musicBtn"),
    finalScore: document.getElementById("finalScore"),
    menuOverlay: document.getElementById("menuOverlay"),
    gameOverOverlay: document.getElementById("gameOverOverlay"),
    pauseOverlay: document.getElementById("pauseOverlay"),
    leftBtn: document.getElementById("leftBtn"),
    rightBtn: document.getElementById("rightBtn"),
    jumpBtn: document.getElementById("jumpBtn"),
    attackBtn: document.getElementById("attackBtn")
};

try {
    const game = new Game(canvas, ui);
    game.run();
} catch (error) {
    console.error("Failed to initialize game:", error);
}