
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const W = 440, H = 600;
const R = 18;
const DX = R * 2;
const DY = R * Math.sqrt(3);
const COLS = 11;
const MAX_LEVEL = 20;

const COLORS = [
    "#ff477e", "#24c9ff", "#ffd43b",
    "#a66bff", "#36e6a0", "#ff963d"
];

const $ = id => document.getElementById(id);

let grid = new Map();
let particles = [];
let floatingTexts = [];
let stars = [];

let score = 0;
let best = Number(localStorage.getItem("bubbleBest")) || 0;
let level = 1;
let shots = 0;
let running = false;
let currentColor;
let nextColor;
let projectile = null;
let aim = { x: 0, y: -1 };
let targetPercent = 0;
let soundEnabled = true;
let musicEnabled = false;
let audio = null;
let musicOsc = [];
let lastTime = 0;
let lastShotTime = 0;

const shooter = { x: W / 2, y: H - 38 };

// ---------- AUDIO ENGINE ----------

function initAudio() {
    if (!audio) {
        audio = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (audio.state === "suspended") audio.resume();
}

function tone(freq, duration, type = "sine", volume = .08) {
    if (!soundEnabled) return;

    initAudio();

    const osc = audio.createOscillator();
    const gain = audio.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, audio.currentTime);

    gain.gain.setValueAtTime(volume, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(
        .001, audio.currentTime + duration
    );

    osc.connect(gain);
    gain.connect(audio.destination);

    osc.start();
    osc.stop(audio.currentTime + duration);
}

function shootSound() {
    tone(350, .12, "triangle", .07);
}

function popSound(count) {
    tone(420 + count * 65, .22, "sine", .12);
    setTimeout(() => tone(650 + count * 40, .12, "triangle", .07), 65);
}

function musicToggle() {
    initAudio();

    musicEnabled = !musicEnabled;
    $("musicBtn").textContent = musicEnabled ? "♫ Music ON" : "♫ Music";

    if (musicEnabled) {
        const osc = audio.createOscillator();
        const gain = audio.createGain();

        osc.type = "sine";
        osc.frequency.value = 110;
        gain.gain.value = .018;

        osc.connect(gain);
        gain.connect(audio.destination);
        osc.start();

        musicOsc = [osc, gain];
    } else {
        if (musicOsc.length) {
            musicOsc[1].gain.setTargetAtTime(0, audio.currentTime, .1);
            musicOsc[0].stop(audio.currentTime + .5);
            musicOsc = [];
        }
    }
}

// ---------- GRID SYSTEM ----------

function key(r, c) {
    return `${r},${c}`;
}

function position(r, c) {
    return {
        x: R + c * DX + (r % 2) * R,
        y: R + r * DY
    };
}

function getNeighbors(r, c) {
    const odd = r % 2 === 1;

    return [
        [r, c - 1],
        [r, c + 1],
        [r - 1, odd ? c : c - 1],
        [r - 1, odd ? c + 1 : c],
        [r + 1, odd ? c : c - 1],
        [r + 1, odd ? c + 1 : c]
    ].filter(([nr, nc]) =>
        nr >= 0 && nr < 18 && nc >= 0 && nc < COLS
    );
}

function addBubble(r, c, color) {
    if (r < 0 || r >= 18 || c < 0 || c >= COLS) return;

    const p = position(r, c);
    grid.set(key(r, c), {
        r, c, x: p.x, y: p.y, color,
        scale: 0,
        targetScale: 1
    });
}

function createLevel() {
    grid.clear();
    particles = [];
    floatingTexts = [];
    projectile = null;
    shots = 0;

    // 30 LEVELS - BALANCED DIFFICULTY

    let colorCount;
    let rows;

    if (level <= 5) {
        colorCount = 3;
        rows = 3 + Math.floor((level - 1) / 3);
    } 
    else if (level <= 10) {
        colorCount = 3;
        rows = 4 + Math.floor((level - 6) / 3);
    } 
    else if (level <= 15) {
        colorCount = 4;
        rows = 5 + Math.floor((level - 11) / 3);
    } 
    else if (level <= 20) {
        colorCount = 4;
        rows = 6 + Math.floor((level - 16) / 3);
    } 
    else if (level <= 25) {
        colorCount = 5;
        rows = 7 + Math.floor((level - 21) / 3);
    } 
    else {
        colorCount = 6;
        rows = 8 + Math.floor((level - 26) / 2);
    }

    const available = COLORS.slice(0, colorCount);

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < COLS; c++) {

            // Easy levels have fewer gaps
            if (Math.random() > 0.05) {
                const color = available[
                    Math.floor(Math.random() * available.length)
                ];

                addBubble(r, c, color);
            }
        }
    }

    currentColor = randomColor();
    nextColor = randomColor();

    updateUI();
}

function randomColor() {
    return COLORS[
        Math.floor(Math.random() * Math.min(3 + Math.floor((level - 1) / 3), 6))
    ];
}

// ---------- DRAWING ----------

function drawBubble(x, y, color, scale = 1) {
    if (scale <= 0) return;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    const gradient = ctx.createRadialGradient(-7, -9, 1, 0, 0, R);

    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(.16, color);
    gradient.addColorStop(.72, color);
    gradient.addColorStop(1, "#15152c");

    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.strokeStyle = "#ffffff9c";
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Shiny reflection
    ctx.beginPath();
    ctx.ellipse(-7, -8, 5, 3, -.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffffcc";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(7, 8, 2, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff50";
    ctx.fill();

    ctx.restore();
}

function drawBackground() {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#142859");
    bg.addColorStop(1, "#10132f");

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    stars.forEach(s => {
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.globalAlpha = 1;

    // Bottom danger line
    ctx.setLineDash([6, 7]);
    ctx.strokeStyle = "#ff6d9b65";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H - 90);
    ctx.lineTo(W, H - 90);
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawAim() {
    if (!running || projectile) return;

    ctx.save();

    const distance = 300;
    const spacing = 28;

    // Red glowing aiming dots
    for (let d = 15; d <= distance; d += spacing) {

        const x = shooter.x + aim.x * d;
        const y = shooter.y + aim.y * d;

        // Glow effect
        ctx.shadowColor = "#ff0000";
        ctx.shadowBlur = 18;

        // Main red dot
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#ff1717";
        ctx.fill();

        // Bright center
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(x - 1, y - 1, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = "#ffaaaa";
        ctx.fill();
    }

    ctx.restore();
}

function drawParticles() {
    particles.forEach(p => {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.globalAlpha = 1;
}

function drawTexts() {
    floatingTexts.forEach(t => {
        ctx.globalAlpha = Math.max(0, t.life / 50);
        ctx.fillStyle = "#ffe76a";
        ctx.font = "bold 20px Arial";
        ctx.textAlign = "center";
        ctx.fillText(t.text, t.x, t.y);
    });

    ctx.globalAlpha = 1;
}

function render() {
    ctx.clearRect(0, 0, W, H);

    drawBackground();

    for (const b of grid.values()) {
        drawBubble(b.x, b.y, b.color, b.scale);
    }

    drawAim();

    drawBubble(
        shooter.x, shooter.y,
        currentColor, 1
    );

    if (projectile) {
        drawBubble(
            projectile.x, projectile.y,
            projectile.color, 1
        );
    }

    drawParticles();
    drawTexts();
}

// ---------- PARTICLE EXPLOSIONS ----------

function explode(x, y, color, amount = 13) {
    for (let i = 0; i < amount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 5;

        particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color,
            size: 2 + Math.random() * 4,
            life: 30 + Math.random() * 15,
            maxLife: 45
        });
    }
}

function updateEffects() {
    particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += .08;
        p.vx *= .98;
        p.life--;
    });

    particles = particles.filter(p => p.life > 0);

    floatingTexts.forEach(t => {
        t.y -= .8;
        t.life--;
    });

    floatingTexts = floatingTexts.filter(t => t.life > 0);

    stars.forEach(s => {
        s.alpha += s.direction * .012;
        if (s.alpha > .8 || s.alpha < .15) {
            s.direction *= -1;
        }
    });

    for (const b of grid.values()) {
        b.scale += (b.targetScale - b.scale) * .2;
    }
}

// ---------- MATCHING SYSTEM ----------

function findGroup(startR, startC, color) {
    const stack = [[startR, startC]];
    const visited = new Set();
    const group = [];

    while (stack.length) {
        const [r, c] = stack.pop();
        const k = key(r, c);

        if (visited.has(k)) continue;
        visited.add(k);

        const bubble = grid.get(k);
        if (!bubble || bubble.color !== color) continue;

        group.push(bubble);

        getNeighbors(r, c).forEach(([nr, nc]) => {
            if (!visited.has(key(nr, nc))) {
                stack.push([nr, nc]);
            }
        });
    }

    return group;
}

function removeFloating() {
    const connected = new Set();
    const stack = [];

    for (const bubble of grid.values()) {
        if (bubble.r === 0) stack.push(bubble);
    }

    while (stack.length) {
        const b = stack.pop();
        const k = key(b.r, b.c);

        if (connected.has(k)) continue;
        connected.add(k);

        getNeighbors(b.r, b.c).forEach(([nr, nc]) => {
            const neighbor = grid.get(key(nr, nc));
            if (neighbor && !connected.has(key(nr, nc))) {
                stack.push(neighbor);
            }
        });
    }

    let removed = 0;

    for (const [k, b] of grid) {
        if (!connected.has(k)) {
            explode(b.x, b.y, b.color, 7);
            grid.delete(k);
            removed++;
        }
    }

    if (removed) {
        score += removed * 15;
        floatingTexts.push({
            x: W / 2, y: H / 2,
            text: `+${removed * 15} BONUS!`,
            life: 55
        });
    }
}

function popGroup(group) {
    if (group.length < 3) return;

    group.forEach(b => {
        explode(b.x, b.y, b.color, 15);
        grid.delete(key(b.r, b.c));
    });

    score += group.length * 10;

    if (group.length >= 5) {
        score += 50;
        floatingTexts.push({
            x: W / 2,
            y: H - 160,
            text: "🔥 COMBO BONUS +50",
            life: 65
        });
    }

    popSound(group.length);
    removeFloating();

    floatingTexts.push({
        x: W / 2,
        y: H - 125,
        text: `+${group.length * 10}`,
        life: 50
    });

    updateUI();
}

// ---------- SHOOTING ----------

function findEmptyCell(x, y) {
    let bestCell = null;
    let bestDistance = Infinity;

    // Search cells near the projectile.
    for (let r = 0; r < 18; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid.has(key(r, c))) continue;

            const p = position(r, c);
            const distance = Math.hypot(p.x - x, p.y - y);

            if (distance < bestDistance) {
                bestDistance = distance;
                bestCell = { r, c };
            }
        }
    }

    return bestCell;
}

function attachProjectile() {
    if (!projectile) return;

    const cell = findEmptyCell(projectile.x, projectile.y);

    if (!cell) {
        projectile = null;
        gameOver();
        return;
    }

    addBubble(cell.r, cell.c, projectile.color);

 const powerUsed = activePower;

if (powerUsed) {
    applyPower(cell, projectile.color);
    activePower = null;
} else {
    const group = findGroup(cell.r, cell.c, projectile.color);

    if (group.length >= 3) {
        popGroup(group);
    }
}

    projectile = null;
    shots++;

    if (grid.size === 0) {
        if (level === MAX_LEVEL) {
            winGame();
        } else {
            level++;
            showOverlay(
                "🎉 LEVEL COMPLETE!",
                "Amazing! Ready for the next challenge?",
                "NEXT LEVEL"
            );
        }
        return;
    }

    if (shots % 7 === 0) {
        addNewRow();
    }

    if ([...grid.values()].some(b => b.y > H - 105)) {
        gameOver();
        return;
    }

    currentColor = nextColor;
    nextColor = randomColor();

    updateUI();
}

function addNewRow() {
    for (const b of grid.values()) {
        b.r++;
        const p = position(b.r, b.c);
        b.x = p.x;
        b.y = p.y;
    }

    const shifted = [...grid.values()];
    grid.clear();

    shifted.forEach(b => grid.set(key(b.r, b.c), b));

    const colorCount = Math.min(
        3 + Math.floor((level - 1) / 3), 6
    );

    for (let c = 0; c < COLS; c++) {
        if (Math.random() > .15) {
            addBubble(
                0, c,
                COLORS[Math.floor(Math.random() * colorCount)]
            );
        }
    }
}

function launchBubble() {
    if (!running || projectile) return;

    initAudio();

    projectile = {
        x: shooter.x,
        y: shooter.y,
        vx: aim.x * 9,
        vy: aim.y * 9,
        color: currentColor
    };

    shootSound();
}

function updateProjectile(dt) {
    if (!projectile) return;

    const p = projectile;
    const movement = dt / 16.67;

    p.x += p.vx * movement;
    p.y += p.vy * movement;

    if (p.x < R) {
        p.x = R;
        p.vx = Math.abs(p.vx);
    }

    if (p.x > W - R) {
        p.x = W - R;
        p.vx = -Math.abs(p.vx);
    }

    let hit = p.y <= R;

    for (const b of grid.values()) {
        if (Math.hypot(p.x - b.x, p.y - b.y) < DX - 2) {
            hit = true;
            break;
        }
    }

    if (hit) attachProjectile();
}

// ---------- INPUT ----------

function updateAim(e) {
    const rect = canvas.getBoundingClientRect();

    const x = (e.clientX - rect.left) * W / rect.width;
    const y = (e.clientY - rect.top) * H / rect.height;

    let dx = x - shooter.x;
    let dy = y - shooter.y;

    let angle = Math.atan2(dy, dx);

    angle = Math.max(-Math.PI + .15, Math.min(-.15, angle));

    aim.x = Math.cos(angle);
    aim.y = Math.sin(angle);
}

canvas.addEventListener("pointermove", e => {
    updateAim(e);
});

canvas.addEventListener("pointerdown", e => {
    e.preventDefault();

    if (!running || projectile) return;

    updateAim(e);
    launchBubble();
});

// ---------- UI ----------

function updateUI() {
    $("level").textContent = level;
    $("score").textContent = score;
    $("best").textContent = best;

    $("nextBubble").style.background = nextColor || COLORS[0];

    const total = Math.max(1, Math.min(4 + Math.floor(level / 2), 10) * COLS);
    const progress = Math.min(100, Math.max(0, (1 - grid.size / total) * 100));

    $("progressFill").style.width = progress + "%";
    $("progressText").textContent = Math.round(progress) + "%";

    if (score > best) {
        best = score;
        localStorage.setItem("bubbleBest", best);
        $("best").textContent = best;
    }
}

function showOverlay(title, description, buttonText) {
    running = false;
    $("message").textContent = title;
    $("messageText").textContent = description;
    $("startBtn").textContent = buttonText;
    $("overlay").style.display = "flex";
}

function gameOver() {
    showOverlay(
        "💥 GAME OVER!",
        `Your score: ${score} • Try again!`,
        "PLAY AGAIN"
    );
}

function winGame() {
    showOverlay(
        "🏆 YOU ARE A CHAMPION!",
        `Congratulations! You completed all 30 levels! Score: ${score}`,
        "PLAY AGAIN"
    );
}
function startGame() {
    initAudio();

    const title = $("message").textContent;

    if (title.includes("LEVEL COMPLETE")) {

        if (level < 30) {
            level++;
            createLevel();
        } else {
            winGame();
            return;
        }

    } else if (
        title.includes("GAME OVER") ||
        title.includes("CHAMPION")
    ) {
        level = 1;
        score = 0;
        createLevel();
    }

    running = true;
    $("overlay").style.display = "none";
    updateUI();
}

$("startBtn").addEventListener("click", startGame);

$("restartBtn").addEventListener("click", () => {
    level = 1;
    score = 0;
    projectile = null;
    createLevel();
    running = true;
    $("overlay").style.display = "none";
});

$("soundBtn").addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    $("soundBtn").textContent = soundEnabled ? "🔊 Sound" : "🔇 Sound";
    if (soundEnabled) tone(600, .1);
});

$("musicBtn").addEventListener("click", musicToggle);

// ---------- MAIN ANIMATION LOOP ----------

function animate(time = 0) {
    const dt = Math.min(40, time - (lastTime || time)) || 16.67;
    lastTime = time;

    updateProjectile(dt);
    updateEffects();
    render();

    requestAnimationFrame(animate);
}

// ---------- INITIALIZATION ----------

function init() {
    for (let i = 0; i < 40; i++) {
        stars.push({
            x: Math.random() * W,
            y: Math.random() * H,
            size: Math.random() * 1.8 + .3,
            alpha: Math.random() * .7,
            direction: Math.random() > .5 ? 1 : -1
        });
    }

    createLevel();
    $("best").textContent = best;

    requestAnimationFrame(animate);
}

init();

let activePower = null;

function activatePower(type) {
    if (!running || projectile) return;

    initAudio();
    activePower = type;

    if (type === "bomb") {
        soundEffect(200, 50, 0.4, "sawtooth", 0.15);
    }

    if (type === "fire") {
        soundEffect(250, 900, 0.3, "sawtooth", 0.12);
    }

    if (type === "rainbow") {
        soundEffect(500, 1500, 0.4, "sine", 0.12);
    }

    if (type === "laser") {
        soundEffect(1200, 100, 0.3, "sawtooth", 0.12);
    }

    floatingTexts.push({
        x: W / 2,
        y: H - 160,
        text: type.toUpperCase() + " READY!",
        life: 60
    });
}

function applyPower(cell, color) {
    if (!activePower) return;

    const power = activePower;
    activePower = null;

    if (power === "rainbow") {
        const bubble = grid.get(key(cell.r, cell.c));
        if (bubble) {
            const neighbors = getNeighbors(cell.r, cell.c);
            const matching = neighbors
                .map(([r, c]) => grid.get(key(r, c)))
                .filter(Boolean);

            if (matching.length >= 2) {
                const targetColor = matching[0].color;
                const group = [];

                for (const b of matching) {
                    if (b.color === targetColor) {
                        group.push(...findGroup(b.r, b.c, targetColor));
                    }
                }

                const unique = [...new Set(group)];
                if (unique.length >= 2) {
                    popGroup(unique);
                }
            }
        }
    }

    if (power === "bomb") {
        const center = position(cell.r, cell.c);

        for (const [k, b] of grid) {
            if (Math.hypot(b.x - center.x, b.y - center.y) < 75) {
                explode(b.x, b.y, b.color, 18);
                grid.delete(k);
                score += 20;
            }
        }

        updateUI();
    }

    if (power === "fire") {
        const bubble = grid.get(key(cell.r, cell.c));

        if (bubble) {
            const column = cell.c;

            for (const [k, b] of grid) {
                if (Math.abs(b.c - column) <= 1) {
                    explode(b.x, b.y, "#ff792f", 12);
                    grid.delete(k);
                    score += 20;
                }
            }
        }

        updateUI();
    }

    if (power === "laser") {
        const bubble = grid.get(key(cell.r, cell.c));

        if (bubble) {
            const row = cell.r;

            for (const [k, b] of grid) {
                if (b.r === row) {
                    explode(b.x, b.y, "#39eaff", 14);
                    grid.delete(k);
                    score += 20;
                }
            }
        }

        updateUI();
    }

    removeFloating();
}
