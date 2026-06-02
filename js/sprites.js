// 우로스의 모험 - 스프라이트/애니메이션 시스템
//
// 빌드 도구가 없으므로(정적 캔버스) 외부 라이브러리·atlas JSON 없이 가장 단순한
// 형식을 쓴다: "한 PNG = 한 애니메이션, 프레임을 가로로 일렬"(가로 스트립).
//   - 경로 규칙: assets/<액터>/<상태>.png  (예: assets/player/walk.png)
//   - 프레임 크기: 64x64 고정(SPRITE_FRAME). 프레임 수 = 이미지 너비 / 64 (자동).
//   - 캐릭터는 64x64 칸 안에 그린다(이동 박스 45x60 + 여백; 발은 칸 하단 기준).
//
// 핵심 원칙: 에셋이 없어도 게임은 그대로 돌아간다. 이미지가 아직 로드되지 않았거나
// 파일이 없으면 그리기 함수가 false를 반환하고, 호출부(render)는 기존 fillRect
// 폴백으로 그린다. 그래서 PNG를 하나씩 넣을 때마다 그 부분만 스프라이트로 바뀐다.

const SPRITE_FRAME = 64; // 프레임 한 변(px). 가로 스트립의 프레임 분할 기준
const SPRITE_BASE_PATH = "assets"; // 에셋 루트 폴더

// ---- 에셋 저장소: 경로별 이미지 lazy 로드 ----
// get(path)를 처음 부르면 로드를 시작하고, 로드가 끝나기 전엔 null을 돌려준다(폴백
// 유도). 같은 경로는 한 번만 로드한다. 파일이 없으면(404) failed로 표시하고 계속
// null을 돌려준다 — 콘솔 에러는 나지만 게임은 안 멈춘다.
const AssetStore = (() => {
  const cache = new Map(); // path -> { img, ready, failed }

  function get(path) {
    let entry = cache.get(path);
    if (!entry) {
      const img = new Image();
      entry = { img, ready: false, failed: false };
      img.onload = () => { entry.ready = true; };
      img.onerror = () => { entry.failed = true; };
      img.src = path;
      cache.set(path, entry);
    }
    return entry.ready ? entry.img : null; // 준비 안 됐으면 null(폴백)
  }

  return { get };
})();

// ---- 애니메이션 정의(데이터) ----
// 액터별로 상태→애니메이션 스펙을 둔다. 스펙:
//   file: 상태 PNG 파일명(확장자 제외). 경로는 assets/<actor>/<file>.png
//   mode: "loop"(반복) | "once"(한 번) | "timed"(외부 길이에 맞춤; 공격용)
//   fps:  loop/once의 재생 속도(프레임/초). timed는 무시(길이로 분배).
// timed는 공격(windup→active→recovery)처럼 "정해진 총 길이" 안에서 전체 프레임을
// 고르게 재생한다 — 예고 동작이 windup 동안 정확히 끝나 패링 타이밍과 그림이 맞는다.
const ANIM_SPECS = {
  player: {
    idle: { file: "idle", mode: "loop", fps: 6 },
    walk: { file: "walk", mode: "loop", fps: 10 },
    jump: { file: "jump", mode: "once", fps: 10 },
    attack: { file: "attack", mode: "timed", fps: 0 },
    dash: { file: "dash", mode: "once", fps: 14 },
    hurt: { file: "hurt", mode: "once", fps: 10 },
    dead: { file: "dead", mode: "once", fps: 8 },
  },
  // 적 공용 상태(역할별 파일은 actor 이름으로 분기: benny/lupo/tig).
  enemy: {
    idle: { file: "idle", mode: "loop", fps: 6 },
    walk: { file: "walk", mode: "loop", fps: 10 },
    attack: { file: "attack", mode: "timed", fps: 0 },
    special: { file: "special", mode: "timed", fps: 0 },
    groggy: { file: "groggy", mode: "loop", fps: 4 },
  },
};

// 액터의 상태 PNG 경로. actor=폴더명(player/benny/lupo/tig...), specKey=상태.
function animPath(actor, file) {
  return `${SPRITE_BASE_PATH}/${actor}/${file}.png`;
}

// ---- 애니메이션 재생 상태(액터 인스턴스마다 하나) ----
// 현재 어떤 애니메이션을 어느 프레임까지 재생 중인지 들고 있다. 상태가 바뀌면
// setState로 갈아끼운다(같은 상태면 유지 → 자연스러운 반복).
function makeAnimator() {
  return {
    state: null, // 현재 애니메이션 상태 키
    elapsed: 0, // 현재 상태 진입 후 경과(초)
    duration: 0, // timed 모드일 때 총 길이(초). setState에서 지정
  };
}

// 애니메이터 상태 전환. 같은 state면 아무것도 안 한다(재생 이어감). timed 모드는
// totalSec(공격 전체 길이)을 넘겨 그 안에 전체 프레임을 고르게 재생한다.
function setAnimState(anim, state, totalSec) {
  if (anim.state === state && anim.duration === (totalSec || 0)) return;
  anim.state = state;
  anim.elapsed = 0;
  anim.duration = totalSec || 0;
}

// 애니메이터 시간 진행(매 프레임). 실시간이 아니라 게임 dt를 받는다(히트스톱 시 정지).
function advanceAnim(anim, dt) {
  anim.elapsed += dt;
}

// 액터(actor 폴더, animSet=ANIM_SPECS의 player/enemy)의 현재 프레임을 그린다.
// dx,dy,dw,dh = 그릴 화면 사각형(이동 박스). flip=true면 좌우 반전(왼쪽 보기).
// 스프라이트는 64x64 칸을 dw,dh 박스에 맞춰 그리되, 발(하단)을 박스 하단에 정렬한다.
// 반환: 그렸으면 true, 이미지가 없으면(미로드/없음) false(호출부가 폴백).
function drawActorSprite(anim, actor, animSet, dx, dy, dw, dh, flip) {
  const specs = ANIM_SPECS[animSet];
  if (!specs) return false;
  const spec = specs[anim.state] || specs.idle;
  if (!spec) return false;

  const img = AssetStore.get(animPath(actor, spec.file));
  if (!img) return false; // 미로드/없음 → 폴백

  const frameCount = Math.max(1, Math.floor(img.width / SPRITE_FRAME));
  const frame = currentFrameIndex(anim, spec, frameCount);

  // 64x64 칸을 박스 폭에 맞춰 비율 유지 스케일. 발 정렬: 칸 하단을 박스 하단에.
  const scale = dw / SPRITE_FRAME; // 가로 기준 스케일(정사각 칸)
  const drawW = SPRITE_FRAME * scale;
  const drawH = SPRITE_FRAME * scale;
  const drawX = dx + (dw - drawW) / 2; // 가로 중앙
  const drawY = dy + dh - drawH; // 하단(발) 정렬

  const sx = frame * SPRITE_FRAME;
  ctx.save();
  ctx.imageSmoothingEnabled = false; // 픽셀아트 선명하게
  if (flip) {
    // 좌우 반전: 그릴 영역 중심을 기준으로 x축 뒤집기.
    ctx.translate(drawX + drawW, drawY);
    ctx.scale(-1, 1);
    ctx.drawImage(img, sx, 0, SPRITE_FRAME, SPRITE_FRAME, 0, 0, drawW, drawH);
  } else {
    ctx.drawImage(img, sx, 0, SPRITE_FRAME, SPRITE_FRAME, drawX, drawY, drawW, drawH);
  }
  ctx.restore();
  return true;
}

// 현재 재생 프레임 인덱스(0..frameCount-1).
//   loop:  fps로 순환.
//   once:  fps로 진행하다 마지막 프레임에서 멈춤.
//   timed: 총 길이(duration)에 전체 프레임을 고르게 분배(공격 phase 동기화).
function currentFrameIndex(anim, spec, frameCount) {
  if (spec.mode === "timed") {
    const d = anim.duration > 0 ? anim.duration : 0.001;
    const t = Math.min(anim.elapsed / d, 0.999); // 0..1 직전
    return Math.min(frameCount - 1, Math.floor(t * frameCount));
  }
  const fps = spec.fps || 8;
  const i = Math.floor(anim.elapsed * fps);
  if (spec.mode === "once") return Math.min(i, frameCount - 1);
  return i % frameCount; // loop
}
