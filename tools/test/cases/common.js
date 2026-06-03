// 공통 로직 (Phase 1) — 보스와 무관하게 모든 스테이지가 의존하는 토대.
//   진행 방법: 각 suite의 t.todo(...)를 t.test(...)로 바꿔 채운다. 같은 suite에 이미
//   들어 있는 t.test 케이스가 그 카테고리의 레퍼런스 패턴이다(이걸 모방).
//   실행: node tools/test.js            (전체)
//         node tools/test.js 공통       (이 파일만)
//   계획·규약: docs/test-refactor-plan.md §5 Phase 1, §6 확장 가이드.
//
// 하니스 빠른 참조:
//   const g = loadGame();              새 격리 컨텍스트(케이스마다 호출)
//   g.startStage("사료스탕스" | "스테이지 2" | "스테이지 3")
//   g.<함수>(...)                      게임 함수 직접 호출(자동 노출)
//   g.<상태>                           player/enemies/projectiles/stage/camera ...
//   g.eval("STAGES" | "GRAVITY" | "Camera" | "ATTACKS.devour")  const/class/내부값
//   g.step(n, dt=0.016) / g.update(n)  프레임 진행(step=update+render)
//   expect(x).toBe / toBeCloseTo / toBeLessThan / toBeGreaterThan / toBeTruthy
const { suite, expect, loadGame } = require("../harness");

// ── 맵 파싱 ──────────────────────────────────────────────────────────────────
suite("공통 · 맵", (t) => {
  // [레퍼런스] STAGES는 {스테이지명: [행 문자열...]}. 파서가 행 길이 일치를 전제하므로
  // 데이터 자체의 정합성을 먼저 못박는다(어긋나면 좌표 계산이 전부 틀어진다).
  t.test("STAGES 각 스테이지의 모든 행 길이가 동일", () => {
    const STAGES = loadGame().eval("STAGES");
    for (const [name, rows] of Object.entries(STAGES)) {
      const w = rows[0].length;
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].length !== w) {
          throw new Error(`${name} 행 ${i} 길이 ${rows[i].length} ≠ ${w}`);
        }
      }
    }
  });

  // loadStage(name) → stage 객체. cols/rows/tiles/widthPx, 그리고 floorSurfaces가
  // 스테이지3만 STAGE3_FLOOR_SURFACES_Y를 쓰는지 확인(map.js:363).
  t.todo("loadStage: cols·rows·widthPx가 격자와 일치하고 1층 바닥이 solid");
  t.todo("loadStage: 스테이지3은 floorSurfaces가 STAGE3 전용값");
  t.todo("tileAt: 스테이지 밖 좌표는 OUT_OF_BOUNDS_TILE(solid)로 처리");
  t.todo("존재하지 않는 스테이지명은 loadStage가 throw");
});

// ── 충돌 / 히트박스 ─────────────────────────────────────────────────────────
suite("공통 · 충돌", (t) => {
  // [레퍼런스] aabbOverlap은 입력 없는 순수함수 — 가장 결정적인 케이스. 경계 접촉
  // (a.x+a.w === b.x)은 비겹침이어야 한다(main.js:304는 strict < / >).
  t.test("aabbOverlap: 겹침 true / 분리 false / 경계접촉 false", () => {
    const g = loadGame();
    const a = { x: 0, y: 0, w: 10, h: 10 };
    expect(g.aabbOverlap(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(g.aabbOverlap(a, { x: 20, y: 0, w: 10, h: 10 })).toBe(false);
    expect(g.aabbOverlap(a, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
  });

  // getHurtbox(entity) / getAttackHitbox(): 좌표·크기와 attackDir에 따른 좌우 반전.
  t.todo("getHurtbox: 플레이어 위치/크기를 반영한 박스 반환");
  t.todo("getAttackHitbox: 공격 없으면 null, 평타 시 attackDir 방향으로 박스 생성");
});

// ── 카메라 ──────────────────────────────────────────────────────────────────
suite("공통 · 카메라", (t) => {
  // [레퍼런스] Camera는 class라 자동 노출되지 않는다 → eval로 생성자를 가져온다.
  // clamp: 맵>뷰면 [0, world-view]로 가두고, 맵<뷰면 가운데 정렬 오프셋(음수).
  t.test("카메라 clamp: 맵이 뷰보다 크면 [0, world-view]로 가둠", () => {
    const Camera = loadGame().eval("Camera");
    const cam = new Camera(1000, 600);
    cam.x = -50; cam.clamp(2000, 600); expect(cam.x).toBe(0);
    cam.x = 9999; cam.clamp(2000, 600); expect(cam.x).toBe(1000); // 2000 - 1000
  });

  t.todo("카메라 clamp: 맵이 뷰보다 작으면 (world-view)/2로 가운데 정렬");
  t.todo("카메라 follow: 데드존(가운데 50%) 안에서는 카메라가 안 움직임");
  t.todo("카메라 follow: 데드존 경계 밖으로 나가면 그 초과분만큼만 스크롤");
});

// ── 물리 (이동/점프/중력) ───────────────────────────────────────────────────
// 주의: update(dt)는 입력 스냅샷(Input)에 의존한다. 점프/이동은 startJump 직접 호출
// 이나 입력 스텁 주입이 필요할 수 있다 — 채울 때 input.js의 Input 인터페이스 확인.
suite("공통 · 물리", (t) => {
  t.todo("중력: 공중의 플레이어는 update마다 vy가 GRAVITY*dt만큼 증가");
  t.todo("startJump: 지상에서 호출 시 vy가 음수(상승)로 설정");
  t.todo("이중점프: 공중 1회 추가 점프 허용, 그 이상은 무시");
  t.todo("드롭스루: 발동 시 DROP_THROUGH_TIME 동안 원웨이 발판을 통과");
  t.todo("1층 바닥(solid) 위에서는 낙하가 표면에서 멈춤(관통 금지)");
});

// ── 전투 기본 (패링/피해) ───────────────────────────────────────────────────
suite("공통 · 전투", (t) => {
  t.todo("hitEnemy: 방어력에 따라 피해가 감산되어 hp가 줄어듦");
  t.todo("hitEnemy(isDevour=true): 그로기 적은 hp가 남아도 즉시 사망");
  t.todo("패링 판정: 공격 히트박스와 패링 가능 투사체가 겹치면 패링 성립");
  t.todo("그로기/permaGroggy 상태 전이 기본 동작");
});
