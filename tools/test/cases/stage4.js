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

  // 셰이디는 프롬프트2에서 도주형으로 구현됨(정지형 placeholder 제거). 상세는 아래 셰이디 suite.
  t.test("셰이디: 정지형이 아니라 도주형(stationary 제거)", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const shady = g.bossOf("shady");
    expect(shady.ai.stationary == null).toBeTruthy(); // stationary 플래그 없음
    expect(shady.ai.shady).toBeTruthy(); // 도주/난사 설정 존재
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

// ── 프롬프트2: 셰이디(도주/순간이동형) ──────────────────────────────────────
// data.js shady(fleeSpeed 300·jumpInterval 0.373·gateCooldown 13·gateCount 6 등) +
//   ATTACKS.shadyBlink + enemy.js updateShady/updateShadyBarrage/makeShadyGate +
//   projectiles.js spawnShadyWeapon/updateShadyWeapons.
// 셰이디는 facing이 updateEnemies 루프에서 갱신되므로, updateShady 단독 호출 테스트는
// facing을 직접 세팅한다(도주 방향 = -facing).
suite("스테이지4 · 셰이디", (t) => {
  // AI 설정: 도주형(stationary 아님) + shady 하위 수치(스펙 그대로).
  t.test("설정: fleeSpeed 300·jumpInterval 0.373·gateCooldown 13·gateCount 6", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const cfg = g.bossOf("shady").ai.shady;
    expect(cfg.fleeSpeed).toBe(300);
    expect(cfg.jumpInterval).toBe(0.373);
    expect(cfg.jumpChance).toBe(0.1);
    expect(cfg.approachDist).toBe(500);
    expect(cfg.gateCooldown).toBe(13);
    expect(cfg.gateCount).toBe(6);
    expect(cfg.weaponDamage).toBe(2);
  });

  // 도주: 플레이어 반대 x로 fleeSpeed(300px/s). 플레이어가 오른쪽이면 왼쪽으로 달아난다.
  t.test("도주: 플레이어 반대로 300px/s 이동", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const shady = g.bossOf("shady");
    shady.x = 700; shady.onGround = true; shady.shadyGateCd = 99; // 난사 억제
    shady.facing = 1; // 플레이어가 오른쪽(매 프레임 facing은 플레이어 쪽)
    g.player.x = 800; g.player.y = shady.y; // 가까이(<500), 맵 끝 아님
    const x0 = shady.x;
    g.updateShady(shady, 0.1);
    expect(shady.x).toBeCloseTo(x0 - 30, 1e-6); // -facing*300*0.1 = 왼쪽 30px
  });

  // 점프: jumpInterval 만료 시 jumpChance(10%) 굴림 — random<0.1이면 최대 점프(JUMP_SPEED).
  t.test("점프: 타이머 만료 + random<0.1 → 최대 점프(vy=-JUMP_SPEED)", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const shady = g.bossOf("shady");
    shady.x = 700; shady.onGround = true; shady.shadyGateCd = 99;
    shady.facing = 1; shady.shadyJumpTimer = 0.005; // 곧 만료
    g.player.x = 760; g.player.y = shady.y; // 가까이(도주만)
    g.eval("Math.random=()=>0.05;"); // <0.1 → 점프
    const JUMP = g.eval("JUMP_SPEED");
    g.updateShady(shady, 0.016);
    expect(shady.vy).toBe(-JUMP);
    expect(shady.shadyJumpTimer).toBeCloseTo(0.373, 1e-6); // 타이머 재충전
  });

  // 점프 확률: random>=0.1이면 점프 안 함(vy 그대로).
  t.test("점프: random>=0.1이면 점프 안 함", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const shady = g.bossOf("shady");
    shady.x = 700; shady.onGround = true; shady.shadyGateCd = 99;
    shady.facing = 1; shady.shadyJumpTimer = 0.005; shady.vy = 0;
    g.player.x = 760; g.player.y = shady.y;
    g.eval("Math.random=()=>0.5;"); // >=0.1 → 점프 안 함
    g.updateShady(shady, 0.016);
    expect(shady.vy).toBe(0);
  });

  // 접근 평타(거리): 플레이어와 approachDist(500) 이상 → 등 뒤 블링크 평타 발동.
  t.test("접근 평타: ≥500px → shadyBlink(블링크) 발동", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const shady = g.bossOf("shady");
    shady.x = 400; shady.onGround = true; shady.shadyGateCd = 99;
    shady.facing = 1;
    g.player.x = 1000; g.player.y = shady.y; // 600px 벌어짐(≥500)
    g.updateShady(shady, 0.016);
    expect(shady.state).toBe("attack");
    expect(shady.attack).toBe(g.eval("ATTACKS.shadyBlink"));
    expect(shady.blinkPending).toBe(true);
  });

  // 접근 평타(맵 끝): 좌우 끝에 몰리면 거리와 무관하게 블링크(가까워도 발동).
  t.test("접근 평타: 맵 끝 도달 시 거리 무관 블링크 발동", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const shady = g.bossOf("shady");
    shady.x = 0; shady.onGround = true; shady.shadyGateCd = 99; // 왼쪽 끝
    shady.facing = 1;
    g.player.x = 200; g.player.y = shady.y; // 가까움(<500)인데도 맵 끝이라 발동
    g.updateShady(shady, 0.016);
    expect(shady.state).toBe("attack");
    expect(shady.attack).toBe(g.eval("ATTACKS.shadyBlink"));
  });

  // shadyBlink spec: kind blink·windup 0.4·패링 가능·dmg 기본 1(damage 필드 없음).
  t.test("shadyBlink: kind blink·windup 0.4·패링 가능·dmg 기본", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const a = g.eval("ATTACKS.shadyBlink");
    expect(a.kind).toBe("blink");
    expect(a.windup).toBe(0.4);
    expect(a.parryable).toBe(true);
    expect(a.damage == null).toBeTruthy(); // dmg 기본 1
  });

  // 차원문 난사 발동: 쿨이 차고 바닥이면 barrage 시작(index 0·phase open·gate 존재).
  t.test("난사: 쿨참·바닥 → barrage 시작", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const shady = g.bossOf("shady");
    shady.onGround = true; shady.shadyGateCd = 0;
    g.updateShady(shady, 0.016);
    expect(shady.shadyBarrage).toBeTruthy();
    expect(shady.shadyBarrage.index).toBe(0);
    expect(shady.shadyBarrage.phase).toBe("open");
    expect(shady.shadyBarrage.gate).toBeTruthy();
  });

  // 차원문 위치: 플레이어 중심에서 gateDist(60px), 전/후방 콘(±70°)이라 상·하 쐐기 제외
  // → 세로 성분 |dy| ≤ 60·sin70°. 100개 샘플 모두 만족해야 한다.
  t.test("차원문 위치: 60px 거리·상하 40° 쐐기 제외(수평 ±70°)", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const shady = g.bossOf("shady");
    const cfg = shady.ai.shady;
    const pcx = g.player.x + g.player.w / 2;
    const pcy = g.player.y + g.player.h / 2;
    const maxDy = 60 * Math.sin((70 * Math.PI) / 180) + 1e-9;
    for (let i = 0; i < 100; i++) {
      const gate = g.makeShadyGate(cfg);
      const dx = gate.cx - pcx, dy = gate.cy - pcy;
      expect(Math.hypot(dx, dy)).toBeCloseTo(60, 1e-6); // 정확히 60px
      expect(Math.abs(dy) <= maxDy).toBeTruthy(); // 위/아래 쐐기에 안 들어감
    }
  });

  // 차원문은 순수 이펙트(open 동안 피격 안 됨): open 단계에선 플레이어가 회랑 위에 있어도
  // 피해/패링이 없다. gateOpen 종료 시 strike(검격)로 전이한다.
  t.test("차원문: open 단계는 피격 없음(순수 이펙트) → strike 전이", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const shady = g.bossOf("shady");
    const cfg = shady.ai.shady;
    g.startShadyBarrage(shady, cfg);
    const pcx = g.player.x + g.player.w / 2, pcy = g.player.y + g.player.h / 2;
    shady.shadyBarrage.gate = { cx: pcx, cy: pcy, targetX: pcx, targetY: pcy, parried: false, struck: false };
    const hp0 = g.player.hp;
    g.updateShadyBarrage(shady, 0.2, cfg); // open 진행 중(아직 0.3 전)
    expect(g.player.hp).toBe(hp0); // open 동안 무피해(차원문은 이펙트만)
    expect(shady.shadyBarrage.phase).toBe("open");
    g.updateShadyBarrage(shady, 0.1, cfg); // 누적 0.3 → strike 전이
    expect(shady.shadyBarrage.phase).toBe("strike");
  });

  // 검격(strike): 회랑 안 플레이어에 dmg + 검격 종료 시 gap. 차원문이 아니라 '검격'이 친다.
  t.test("검격: 회랑 안 플레이어에 dmg(미패링) + gap 전이", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const shady = g.bossOf("shady");
    const cfg = shady.ai.shady;
    g.startShadyBarrage(shady, cfg);
    const pcx = g.player.x + g.player.w / 2, pcy = g.player.y + g.player.h / 2;
    shady.shadyBarrage.gate = { cx: pcx, cy: pcy, targetX: pcx, targetY: pcy, parried: false, struck: false };
    const hp0 = g.player.hp;
    g.updateShadyBarrage(shady, 0.3, cfg); // open → strike
    expect(shady.shadyBarrage.phase).toBe("strike");
    g.updateShadyBarrage(shady, 0.15, cfg); // strike: 회랑 안 → dmg + 종료 → gap
    expect(g.player.hp).toBe(hp0 - 1);
    expect(shady.shadyBarrage.phase).toBe("gap");
  });

  // 검격 회피: 회랑 밖(차원문→목표 통로에서 비킴)이면 무피해.
  t.test("검격 회피: 회랑 밖이면 무피해", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const shady = g.bossOf("shady");
    const cfg = shady.ai.shady;
    g.startShadyBarrage(shady, cfg);
    const pcy = g.player.y + g.player.h / 2;
    const far = g.player.x + 600;
    shady.shadyBarrage.gate = { cx: far, cy: pcy, targetX: far, targetY: pcy, parried: false, struck: false };
    const hp0 = g.player.hp;
    g.updateShadyBarrage(shady, 0.3, cfg); // open → strike
    g.updateShadyBarrage(shady, 0.15, cfg); // strike: 회랑 멀어 무피해 → gap
    expect(g.player.hp).toBe(hp0); // 회피
    expect(shady.shadyBarrage.phase).toBe("gap");
  });

  // 패링 누적 3회 → 난사 즉시 취소 + 3초 그로기(전역 게이지 무관) + 낙하 무기 없음.
  // 패링 대상은 차원문이 아니라 strike(검격)다.
  t.test("패링: 검격 누적 3회 → 취소 + 3초 그로기(게이지 무관)·낙하 없음", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const shady = g.bossOf("shady");
    const cfg = shady.ai.shady;
    g.startShadyBarrage(shady, cfg);
    // 플레이어가 검격 쪽(오른쪽)으로 평타 active 상태가 되게 세팅.
    g.player.attack = g.eval("ATTACKS.playerSlash");
    g.player.attackElapsed = 0; // windup 0 → 즉시 active
    g.player.attackDir = 1;
    const pcx = g.player.x + g.player.w / 2, pcy = g.player.y + g.player.h / 2;
    const gauge0 = shady.groggyGauge;
    for (let i = 0; i < 3 && shady.shadyBarrage; i++) {
      shady.shadyBarrage.gate = { cx: pcx + 30, cy: pcy, targetX: pcx, targetY: pcy, parried: false, struck: false };
      shady.shadyBarrage.phase = "strike"; // 검격 단계에서만 패링 가능
      shady.shadyBarrage.t = 0;
      g.updateShadyBarrage(shady, 0.016, cfg); // 이 검격 패링
    }
    expect(shady.shadyBarrage == null).toBeTruthy(); // 취소
    expect(shady.groggyTime).toBe(3);
    expect(shady.groggyDrains).toBe(false); // 전역 게이지 드레인 안 함
    expect(shady.groggyGauge).toBe(gauge0); // 게이지 무관(누적 안 됨)
    expect(g.shadyWeapons.length).toBe(0); // 취소 시 낙하 무기 없음
  });

  // 6회 완주 → 낙하 무기 1개 생성 + barrage 종료 + 쿨 재충전.
  t.test("완주: 6회 다 돌면 낙하 무기 생성 + 종료", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const shady = g.bossOf("shady");
    const cfg = shady.ai.shady;
    g.player.hp = 99; // 피격 사망 노이즈 제거(완주만 확인)
    g.startShadyBarrage(shady, cfg);
    for (let i = 0; i < 6 && shady.shadyBarrage; i++) {
      g.updateShadyBarrage(shady, 0.3, cfg);  // open → strike
      g.updateShadyBarrage(shady, 0.15, cfg); // strike → gap
      g.updateShadyBarrage(shady, 0.2, cfg);  // gap → 다음(마지막엔 완주 처리)
    }
    expect(shady.shadyBarrage == null).toBeTruthy();
    expect(g.shadyWeapons.length).toBe(1);
    expect(shady.shadyGateCd).toBe(13); // 쿨 재충전
  });

  // 낙하 무기 spec: 가로 플레이어×5(225)·세로 ×7(420)·dmg 2. 중력으로 가속 낙하.
  t.test("낙하 무기: 225×420·dmg 2·중력 가속 낙하", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const shady = g.bossOf("shady");
    g.spawnShadyWeapon(shady, 700);
    const w = g.shadyWeapons[0];
    expect(w.w).toBe(225);
    expect(w.h).toBe(420);
    expect(w.damage).toBe(2);
    const y0 = w.y, vy0 = w.vy;
    g.eval("updateShadyWeapons(0.1)");
    expect(g.shadyWeapons[0].vy).toBeGreaterThan(vy0); // 중력으로 vy 증가
    expect(g.shadyWeapons[0].y).toBeGreaterThan(y0); // 아래로 낙하
  });

  // 낙하 무기 접촉: 플레이어와 겹치면 dmg 2(패링 불가 — 무조건 피해).
  t.test("낙하 무기: 접촉 시 dmg 2(패링 불가)", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const shady = g.bossOf("shady");
    const pcx = g.player.x + g.player.w / 2;
    g.spawnShadyWeapon(shady, pcx); // 플레이어 머리 위
    const w = g.shadyWeapons[0];
    w.y = g.player.y; // 플레이어와 겹치게 끌어내림
    const hp0 = g.player.hp;
    g.eval("updateShadyWeapons(0.016)");
    expect(g.player.hp).toBe(hp0 - 2);
  });
});

// ── 프롬프트3: 아공간 2인 연동 ──────────────────────────────────────────────
// data.js SUBSPACE(enterThreshold 0.05·returnHp 0.3·dwellTime 4) + rim/shady ai.subspace +
//   combat.js hitEnemy(maybeEnterSubspace) + enemy.js updateSubspace/returnFromSubspace.
// 스펙 [[stage4-rim-shady-spec]] "공통 — 아공간". 둘 다 생존 중일 때만 작동(즉사 불가),
// 첫 처치 이후 생존자는 봉인(정상 처치). 첫 처치는 그로기→포식(devour)으로 성립한다.
suite("스테이지4 · 아공간", (t) => {
  // 설정: 림·셰이디 둘 다 같은 SUBSPACE(5%↓→아공간, 30% 복귀, 4초 체류)를 공유한다.
  t.test("설정: 림/셰이디 subspace = enterThreshold 0.05·returnHp 0.3·dwellTime 4", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const rs = g.bossOf("rim").ai.subspace;
    const ss = g.bossOf("shady").ai.subspace;
    expect(rs.enterThreshold).toBe(0.05);
    expect(rs.returnHp).toBe(0.3);
    expect(rs.dwellTime).toBe(4);
    expect(ss).toBe(rs); // 둘이 같은 공통 설정 객체 참조
  });

  // 진입: 둘 다 생존 중 HP가 5% 이하로 떨어지면 죽지 않고 아공간으로 피신(alive 유지).
  t.test("진입: 둘 다 생존 중 5%↓ → 아공간 피신(사망 안 함)", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const rim = g.bossOf("rim");
    rim.hp = 6; // 6 > 5(5%)
    g.hitEnemy(rim, 2); // hp → 4 ≤ 5
    expect(rim.inSubspace).toBe(true);
    expect(rim.alive).toBeTruthy();
    expect(rim.hpAtEntry).toBe(4); // 복귀 회복 기준선 저장
  });

  // 즉사 불가: 둘 다 생존 중이면 큰 피해로 HP가 0 이하가 돼도 죽지 않고 아공간으로 간다.
  t.test("즉사 불가: 둘 다 생존 중엔 과피해도 사망 대신 아공간", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const rim = g.bossOf("rim");
    rim.hp = 4;
    g.hitEnemy(rim, 100); // hp → -96
    expect(rim.alive).toBeTruthy();
    expect(rim.inSubspace).toBe(true);
    expect(rim.hpAtEntry).toBe(0); // 음수 클램프(0)
  });

  // 정상 복귀: dwellTime(4초) 경과 시 아공간에서 나와 returnHp(30% = 30)로 회복.
  t.test("정상 복귀: 4초 체류 후 HP 30%로 회복하며 복귀", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const rim = g.bossOf("rim");
    rim.inSubspace = true; rim.subspaceTime = 0; rim.hpAtEntry = 4; rim.hp = 4;
    g.updateSubspace(rim, 4); // 4 ≥ dwellTime → 정상 복귀
    expect(rim.inSubspace).toBeFalsy();
    expect(rim.hp).toBeCloseTo(30); // maxHp 100 × 0.3
    expect(rim.state).toBe("chase");
  });

  // 강제 복귀: 아공간 체류 중 상대가 죽으면 즉시 복귀 + 체류시간 비례 회복(park-and-kill 방지).
  t.test("강제 복귀: 상대 사망 시 즉시 복귀 + 체류시간 비례 회복", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const rim = g.bossOf("rim");
    const shady = g.bossOf("shady");
    rim.inSubspace = true; rim.subspaceTime = 2; rim.hpAtEntry = 4; rim.hp = 4; // 절반 체류
    shady.alive = false; // 상대 사망
    g.updateSubspace(rim, 0.016);
    expect(rim.inSubspace).toBeFalsy();
    // frac = 2/4 = 0.5 → hp = 4 + 0.5×(30−4) = 17 (정상 복귀 30보다 적음)
    expect(rim.hp).toBeCloseTo(17);
  });

  // 피격 불가: 아공간 피신 중엔 플레이어 평타가 안 맞는다(resolveAttackHits 스킵).
  //   같은 세팅에서 피신을 풀면 맞는 걸로 대조(스킵이 실제로 작동함을 확인).
  t.test("피격 불가: 아공간 중 무피해 → 복귀 후엔 피격(대조)", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const rim = g.bossOf("rim");
    g.player.x = rim.x; g.player.y = rim.y; g.player.facing = 1;
    g.player.attack = g.eval("ATTACKS.playerSlash");
    g.player.attackElapsed = 0; g.player.attackDir = 1; // windup 0 → 즉시 active
    rim.inSubspace = true;
    const hp0 = rim.hp;
    g.resolveAttackHits();
    expect(rim.hp).toBe(hp0); // 피신 중: 무피해
    rim.inSubspace = false;
    g.player.attackHits.clear();
    g.resolveAttackHits();
    expect(rim.hp).toBeLessThan(hp0); // 복귀 후: 피격
  });

  // 봉인: 상대가 이미 죽었으면 5%↓로 깎아도 아공간 없이 정상 처치된다(둘 다 생존 중만 작동).
  t.test("봉인: 상대 사망 후엔 5%↓로 아공간 없이 정상 처치", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const rim = g.bossOf("rim");
    g.bossOf("shady").alive = false; // 상대 먼저 사망 → 림 봉인
    rim.hp = 4;
    g.hitEnemy(rim, 5); // hp → -1
    expect(rim.inSubspace).toBeFalsy(); // 아공간 안 들어감
    expect(rim.alive).toBeFalsy(); // 정상 처치
  });

  // 클리어 루트(통합): 그로기→포식으로 첫 처치 성립 → 생존자 봉인 → HP로 마무리 → 둘 다 사망.
  t.test("클리어: 포식 첫 처치 → 생존자 봉인 → HP 마무리 → 전멸 성립", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const rim = g.bossOf("rim");
    const shady = g.bossOf("shady");
    // 셰이디 그로기 상태에서 포식(첫 처치) — 둘 다 생존 중이라도 포식은 HP 무관 즉시 마무리.
    shady.groggyTime = 1;
    g.hitEnemy(shady, 0.01, true); // isDevour=true + 그로기 → devourEnemy
    expect(shady.alive).toBeFalsy(); // 첫 처치
    // 생존자(림)는 봉인 → 5%↓로 깎으면 아공간 없이 사망.
    rim.hp = 3;
    g.hitEnemy(rim, 5);
    expect(rim.inSubspace).toBeFalsy();
    expect(rim.alive).toBeFalsy();
    expect(g.enemies.every((e) => !e.alive)).toBeTruthy(); // 클리어 성립
  });
});
