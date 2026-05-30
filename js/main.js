// 우로스의 모험 - 게임 부트스트랩
// 최소한의 게임 루프와 조작 가능한 플레이어 한 명만 갖춘 뼈대입니다.

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const player = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  size: 24,
  speed: 180, // 초당 픽셀
};

const keys = new Set();

window.addEventListener("keydown", (e) => {
  keys.add(e.key);
  if (e.key.startsWith("Arrow")) e.preventDefault();
});
window.addEventListener("keyup", (e) => keys.delete(e.key));

// 터치/클릭으로 해당 위치를 향해 이동
let target = null;
function pointerToCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}
canvas.addEventListener("pointerdown", (e) => {
  target = pointerToCanvas(e);
});

function update(dt) {
  let dx = 0;
  let dy = 0;
  if (keys.has("ArrowLeft")) dx -= 1;
  if (keys.has("ArrowRight")) dx += 1;
  if (keys.has("ArrowUp")) dy -= 1;
  if (keys.has("ArrowDown")) dy += 1;

  if (dx === 0 && dy === 0 && target) {
    const tx = target.x - player.x;
    const ty = target.y - player.y;
    const dist = Math.hypot(tx, ty);
    if (dist > 2) {
      dx = tx / dist;
      dy = ty / dist;
    } else {
      target = null;
    }
  }

  const len = Math.hypot(dx, dy) || 1;
  player.x += (dx / len) * player.speed * dt;
  player.y += (dy / len) * player.speed * dt;

  // 화면 경계 안에 가두기
  const half = player.size / 2;
  player.x = Math.max(half, Math.min(canvas.width - half, player.x));
  player.y = Math.max(half, Math.min(canvas.height - half, player.y));
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 플레이어
  ctx.fillStyle = "#6cc6ff";
  ctx.fillRect(
    player.x - player.size / 2,
    player.y - player.size / 2,
    player.size,
    player.size
  );
}

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
