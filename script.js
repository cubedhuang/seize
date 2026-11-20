const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// [min radius, name, color variants]
const TIERS = [
  [0, "Asteroid", ["#9a8f84", "#8a6a55", "#6f7378", "#b8c4c8"]],
  [40, "Planet", ["#4aa8ff", "#5ccf7a", "#d9603b", "#d9b77a", "#a77bd9"]],
  [160, "Star", ["#ffd84a", "#ff7a4a", "#fff4e0", "#8fc4ff"]],
  [640, "Black Hole", ["#000"]],
];
const tier = (r) => TIERS.findLast((t) => r >= t[0]);

let player, bodies, dead, camR, best;
let time = 0; // seconds
const mouse = { x: innerWidth / 2, y: innerHeight / 2 };

function reset() {
  player = { x: 0, y: 0, r: 10, vx: 0, vy: 0, seed: Math.random() };
  camR = best = player.r;
  bodies = [player];
  dead = false;
  while (bodies.length < COUNT) spawn(0.3);
}

const scale = (r = camR) => Math.min(canvas.width, canvas.height) / (r * 30);
const viewRadius = () =>
  Math.hypot(canvas.width, canvas.height) / 2 / scale(player.r);

const COUNT = 50;
const EFFICIENCY = 0.3; // fraction of eaten mass that's kept
const GIANT_CHANCE = 0.03;
const MAX_GIANTS = 3;
const GIANT_GAP = 1; // view radius count

function spawn(minDist = 1, allowGiant = true) {
  const giant =
    allowGiant &&
    minDist === 1 &&
    bodies.filter((b) => b.giant).length < MAX_GIANTS &&
    Math.random() < GIANT_CHANCE;

  const nextNextTier = TIERS[TIERS.indexOf(tier(player.r)) + 2];
  const maxGiant = Math.min(player.r * 12, nextNextTier?.[0] ?? Infinity);
  const r = giant
    ? player.r * 4 + Math.random() * (maxGiant - player.r * 4)
    : player.r * (0.2 + Math.random()); // mostly food
  const heading = Math.atan2(
    mouse.y - canvas.height / 2,
    mouse.x - canvas.width / 2,
  );
  const a = giant
    ? heading + (Math.random() - 0.5) * 0.3
    : Math.random() * Math.PI * 2;
  const d = viewRadius() * (minDist + Math.random() * (1.5 - minDist)) + r * 3; // r * 3 keeps accretion disks off-screen too
  const x = player.x + Math.cos(a) * d;
  const y = player.y + Math.sin(a) * d;

  const crowded = bodies.some(
    (b) =>
      b.giant &&
      Math.hypot(b.x - x, b.y - y) < (b.r + r) * 3 + viewRadius() * GIANT_GAP,
  );
  if (giant && crowded) return spawn(minDist, false);

  const drift = player.r * 3 * Math.min(1, player.r / r);

  bodies.push({
    x,
    y,
    r,
    giant,
    vx: (Math.random() - 0.5) * drift,
    vy: (Math.random() - 0.5) * drift,
    seed: Math.random(),
  });
}

function update(dt) {
  if (!dead) {
    camR += (player.r - camR) * (1 - Math.exp(-4 * dt));

    const s = scale();
    const dx = (mouse.x - canvas.width / 2) / s;
    const dy = (mouse.y - canvas.height / 2) / s;
    const dist = Math.hypot(dx, dy);
    if (dist > player.r * 0.5) {
      const speed = player.r * 7 * dt;
      player.x += (dx / dist) * speed;
      player.y += (dy / dist) * speed;
    }

    while (bodies.length < COUNT) spawn();
  }

  for (const b of bodies) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const b = bodies[j];
      if (a.eater || b.eater) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) > a.r + b.r) continue;
      const [big, small] = a.r >= b.r ? [a, b] : [b, a];
      small.eater = big;
      if (small === player) dead = true;
    }
  }

  const k = 1 - Math.exp(-10 * dt);
  for (const b of bodies) {
    if (!b.eater) continue;
    while (b.eater.eater) b.eater = b.eater.eater;
    const e = b.eater;
    b.x += (e.x - b.x) * k;
    b.y += (e.y - b.y) * k;
    const newR = b.r * (1 - k);
    e.r = Math.sqrt(e.r ** 2 + (b.r ** 2 - newR ** 2) * EFFICIENCY);
    b.r = newR;
  }
  best = Math.max(best, player.r);

  const view = viewRadius();
  bodies = bodies.filter((b) => {
    if (b.eater && b.r < b.eater.r * 0.02) return false; // fully digested
    if (dead || b === player) return true;
    const d = Math.hypot(b.x - player.x, b.y - player.y);
    return d < view * 1.6 + b.r * 3; // despawn
  });
}

function drawAccretionDisk(x, y, r) {
  const outer = r * (3 + Math.sin(time * 3) * 0.2);
  const glow = ctx.createRadialGradient(x, y, r, x, y, outer);
  glow.addColorStop(0, "rgba(255, 140, 40, 0.95)");
  glow.addColorStop(0.25, "rgba(220, 40, 90, 0.5)");
  glow.addColorStop(1, "rgba(90, 0, 140, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, outer, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 210, 150, 0.7)";
  ctx.lineWidth = r * 0.06;
  for (let i = 0; i < 8; i++) {
    const ringR = r * (1.2 + i * 0.2);
    const a = (time * 6) / (1 + i) + i * 2.4;
    ctx.beginPath();
    ctx.arc(x, y, ringR, a, a + 1.2);
    ctx.stroke();
  }
}

function drawStarGlow(x, y, r, color, phase) {
  const outer = r * (2.2 + Math.sin(time * 2 + phase) * 0.15);
  const glow = ctx.createRadialGradient(x, y, r * 0.8, x, y, outer);
  glow.addColorStop(0, color + "cc");
  glow.addColorStop(1, color + "00");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, outer, 0, Math.PI * 2);
  ctx.fill();
}

function drawBody({ x, y, r, seed }, outline) {
  const [, name, colors] = tier(r);
  const color = colors[Math.floor(seed * colors.length)];
  if (name === "Star") drawStarGlow(x, y, r, color, seed * Math.PI * 2);
  if (name === "Black Hole") drawAccretionDisk(x, y, r);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  if (!outline) return;
  [ctx.strokeStyle, ctx.lineWidth, ctx.globalAlpha] = outline;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function draw() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  const s = scale();

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(s, s);
  ctx.translate(-player.x, -player.y);
  const px = 1 / s; // one screen pixel in world units
  const pulse = 0.55 + 0.35 * Math.sin(time * 5);
  for (const b of bodies) {
    let outline = null;
    if (b === player) outline = ["#fff", 2 * px, 0.9];
    else if (b.r > player.r) outline = ["#ff3b3b", 2.5 * px, pulse];
    drawBody(b, outline);
  }
  ctx.restore();

  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = 'bold 28px "IBM Plex Sans"';
  ctx.fillText(tier(best)[1], canvas.width / 2, 40);
  ctx.font = '16px "IBM Plex Sans"';
  ctx.fillText("mass " + Math.round(best ** 2), canvas.width / 2, 64);
  if (dead) {
    ctx.font = 'bold 48px "IBM Plex Sans"';
    ctx.fillText("SEIZED!", canvas.width / 2, canvas.height / 2);
    ctx.font = '20px "IBM Plex Sans"';
    ctx.fillText("click to restart", canvas.width / 2, canvas.height / 2 + 36);
  }
}

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.1); //seconds
  last = now;
  time += dt;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

addEventListener("mousemove", (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});
addEventListener("click", () => dead && reset());

reset();
requestAnimationFrame(loop);
