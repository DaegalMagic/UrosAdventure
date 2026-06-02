// 우로스의 모험 — 연출 서비스(TimeControl 시간제어 · ZoomControl 줌 · ScreenShake 화면흔들림)
// (main.js에서 분리. 빌드/모듈 시스템이 없어 전역 스코프를 공유하므로 분리는
//  코드 이동 + index.html <script> 추가가 전부다. 셋 다 자기완결 IIFE라 로드 시점에 외부 참조 없음. ctx/camera는 호출 시점에만 쓴다.)

// 시간 제어 서비스(wiki player-core-mechanics §6): 게임 로직용 dt에 곱하는 전역
// 배율 하나로 freeze(정지)·감속·가속을 모두 처리한다. 히트스톱은 "배율 0을 짧게
// 거는" 한 사례일 뿐이다. loop가 매 프레임 dt×scale을 update에 넘기므로, 어떤
// 시스템이든 TimeControl로 정지/슬로모/가속 윈도를 요청할 수 있다.
//
// 타이머는 '실시간' dt로 진행한다 — 배율이 0이면 스케일 dt도 0이라 스케일 시간으로
// 재면 영영 안 끝나기 때문. 동시/연속 요청은 누적하지 않고 '남은 시간이 더 긴'
// 요청이 이긴다(히트스톱이 줄줄이 늘어지는 것 방지 — 기존 max 규칙의 일반화).
// NOTE: 정지·감속·가속이 동시에 경합하는 우선순위 정책은 호출자가 늘어나면
// 정교화한다. 지금은 히트스톱 하나뿐이라 '더 긴 쪽 우선'으로 충분하다.
const TimeControl = (() => {
  let overrideScale = 1; // 임시 배율(1=평소, 0=정지, <1=감속, >1=가속)
  let overrideTimer = 0; // 임시 배율 남은 시간(실시간 초)
  return {
    // 이번 프레임에 적용할 시간 배율.
    get scale() {
      return overrideTimer > 0 ? overrideScale : 1;
    },
    // durSec(실시간) 동안 배율을 scaleValue로 건다. 남은 시간이 더 긴 쪽이 이긴다.
    request(scaleValue, durSec) {
      if (durSec > overrideTimer) {
        overrideTimer = durSec;
        overrideScale = scaleValue;
      }
    },
    // 정지(히트스톱) 단축 호출.
    freeze(durSec) {
      this.request(0, durSec);
    },
    // 실시간 dt로 타이머를 진행한다. 매 프레임 한 번 호출.
    advance(realDt) {
      if (overrideTimer > 0) {
        overrideTimer -= realDt;
        if (overrideTimer <= 0) overrideTimer = 0;
      }
    },
  };
})();

// 줌 제어 서비스(TimeControl과 짝). 현재 zoom을 목표(target)로 매 프레임 부드럽게
// 보간한다 — 딱 커진 화면으로 끊기는 게 아니라 자연스럽게 확대/원복된다. 줌 중심은
// 월드 좌표(cx, cy)로 들고 있다가 render에서 화면 좌표로 변환하므로, 카메라가
// 움직여도 그 월드 지점이 확대 중심으로 유지된다. 보간은 실시간 dt로 진행해
// 히트스톱(시간 정지) 중에도 줌이 들어간다.
const ZoomControl = (() => {
  let zoom = 1; // 현재 배율(렌더가 읽는 값)
  let target = 1; // 목표 배율
  let cx = 0, cy = 0; // 줌 중심(월드 좌표)
  let rate = 8; // 보간 속도(클수록 빨리 도달). exp 감쇠 계수
  return {
    get zoom() { return zoom; },
    get centerX() { return cx; },
    get centerY() { return cy; },
    // 목표 배율 + 줌 중심(월드 좌표)을 건다. r을 주면 보간 속도도 바꾼다.
    request(targetZoom, worldX, worldY, r) {
      target = targetZoom;
      cx = worldX;
      cy = worldY;
      if (r) rate = r;
    },
    // 중심은 유지하고 배율만 바꿔 되돌릴 때(예: 원복) 사용.
    to(targetZoom, r) {
      target = targetZoom;
      if (r) rate = r;
    },
    // 보간 없이 즉시 맞춘다(스테이지 진입 등). 잔재를 남기지 않는다.
    snap(value = 1) {
      zoom = target = value;
    },
    // 실시간 dt로 현재 배율을 목표로 당긴다(지수 보간). 매 프레임 한 번 호출.
    advance(realDt) {
      if (zoom === target) return;
      zoom += (target - zoom) * (1 - Math.exp(-rate * realDt));
      if (Math.abs(zoom - target) < 0.001) zoom = target;
    },
  };
})();

// 줌 변환을 현재 ctx에 적용한다(render의 월드 파트 안에서 save/restore 사이에 호출).
// 줌 중심(월드)을 화면 좌표로 바꿔 그 점을 고정한 채 배율을 건다. zoom=1이면 무동작.
function applyZoomTransform() {
  const z = ZoomControl.zoom;
  if (z === 1) return;
  const fx = ZoomControl.centerX - camera.x;
  const fy = ZoomControl.centerY - camera.y;
  ctx.translate(fx, fy);
  ctx.scale(z, z);
  ctx.translate(-fx, -fy);
}

// 화면 흔들림 서비스(충격파 연출). shake(강도, 지속)로 흔들고, render의 월드 파트에서
// offsetX/Y만큼 추가로 translate한다. 흔들림은 실시간 dt로 잦아든다.
const ScreenShake = (() => {
  let time = 0;
  let mag = 0;
  return {
    shake(magnitude, duration) {
      mag = magnitude;
      time = duration;
    },
    // 이번 프레임 흔들림 오프셋(time>0일 때만 랜덤). render에서 x/y 각각 한 번 읽는다.
    get offsetX() { return time > 0 ? (Math.random() * 2 - 1) * mag : 0; },
    get offsetY() { return time > 0 ? (Math.random() * 2 - 1) * mag : 0; },
    advance(realDt) {
      if (time > 0) {
        time -= realDt;
        if (time <= 0) time = 0;
      }
    },
    snap() { time = 0; },
  };
})();

