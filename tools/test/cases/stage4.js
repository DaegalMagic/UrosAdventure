// 스테이지4 — 림/셰이디 2인 동시전. 스펙 [[stage4-rim-shady-spec]]와 1:1 대응.
//   실행: node tools/test.js stage4
// 하니스 빠른 참조는 cases/common.js 머리말 참고(loadGame/eval/step/bossOf/expect).
//   클리어 조건 = 림 + 셰이디 HP 0(아공간 연동 단계에서 연결). 0단계(맵+뼈대)에선
//   둘 다 AI 없는 정지형 더미(stationary)다 — 림/셰이디 실제 행동·아공간은 이후 단계.
const { suite, expect, loadGame } = require("../harness");

// ── 0단계: 맵 + 2인 스폰 뼈대 ───────────────────────────────────────────────
suite("스테이지4 · 맵/스폰 뼈대", (t) => {
  // 맵: 75×30, 기본 4층 좌표(간격 80px), 1층 바닥은 꽉 찬 #(적이 안 빠지게).
  t.test("맵: 75×30·기본 층 좌표·바닥(row25~29) 꽉 찬 #", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const stage = g.stage;
    expect(stage.cols).toBe(75);
    expect(stage.rows).toBe(30);
    expect(stage.floorSurfaces).toEqual([260, 340, 420, 500]);
    // 바닥(row25~29)은 빈틈 없이 solid (두 보스가 빠지지 않게).
    for (let r = 25; r < 30; r++)
      for (let c = 0; c < stage.cols; c++) expect(stage.tiles[r][c].solid).toBeTruthy();
  });

  // 플레이어 스폰: 1층 왼쪽(바닥 바로 위).
  t.test("스폰: 플레이어는 1층 왼쪽(바닥 위)에서 시작", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    expect(g.stage.spawn).toBeTruthy();
    expect(g.player.x).toBeLessThan(200); // 왼쪽
    // 발이 바닥 표면(y≈500) 근처: 발 y = player.y + player.h.
    expect(g.player.y + g.player.h).toBeLessThan(520);
  });

  // 2인 스폰: 림/셰이디 둘 다 1층 바닥, HP 산정값 100, 서로 group 참조.
  t.test("스폰: 림/셰이디 둘 다 살아 있고 group 상호참조", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const rim = g.bossOf("rim");
    const shady = g.bossOf("shady");
    expect(rim).toBeTruthy();
    expect(shady).toBeTruthy();
    expect(rim.alive).toBeTruthy();
    expect(shady.alive).toBeTruthy();
    expect(rim.hp).toBe(100);
    expect(shady.hp).toBe(100);
    expect(g.enemies.length).toBe(2);
    // group은 자기 포함 같은 배열(아공간 연동용).
    expect(rim.group).toBe(g.enemies);
    expect(shady.group).toBe(g.enemies);
  });

  // 셰이디는 아직 정지형 placeholder(프롬프트2에서 구현). 시간이 흘러도 제자리.
  t.test("셰이디: 아직 정지형 placeholder라 x가 안 변한다", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const shady = g.bossOf("shady");
    expect(shady.ai.stationary).toBeTruthy();
    const shadyX = shady.x;
    g.update(60); // 약 1초
    expect(shady.x).toBe(shadyX);
    expect(shady.alive).toBeTruthy();
  });

  // 클리어 조건(기본 전멸 = 둘 다 HP 0). 둘 다 살아 있으면 미클리어, 둘 다 죽으면 클리어.
  t.test("클리어: 림·셰이디 둘 다 사망해야 클리어 성립", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const alive = () => g.enemies.every((e) => !e.alive);
    expect(alive()).toBeFalsy(); // 둘 다 생존 → 미클리어
    g.bossOf("rim").alive = false;
    expect(alive()).toBeFalsy(); // 림만 죽음 → 아직 미클리어
    g.bossOf("shady").alive = false;
    expect(alive()).toBeTruthy(); // 둘 다 죽음 → 클리어
  });
});

// ── 프롬프트1: 림(추격/강타형) ──────────────────────────────────────────────
// data.js rim(chaseSpeed 160·floorPref 0·basic rimSwing·rim.cooldown 7) +
//   ATTACKS.rimSwing/rimAoe + enemy.js updateRimPatterns/rimUpdateSlam* + combat.js onParry(parryStun).
suite("스테이지4 · 림", (t) => {
  // 이동/추격: 160px/s(플레이어 0.8배), 같은 층 추격(floorPref 0). 멀면 다가온다.
  t.test("추격: 160px/s로 플레이어 쪽으로 다가온다", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const rim = g.bossOf("rim");
    expect(rim.ai.chaseSpeed).toBe(160);
    expect(rim.ai.floorPref).toBe(0);
    rim.rimPatternCd = 99; // 패턴 안 나오게(추격만 보기)
    g.player.x = rim.x + 600; // 플레이어를 림 오른쪽 멀리
    g.player.y = rim.y; // 같은 높이
    const x0 = rim.x;
    g.update(20); // 약 0.32초
    expect(rim.x).toBeGreaterThan(x0); // 오른쪽으로 추격
  });

  // 평타 spec: 0.5초 시전·범위 가로 3배(135)·세로 동일(h null)·패링 가능·dmg 1(기본).
  t.test("평타: rimSwing은 windup 0.5·가로 135·패링 가능", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const sw = g.eval("ATTACKS.rimSwing");
    expect(sw.windup).toBe(0.5);
    expect(sw.range.w).toBe(135);
    expect(sw.range.h).toBe(null);
    expect(sw.parryable).toBe(true);
    expect(sw.damage == null).toBeTruthy(); // dmg 기본 1
  });

  // 패턴 발동: 쿨 차고 바닥이면 둘 중 랜덤. random<0.5 → 내려찍기(slamTele phase).
  t.test("패턴: 쿨참·바닥·random<0.5 → 내려찍기(slamTele)", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const rim = g.bossOf("rim");
    rim.rimPatternCd = 0; rim.onGround = true;
    g.eval("Math.random=()=>0.1;");
    const handled = g.updateRimPatterns(rim, 0.016);
    expect(handled).toBe(true);
    expect(rim.rimPhase).toBe("slamTele");
    expect(rim.rimPatternCd).toBe(7); // 쿨 재충전
  });

  // 패턴 발동: random>=0.5 → 광역 강타(일반 공격 rimAoe로 위임, state=attack).
  t.test("패턴: 쿨참·바닥·random>=0.5 → 광역 강타(rimAoe attack)", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const rim = g.bossOf("rim");
    rim.rimPatternCd = 0; rim.onGround = true;
    g.eval("Math.random=()=>0.9;");
    const handled = g.updateRimPatterns(rim, 0.016);
    expect(handled).toBe(true);
    expect(rim.state).toBe("attack");
    expect(rim.attack).toBe(g.eval("ATTACKS.rimAoe"));
  });

  // 패턴: 쿨 안 찼으면 발동 안 함(false 반환 → 일반 CHASE에 위임).
  t.test("패턴: 쿨 대기 중이면 false(일반 CHASE 위임)", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const rim = g.bossOf("rim");
    rim.rimPatternCd = 3; rim.onGround = true;
    const handled = g.updateRimPatterns(rim, 0.016);
    expect(handled).toBe(false);
  });

  // 내려찍기 강타: 지면에 있는(점프 안 한) 플레이어 → dmg 1 + 2초 행동불가.
  t.test("내려찍기: 지면 플레이어는 강타 순간 dmg+2초 스턴", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const rim = g.bossOf("rim");
    rim.rimPatternCd = 0; rim.onGround = true;
    g.eval("Math.random=()=>0.1;");
    g.updateRimPatterns(rim, 0.016); // slamTele 진입
    g.updateRimPatterns(rim, 1.2); // telegraph 끝 → slamStrike 전이
    expect(rim.rimPhase).toBe("slamStrike");
    g.player.onGround = true; // 지면(점프 안 함)
    const hp0 = g.player.hp;
    g.updateRimPatterns(rim, 0.016); // 강타 첫 프레임
    expect(g.player.hp).toBe(hp0 - 1);
    expect(g.player.staggerTime).toBe(2);
  });

  // 내려찍기 회피: 강타 순간 공중(점프)이면 안 맞음(피해/스턴 없음).
  t.test("내려찍기: 공중(점프)이면 회피 — 피해/스턴 없음", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const rim = g.bossOf("rim");
    rim.rimPatternCd = 0; rim.onGround = true;
    g.eval("Math.random=()=>0.1;");
    g.updateRimPatterns(rim, 0.016);
    g.updateRimPatterns(rim, 1.2);
    g.player.onGround = false; // 공중(점프 회피)
    const hp0 = g.player.hp;
    g.updateRimPatterns(rim, 0.016);
    expect(g.player.hp).toBe(hp0); // 무피해
    expect(g.player.staggerTime).toBe(0);
  });

  // 광역 강타 spec: 1.2초 기 모으기·dmg 2·가로 5배(675)·세로 5배(300)·패링 가능·parryStun 0.3.
  t.test("광역 강타: rimAoe는 windup 1.2·dmg 2·가로675/세로300·parryStun 0.3", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const aoe = g.eval("ATTACKS.rimAoe");
    expect(aoe.windup).toBe(1.2);
    expect(aoe.damage).toBe(2);
    expect(aoe.range.w).toBe(675);
    expect(aoe.range.h).toBe(300);
    expect(aoe.parryable).toBe(true);
    expect(aoe.parryStun).toBe(0.3);
  });

  // 광역 강타 패링 리스크: 패링 성공 시 플레이어가 0.3초 행동불가(staggerTime).
  t.test("광역 강타: 패링하면 플레이어 0.3초 행동불가", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const rim = g.bossOf("rim");
    rim.attack = g.eval("ATTACKS.rimAoe");
    rim.attackDir = 1;
    g.onParry(rim);
    expect(g.player.staggerTime).toBe(0.3);
  });

  // 광역 강타 뒤쪽 비피격: 히트박스가 림 전방으로만 뻗어 뒤(반대쪽)는 안 닿는다.
  t.test("광역 강타: 림 뒤쪽은 비피격(전방으로만 뻗음)", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const rim = g.bossOf("rim");
    const range = g.eval("ATTACKS.rimAoe.range");
    const hurt = g.getHurtbox(rim);
    const hbRight = g.makeAttackHitbox(hurt, 1, range); // 오른쪽 바라봄
    expect(hbRight.x).toBeGreaterThan(hurt.x - 1); // 박스가 림 왼쪽(뒤)으로 안 뻗음
    const hbLeft = g.makeAttackHitbox(hurt, -1, range); // 왼쪽 바라봄
    expect(hbLeft.x + hbLeft.w).toBeLessThan(hurt.x + hurt.w + 1); // 오른쪽(뒤)으로 안 뻗음
  });
});
