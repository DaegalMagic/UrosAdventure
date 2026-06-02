// 우로스 플레이스홀더 SD 스프라이트 생성기 (트릭컬 우로스 특징 차용).
// 특징: 긴 흰머리 + 큰 머리(SD 2등신) + 목에 두른 백사(흰 곡선) + 손에 든 생선(청록).
// 64x64 프레임을 가로로 이어 assets/player/<state>.png 로 저장(가로 스트립 규격은
// .wiki/wiki/references/sprite-asset-spec.md 참고). 실제 아트가 나오기 전까지 쓰는
// 플레이스홀더이며, 수치/포즈를 바꿔 재생성할 수 있게 보관한다.
//   실행: 프로젝트 루트에서  node tools/gen-uros-sprites.js
const zlib = require("zlib");
const fs = require("fs");

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---- 프레임 그리기 도우미(64x64 픽셀 버퍼) ----
const F = 64;
function newFrame() { return Buffer.alloc(F * F * 4); } // 투명
function px(buf, x, y, c) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= F || y >= F) return;
  const i = (y * F + x) * 4;
  // 알파 블렌딩(겹쳐 그릴 때 자연스럽게)
  const a = c[3] / 255, ia = 1 - a;
  buf[i] = c[0] * a + buf[i] * ia;
  buf[i + 1] = c[1] * a + buf[i + 1] * ia;
  buf[i + 2] = c[2] * a + buf[i + 2] * ia;
  buf[i + 3] = Math.min(255, c[3] + buf[i + 3] * ia);
}
function rect(buf, x, y, w, h, c) {
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) px(buf, x + xx, y + yy, c);
}
function disc(buf, cx, cy, r, c) {
  for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++)
    if (xx * xx + yy * yy <= r * r) px(buf, cx + xx, cy + yy, c);
}

// ---- 색 팔레트 (우로스) ----
const HAIR = [240, 242, 248, 255];   // 흰 머리
const HAIR_SH = [205, 210, 225, 255]; // 머리 음영
const SKIN = [255, 224, 200, 255];   // 피부
const SKIN_SH = [232, 196, 170, 255];
const SNAKE = [250, 250, 255, 255];  // 백사
const SNAKE_EYE = [220, 90, 110, 255];
const FISH = [90, 200, 200, 255];    // 생선(청록)
const LEAF = [120, 200, 110, 255];   // 잎사귀
const EYE = [70, 80, 110, 255];
const OUT = [40, 45, 70, 255];       // 외곽 음영

// SD 캐릭터 한 프레임 그리기.
//   legPhase: 다리 위치(걷기), armAngle: 팔(생선) 각도(공격), bob: 몸 상하 오프셋,
//   crouch: 웅크림(점프 예비/대시), dead: 사망(쓰러짐).
function drawUros(opts) {
  const o = Object.assign({ legPhase: 0, armSwing: 0, bob: 0, crouch: 0, dead: false }, opts);
  const buf = newFrame();
  const cx = 32;
  const groundY = 62; // 발이 닿는 y(칸 하단 근처)

  if (o.dead) {
    // 쓰러진 자세: 가로로 누운 몸 + 머리
    rect(buf, 14, 52, 30, 9, SKIN);       // 누운 몸통
    disc(buf, 46, 52, 9, SKIN);            // 머리
    disc(buf, 46, 50, 10, HAIR);           // 머리카락
    disc(buf, 46, 52, 8, SKIN);
    rect(buf, 10, 54, 30, 5, HAIR);        // 흘러내린 머리
    px(buf, 49, 52, EYE); // x_x 눈
    px(buf, 43, 52, EYE);
    return buf;
  }

  const by = o.bob - o.crouch; // 몸 전체 세로 오프셋

  // 다리 (걷기: legPhase로 앞뒤 벌림)
  const lp = o.legPhase;
  rect(buf, cx - 7 + lp, groundY - 10 + by + o.crouch, 5, 10 - o.crouch, SKIN_SH); // 왼다리
  rect(buf, cx + 2 - lp, groundY - 10 + by + o.crouch, 5, 10 - o.crouch, SKIN);     // 오른다리

  // 몸통 (피부 + 잎사귀)
  const torsoY = groundY - 22 + by;
  rect(buf, cx - 8, torsoY, 16, 14, SKIN);
  rect(buf, cx - 8, torsoY, 16, 2, SKIN_SH);
  disc(buf, cx, torsoY + 9, 3, LEAF); // 잎사귀(가슴 가리개)

  // 목에 두른 백사 (어깨를 감는 흰 곡선 + 머리)
  rect(buf, cx - 10, torsoY - 1, 20, 3, SNAKE);
  disc(buf, cx + 11, torsoY + 1, 3, SNAKE); // 뱀 머리(오른어깨)
  px(buf, cx + 12, torsoY + 1, SNAKE_EYE);

  // 팔 + 생선 (armSwing: 0=내림, 양수=앞으로 휘두름)
  const ax = cx + 8 + o.armSwing;
  const ay = torsoY + 5 - o.armSwing;
  rect(buf, cx + 6, torsoY + 3, 4, 6, SKIN); // 팔
  disc(buf, ax, ay, 4, FISH);                 // 생선
  disc(buf, ax + 3, ay, 2, FISH);             // 꼬리
  px(buf, ax - 1, ay - 1, OUT);               // 생선 눈

  // 큰 머리 (SD) + 긴 흰머리
  const headY = torsoY - 12;
  disc(buf, cx, headY + 8, 12, HAIR);         // 뒤 머리카락(크게)
  disc(buf, cx, headY + 9, 10, SKIN);         // 얼굴
  rect(buf, cx - 12, headY + 6, 5, 24, HAIR); // 왼쪽 긴머리
  rect(buf, cx + 7, headY + 6, 5, 24, HAIR);  // 오른쪽 긴머리
  rect(buf, cx - 11, headY, 22, 6, HAIR);     // 앞머리
  rect(buf, cx - 11, headY + 5, 22, 2, HAIR_SH);
  // 눈
  px(buf, cx - 4, headY + 10, EYE); px(buf, cx - 3, headY + 10, EYE);
  px(buf, cx + 3, headY + 10, EYE); px(buf, cx + 4, headY + 10, EYE);

  return buf;
}

// 가로 스트립 만들기: frames = [opts,...]
function strip(frames) {
  const w = F * frames.length;
  const out = Buffer.alloc(w * F * 4);
  frames.forEach((opts, fi) => {
    const fb = drawUros(opts);
    for (let y = 0; y < F; y++)
      fb.copy(out, (y * w + fi * F) * 4, y * F * 4, (y + 1) * F * 4);
  });
  return encodePng(w, F, out);
}

fs.mkdirSync("assets/player", { recursive: true });

// idle: 살짝 호흡(bob)
fs.writeFileSync("assets/player/idle.png", strip([
  { bob: 0 }, { bob: -1 }, { bob: 0 }, { bob: 1 },
]));
// walk: 다리 교차 + 약간 bob
fs.writeFileSync("assets/player/walk.png", strip([
  { legPhase: 3, bob: 0 }, { legPhase: 0, bob: -1 },
  { legPhase: -3, bob: 0 }, { legPhase: 0, bob: -1 },
]));
// jump: 웅크림→뻗음
fs.writeFileSync("assets/player/jump.png", strip([
  { crouch: 3 }, { crouch: -2, legPhase: 2 },
]));
// attack: 생선 뒤로→앞으로 휘두름
fs.writeFileSync("assets/player/attack.png", strip([
  { armSwing: -3 }, { armSwing: 2 }, { armSwing: 8 }, { armSwing: 4 },
]));
// dash: 몸 앞으로 기울임(다리 벌림)
fs.writeFileSync("assets/player/dash.png", strip([
  { legPhase: 5, crouch: 1 }, { legPhase: 5, crouch: 1 },
]));
// dead
fs.writeFileSync("assets/player/dead.png", strip([
  { dead: true }, { dead: true },
]));

console.log("uros sprites written to assets/player/");
