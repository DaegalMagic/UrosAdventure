// 공통 로직 (Phase 1) — 보스와 무관하게 모든 스테이지가 의존하는 토대.
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
//   expect(x).toBe / toEqual / toBeCloseTo / toBeLessThan / toBeGreaterThan / toBeTruthy
//
// 입력 의존 케이스: update(dt)는 js/input.js의 Input 스냅샷을 읽는다. 샌드박스엔
//   키 이벤트가 없어 기본은 '아무 키도 안 눌림'이다. 특정 입력을 흉내 낼 땐
//   Input의 메서드를 eval로 갈아끼운다(반환 객체는 가변):
//     g.eval("Input.justPressed=(a)=>a==='jump'; Input.isDown=(a)=>a==='down';")
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

  // loadStage(name) → stage 객체. cols/rows/widthPx가 ASCII 격자와 일치하고,
  // 맨 아래 행(1층 바닥)은 적이 안 빠지게 solid여야 한다(map.js: 바닥은 꽉 찬 #).
  t.test("loadStage: cols·rows·widthPx가 격자와 일치하고 1층 바닥이 solid", () => {
    const g = loadGame();
    const TILE = g.eval("TILE_SIZE");
    const rows = g.eval("STAGES")["스테이지 2"];
    const st = g.loadStage("스테이지 2");
    expect(st.rows).toBe(rows.length);
    expect(st.cols).toBe(rows[0].length);
    expect(st.widthPx).toBe(st.cols * TILE);
    expect(st.heightPx).toBe(st.rows * TILE);
    // 맨 아래 행 전체가 solid(바닥은 낭떠러지 없이 꽉 참).
    const bottom = st.tiles[st.rows - 1];
    for (let c = 0; c < st.cols; c++) expect(bottom[c].solid).toBe(true);
  });

  // 스테이지3만 전용 층 좌표(간격 140px). 나머지는 기본(80px) — loadStage가 분기한다.
  t.test("loadStage: 스테이지3은 floorSurfaces가 STAGE3 전용값", () => {
    const g = loadGame();
    expect(g.loadStage("스테이지 3").floorSurfaces).toEqual(g.eval("STAGE3_FLOOR_SURFACES_Y"));
    expect(g.loadStage("스테이지 2").floorSurfaces).toEqual(g.eval("DEFAULT_FLOOR_SURFACES_Y"));
  });

  // tileAt: 격자 밖은 가상의 땅(OUT_OF_BOUNDS_TILE, solid)으로 본다 — 벽 밖으로
  // 빠지지 않게. 안쪽은 실제 격자 타일을 그대로 돌려준다.
  t.test("tileAt: 스테이지 밖 좌표는 OUT_OF_BOUNDS_TILE(solid)로 처리", () => {
    const g = loadGame();
    const st = g.loadStage("스테이지 2");
    const oob = g.eval("OUT_OF_BOUNDS_TILE");
    expect(g.tileAt(st, -1, 0)).toBe(oob);
    expect(g.tileAt(st, st.cols, 0)).toBe(oob);
    expect(g.tileAt(st, 0, -1)).toBe(oob);
    expect(g.tileAt(st, 0, st.rows)).toBe(oob);
    expect(oob.solid).toBe(true);
    // 안쪽은 실제 타일.
    expect(g.tileAt(st, 0, 0)).toBe(st.tiles[0][0]);
  });

  // 정의되지 않은 스테이지명은 조용히 빈 맵을 만들지 말고 즉시 throw해야 한다.
  t.test("존재하지 않는 스테이지명은 loadStage가 throw", () => {
    const g = loadGame();
    let threw = false;
    try { g.loadStage("없는스테이지"); } catch (e) { threw = true; }
    expect(threw).toBe(true);
  });
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

  // getHurtbox: 이동 박스에서 '가로 중앙 + 하단(발) 정렬'로 피격 박스를 파생한다.
  // hurt 크기가 이동 박스와 다를 때 그 정렬 산식을 실제로 확인한다(작은 hurt로 검증).
  t.test("getHurtbox: 이동 박스에서 가로중앙·하단정렬로 파생", () => {
    const g = loadGame();
    const e = g.makeEnemy(0, 0, null);
    e.x = 100; e.y = 200; e.w = 45; e.h = 60; e.hurt = { w: 20, h: 30 };
    const hb = g.getHurtbox(e);
    expect(hb.x).toBe(100 + (45 - 20) / 2); // 가로 중앙 = 112.5
    expect(hb.y).toBe(200 + (60 - 30)); // 하단 정렬 = 230
    expect(hb.w).toBe(20);
    expect(hb.h).toBe(30);
    // hurt가 없으면 이동 박스를 그대로 피격 박스로 쓴다(하위 호환).
    const hb2 = g.getHurtbox({ x: 5, y: 6, w: 7, h: 8 });
    expect(hb2.x).toBe(5); expect(hb2.y).toBe(6); expect(hb2.w).toBe(7); expect(hb2.h).toBe(8);
  });

  // getAttackHitbox: active 구간이 아니면 null. 평타(가로 100)는 attackDir 방향으로
  // 뻗는다 — 오른쪽이면 [x, x+100], 왼쪽이면 [x+w-100, x+w].
  t.test("getAttackHitbox: 공격 없으면 null, 평타 시 attackDir 방향으로 박스 생성", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const p = g.player;
    const slash = g.eval("ATTACKS").playerSlash; // windup0 active0.15
    p.attack = null;
    expect(g.getAttackHitbox()).toBe(null);
    p.x = 200; p.y = 100; p.attack = slash; p.attackElapsed = 0.05; // active
    p.attackDir = 1;
    const hbR = g.getAttackHitbox();
    expect(hbR.x).toBe(200); // 오른쪽: [x, x+100]
    expect(hbR.w).toBe(100);
    p.attackDir = -1;
    const hbL = g.getAttackHitbox();
    expect(hbL.x).toBe(200 + p.w - 100); // 왼쪽: [x+w-100, ...] = 145
    // recovery 등 active 밖이면 null.
    p.attackElapsed = 0.5;
    expect(g.getAttackHitbox()).toBe(null);
  });
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

  // 맵이 뷰보다 작으면 카메라를 (world-view)/2(음수)로 고정해 맵을 뷰 가운데에 둔다.
  t.test("카메라 clamp: 맵이 뷰보다 작으면 (world-view)/2로 가운데 정렬", () => {
    const Camera = loadGame().eval("Camera");
    const cam = new Camera(1000, 600);
    cam.x = 123; cam.clamp(400, 600); // 맵 400 < 뷰 1000
    expect(cam.x).toBe((400 - 1000) / 2); // -300
  });

  // 데드존(기본 25% → 가운데 50%) 안에서는 카메라가 움직이지 않는다.
  t.test("카메라 follow: 데드존(가운데 50%) 안에서는 카메라가 안 움직임", () => {
    const Camera = loadGame().eval("Camera");
    const cam = new Camera(1000, 600); // x 데드존 화면좌표 [250, 750]
    cam.x = 0; cam.y = 0;
    cam.follow(500, 300, 5000, 600); // 화면좌표 500(가로)·300(세로) 모두 데드존 안
    expect(cam.x).toBe(0);
    expect(cam.y).toBe(0);
  });

  // 데드존 경계 밖으로 나가면 그 초과분만큼만 카메라가 스크롤한다.
  t.test("카메라 follow: 데드존 경계 밖으로 나가면 그 초과분만큼만 스크롤", () => {
    const Camera = loadGame().eval("Camera");
    const cam = new Camera(1000, 600); // x 우측 경계 = 750
    cam.x = 0;
    cam.follow(900, 300, 5000, 600); // 화면좌표 900 > 750 → 초과분 150
    expect(cam.x).toBe(150);
  });
});

// ── 물리 (이동/점프/중력) ───────────────────────────────────────────────────
// 주의: update(dt)는 입력 스냅샷(Input)에 의존한다. 점프/드롭스루는 Input 메서드를
// eval로 갈아끼워 입력을 흉내 낸다. 기본(스텁 없음)은 '아무 키도 안 눌림'.
suite("공통 · 물리", (t) => {
  // 공중에서 입력이 없으면 중력만 작용 → vy가 한 프레임에 GRAVITY*dt만큼 증가한다.
  t.test("중력: 공중의 플레이어는 update마다 vy가 GRAVITY*dt만큼 증가", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const GRAVITY = g.eval("GRAVITY");
    const p = g.player;
    p.y = 100; p.vy = 0; p.onGround = false; // 충돌 없이 공중에 띄움
    g.update(1, 0.016);
    expect(g.player.vy).toBeCloseTo(GRAVITY * 0.016);
  });

  // startJump: 지상/공중 공용. 호출 즉시 vy를 -JUMP_SPEED(상승)로 세팅한다.
  t.test("startJump: 지상에서 호출 시 vy가 음수(상승)로 설정", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    g.startJump();
    expect(g.player.vy).toBe(-g.eval("JUMP_SPEED"));
    expect(g.player.vy).toBeLessThan(0);
  });

  // 이중점프: 공중에서 MAX_AIR_JUMPS회까지만 추가 점프. 그 이상의 점프 입력은 무시되어
  // airJumps가 더 늘지 않는다(jump 입력을 항상 true로 흉내 내 한계를 친다).
  t.test("이중점프: 공중 1회 추가 점프 허용, 그 이상은 무시", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const MAX = g.eval("MAX_AIR_JUMPS"); // 1
    g.eval("Input.justPressed=(a)=>a==='jump'; Input.isDown=()=>false;");
    const p = g.player;
    p.y = 100; p.vy = 0; p.onGround = false; p.airJumps = 0;
    g.update(1); // 공중 추가 점프 1회 사용
    expect(g.player.airJumps).toBe(MAX);
    expect(g.player.vy).toBeLessThan(0); // 점프해서 상승
    g.update(1); // 한도 초과 → 추가 점프 무시
    expect(g.player.airJumps).toBe(MAX);
  });

  // 드롭스루: 원웨이 발판 위에서 아래+점프 → DROP_THROUGH_TIME 동안 발판을 통과해
  // 아래(1층 solid 바닥)로 떨어진다. 스테이지2 2층 발판(row21 col7~11) 위에서 검증.
  t.test("드롭스루: 발동 시 DROP_THROUGH_TIME 동안 원웨이 발판을 통과", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const p = g.player;
    p.x = 150; p.y = 350; p.vy = 0; // 2층 원웨이 발판(표면 y420) 위로 낙하
    g.update(30);
    expect(p.onGround).toBe(true);
    expect(p.onOneWay).toBe(true); // 원웨이 발판 위에 안착
    // 아래 + 점프 = 드롭스루 발동.
    g.eval("Input.justPressed=(a)=>a==='jump'; Input.isDown=(a)=>a==='down';");
    g.update(1);
    expect(p.dropThrough).toBeGreaterThan(0);
    expect(p.onGround).toBe(false);
    // 입력 해제 후 낙하 → 발판을 통과해 1층 solid 바닥(표면 y500)에 안착.
    g.eval("Input.justPressed=()=>false; Input.isDown=()=>false;");
    g.update(60);
    expect(p.onOneWay).toBe(false); // 원웨이가 아니라 solid 바닥
    expect(p.y + p.h).toBeGreaterThan(420); // 원웨이 발판(420) 아래로 통과
    expect(p.y + p.h).toBeCloseTo(500, 1); // 1층 바닥 표면에 정확히 안착
  });

  // 1층 바닥(#, solid)은 사방이 막혀 낙하가 표면에서 멈춘다(관통 금지). 발판이 없는
  // 열(col20) 위에서 떨어뜨려 바닥에 안착(onGround, vy 0, onOneWay 아님)을 확인.
  t.test("1층 바닥(solid) 위에서는 낙하가 표면에서 멈춤(관통 금지)", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const p = g.player;
    p.x = 400; p.y = 430; p.vy = 0; // 발(490)이 바닥(500) 바로 위, 원웨이 없는 열
    g.update(20);
    expect(p.onGround).toBe(true);
    expect(p.onOneWay).toBe(false);
    expect(p.y + p.h).toBeCloseTo(500, 1); // 바닥 표면에서 정지
    expect(p.vy).toBe(0); // 관통하지 않고 멈춤
  });
});

// ── 전투 기본 (패링/피해) ───────────────────────────────────────────────────
suite("공통 · 전투", (t) => {
  // hitEnemy: 피해에 방어력 배수(1 - defense)를 곱해 hp를 깎는다.
  t.test("hitEnemy: 방어력에 따라 피해가 감산되어 hp가 줄어듦", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const e = g.makeEnemy(500, 500, null, 100, 0.5); // hp100, defense0.5
    g.enemies = [e];
    g.hitEnemy(e, 10); // 10 * (1 - 0.5) = 5
    expect(e.hp).toBe(95);
    expect(e.alive).toBe(true);
  });

  // 포식(isDevour=true)이 그로기 적을 때리면 HP가 남아도 즉시 사망(finisher).
  t.test("hitEnemy(isDevour=true): 그로기 적은 hp가 남아도 즉시 사망", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const e = g.makeEnemy(500, 500, null, 100, 0); // hp100
    e.groggyTime = 5; // 그로기 상태
    g.enemies = [e];
    g.hitEnemy(e, 1, true);
    expect(e.alive).toBe(false); // HP가 남아도 즉시 포식
  });

  // 패링: 플레이어 공격 히트박스 ∩ 적 공격(active·parryable) 히트박스 + 서로 마주봄.
  // 겹치면 성립, 떨어지면 불성립. (resolveParries는 전역 enemies/player를 본다.)
  t.test("패링 판정: 마주본 두 공격 히트박스가 겹치면 패링 성립", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const ATTACKS = g.eval("ATTACKS");
    const p = g.player;
    p.x = 400; p.y = 300; p.attack = ATTACKS.playerSlash; p.attackElapsed = 0.05; p.attackDir = 1;
    // 적: 오른쪽에서 왼쪽을 보며(attackDir -1) 공격 active. 히트박스가 플레이어와 겹침.
    const e = g.makeEnemy(0, 0, null);
    e.x = 460; e.y = 300; e.attack = ATTACKS.enemySwing; e.attackElapsed = 0.3; e.attackDir = -1;
    g.enemies = [e];
    g.resolveParries();
    expect(e.parried).toBe(true);
    // 멀리 떨어뜨리면(겹침 없음) 패링 불성립.
    const e2 = g.makeEnemy(0, 0, null);
    e2.x = 2000; e2.y = 300; e2.attack = ATTACKS.enemySwing; e2.attackElapsed = 0.3; e2.attackDir = -1;
    g.enemies = [e2];
    g.resolveParries();
    expect(e2.parried).toBe(false);
  });

  // 그로기 전이: 게이지가 GROGGY_GAUGE_MAX 이상이면 그로기 진입(groggyTime>0).
  // permaGroggy는 타이머 없이 무방비 + 진행 중 공격을 즉시 끈다.
  t.test("그로기/permaGroggy 상태 전이 기본 동작", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const MAX = g.eval("GROGGY_GAUGE_MAX");
    const e = g.makeEnemy(0, 0, null);
    expect(e.groggyTime).toBe(0);
    g.addGroggyGauge(e, MAX); // 임계 도달 → 그로기 진입
    expect(e.groggyTime).toBeGreaterThan(0);
    // permaGroggy: 진행 중이던 공격을 즉시 중단하고 영구 무방비.
    const e2 = g.makeEnemy(0, 0, null);
    e2.attack = g.eval("ATTACKS").enemySwing;
    g.makePermaGroggy(e2);
    expect(e2.permaGroggy).toBe(true);
    expect(e2.attack).toBe(null);
  });
});
