// 스테이지3 — 이프리트/가비아/실라/나이아. 스펙 [[stage3-ifrit-spec]]와 1:1 대응.
//   실행: node tools/test.js stage3
// 하니스 빠른 참조는 cases/common.js 머리말 참고(loadGame/eval/step/bossOf/expect).
//   스테이지3 상태 배열(firePillars/gabiaBlasts/naiaLasers/naiaLaserQueue/naiaWave)은
//   harness EPILOGUE 게터로 노출된다(g.firePillars 등). 클리어 조건 = 이프리트+가비아 HP 0
//   (실라·나이아는 봉인만 될 뿐 죽지 않는다).
const { suite, expect, loadGame } = require("../harness");

// ── 이프리트(추격 + 거리분기 2패턴) ─────────────────────────────────────────
// data.js ifrit.ifrit(patternDist 200·cooldown 5) + enemy.js updateIfritPatterns/
//   ifritStartSlam/ifritUpdateSlam/ifritStartTransform + projectiles.js spawnFirePillar.
suite("스테이지3 · 이프리트", (t) => {
  // ≥200px·쿨참·바닥 → 두 패턴 중 랜덤 발동(true 반환). random≥0.5로 불기둥 분기 고정.
  t.test("거리분기: ≥200px·쿨참·바닥이면 패턴 발동(불기둥)", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const ifrit = g.bossOf("ifrit");
    ifrit.ifritPhase = "idle"; ifrit.ifritPatternCd = 0; ifrit.onGround = true;
    g.eval("Math.random=()=>0.9;"); // ≥0.5 → ifritFirePillar 분기
    const handled = g.updateIfritPatterns(ifrit, 0.016);
    expect(handled).toBe(true);
    expect(g.firePillars.length).toBe(1); // 불기둥 예고 1기
  });

  // random<0.5 → 점프슬램 발동(상승 vy<0, phase slam).
  t.test("거리분기: 슬램 분기 시 phase=slam·상승 vy<0", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const ifrit = g.bossOf("ifrit");
    ifrit.ifritPhase = "idle"; ifrit.ifritPatternCd = 0; ifrit.onGround = true;
    g.eval("Math.random=()=>0.1;"); // <0.5 → ifritStartSlam 분기
    g.updateIfritPatterns(ifrit, 0.016);
    expect(ifrit.ifritPhase).toBe("slam");
    expect(ifrit.vy).toBeLessThan(0); // 2단점프 높이 상승
  });

  // <200px(근접)면 패턴을 안 내고 일반 추격/평타에 위임(false 반환).
  t.test("거리분기: <200px면 평타 위임(false 반환)", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const ifrit = g.bossOf("ifrit");
    ifrit.ifritPhase = "idle"; ifrit.ifritPatternCd = 0; ifrit.onGround = true;
    // 플레이어를 이프리트 중심 가까이(중심거리 <200)로 옮긴다.
    g.player.y = ifrit.y;
    g.player.x = ifrit.x + ifrit.w / 2 - g.player.w / 2 + 40; // 중심거리 ~40
    const handled = g.updateIfritPatterns(ifrit, 0.016);
    expect(handled).toBe(false);
  });

  // 몸통박치기 공중 패링 성공: 마주본 플레이어 공격이 슬램 중 몸통과 겹치면 변신 없이
  // pushback(뒤로 밀림)으로 전이한다.
  t.test("몸통박치기: 공중 패링 성공 시 변신 없이 pushback", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const ifrit = g.bossOf("ifrit");
    const p = g.player;
    // 슬램 공중 상태 셋업.
    ifrit.ifritPhase = "slam"; ifrit.slamAirborne = true; ifrit.slamVx = 0;
    ifrit.slamHitPlayer = false; ifrit.onGround = false; ifrit.facing = -1;
    // 플레이어가 오른쪽을 보며 공격(active), 이프리트가 그 히트박스 안에 들어옴.
    p.attack = g.eval("ATTACKS").playerSlash; p.attackElapsed = 0.05; p.attackDir = 1;
    p.attackHits.clear();
    ifrit.x = p.x + 40; ifrit.y = p.y; // playerSlash 가로 100 안에 몸통
    g.updateIfritPatterns(ifrit, 0.016);
    expect(ifrit.ifritPhase).toBe("pushback"); // 패링 성공 → 밀림(변신 X)
    expect(ifrit.invincible).toBeFalsy(); // 변신 안 함 = 무적 아님
  });

  // 몸통박치기 패링 실패(착지) → 거대 불꽃 변신: 가로·세로 3배 + 무적.
  t.test("몸통박치기: 착지(패링 실패) 시 거대 불꽃 변신(3배·무적)", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const ifrit = g.bossOf("ifrit");
    const baseW = ifrit.w;
    // 떴다가(slamAirborne) 바닥에 닿음(onGround) + 플레이어 공격 없음 → 변신.
    ifrit.ifritPhase = "slam"; ifrit.slamAirborne = true; ifrit.slamVx = 0;
    ifrit.slamHitPlayer = true; ifrit.onGround = true;
    g.player.attack = null; g.player.x = 50; // 접촉 없게 멀리
    g.updateIfritPatterns(ifrit, 0.016);
    expect(ifrit.ifritPhase).toBe("transform");
    expect(ifrit.invincible).toBe(true); // 3초 무적
    expect(ifrit.w).toBeCloseTo(baseW * 3); // transformScale 3배
  });

  // 변신 무적: 변신 중 이프리트를 때려도 피해가 무시된다.
  t.test("변신: 무적이라 피해 무시(HP 불변)", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const ifrit = g.bossOf("ifrit");
    g.ifritStartTransform(ifrit, ifrit.ai.ifrit); // invincible=true
    const hp0 = ifrit.hp;
    g.hitEnemy(ifrit, 10);
    expect(ifrit.hp).toBe(hp0); // 무적: 피해 무시
  });

  // 변신 접촉 피해: 겹친 플레이어에게 transformTickInterval초당 transformTickDmg.
  t.test("변신: 겹친 플레이어에게 접촉 피해(transformTickDmg)", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const ifrit = g.bossOf("ifrit");
    g.ifritStartTransform(ifrit, ifrit.ai.ifrit);
    const p = g.player;
    p.hp = 100; p.dead = false;
    p.x = ifrit.x + ifrit.w / 2 - p.w / 2; p.y = ifrit.y + ifrit.h - p.h; // 몸통에 겹침
    g.updateIfritPatterns(ifrit, 0.016); // 첫 접촉 프레임 → 1틱 피해
    expect(g.player.hp).toBeLessThan(100);
  });

  // 변신 해제: transformTime 경과 후 원복(크기 복귀·무적 해제) + 쿨 재시작.
  t.test("변신: transformTime 경과 후 원복 + 쿨 재시작", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const ifrit = g.bossOf("ifrit");
    const cfg = ifrit.ai.ifrit;
    const baseW = ifrit.w;
    g.ifritStartTransform(ifrit, cfg);
    ifrit.transformTime = 0.02; // 곧 만료
    g.player.x = 50; // 접촉 없게
    // 변신이 풀리는 즉시 멈춘다(이후 idle 프레임이 쿨을 더 깎기 전 시점에서 확인).
    for (let i = 0; i < 5 && ifrit.invincible; i++) g.updateIfritPatterns(ifrit, 0.016);
    expect(ifrit.invincible).toBe(false);
    expect(ifrit.w).toBeCloseTo(baseW); // 원복
    expect(ifrit.ifritPatternCd).toBeCloseTo(cfg.cooldown); // 변신 직후 쿨 시작
  });

  // 불기둥 발동: 플레이어 발밑에 telegraph 기둥 1기.
  t.test("불기둥: 발동 시 telegraph 기둥 1기 예약", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const ifrit = g.bossOf("ifrit");
    g.firePillars = [];
    g.ifritFirePillar(ifrit, ifrit.ai.ifrit);
    expect(g.firePillars.length).toBe(1);
    expect(g.firePillars[0].state).toBe("telegraph");
  });

  // 불기둥 즉발: telegraph(1.5s) 경과 후 active로 전이.
  t.test("불기둥: telegraph(1.5s) 경과 후 active 즉발", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const ifrit = g.bossOf("ifrit");
    g.firePillars = [];
    g.ifritFirePillar(ifrit, ifrit.ai.ifrit);
    let sawActive = false;
    for (let i = 0; i < 120 && g.firePillars.length; i++) {
      g.updateFirePillars(0.016);
      if (g.firePillars.length && g.firePillars[0].state === "active") { sawActive = true; break; }
    }
    expect(sawActive).toBe(true);
  });

  // 불기둥 피격(패링 불가): active 기둥에 선 플레이어가 피해를 받는다.
  t.test("불기둥: active 기둥에 플레이어 피격(회피 전용)", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const ifrit = g.bossOf("ifrit");
    const p = g.player;
    p.hp = 100; p.dead = false;
    g.firePillars = [];
    // 플레이어 발밑 표면에 active 기둥을 직접 세운다.
    g.firePillars.push({ x: p.x + p.w / 2, surfaceY: p.y + p.h, state: "active", t: 0, shooter: ifrit, hitPlayer: false, alive: true });
    g.updateFirePillars(0.016);
    expect(g.player.hp).toBeLessThan(100);
  });
});

// ── 가비아(카이팅 / 돌 / 공유 방어막 / 붕괴) ─────────────────────────────────
// data.js gabia.gabia(kiteNear250·kiteFar400·moveSpeed90·돌 등) + enemy.js updateGabia
//   + projectiles.js fireGabiaStone/parryGabiaStone/updateStone/updateGabiaShared/
//   castGabiaShield/castGabiaInvinc/spawnGabiaBlast + combat.js hitEnemy(gShield/gInvinc)
//   + map.js collapseStage3Floors.
suite("스테이지3 · 가비아", (t) => {
  // 카이팅 셋업 헬퍼: 돌·붕괴를 막고 플레이어 중심거리만 조정한다.
  const setup = (g, centerDist) => {
    const gabia = g.bossOf("gabia");
    gabia.hp = 80; gabia.stoneCd = 999; // 붕괴(≤64)·돌 발사 차단
    gabia.x = 600; gabia.y = 500 - gabia.h; gabia.onGround = true;
    const ecx = gabia.x + gabia.w / 2;
    g.player.y = gabia.y;
    g.player.x = ecx + centerDist - g.player.w / 2; // 플레이어 중심 = ecx + centerDist
    return gabia;
  };

  // kiteNear(250) 안 → 물러난다(플레이어 반대 방향, 여기선 왼쪽으로 x 감소).
  t.test("카이팅: kiteNear 안이면 물러남(x 감소)", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const gabia = setup(g, 30); // 매우 가까움 → 물러남
    const x0 = gabia.x;
    g.updateGabia(gabia, 0.1);
    expect(gabia.x).toBeLessThan(x0);
  });

  // kiteFar(400) 밖 → 거리를 좁힌다(플레이어 쪽, 오른쪽으로 x 증가).
  t.test("카이팅: kiteFar 밖이면 접근(x 증가)", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const gabia = setup(g, 600); // 너무 멂 → 접근
    const x0 = gabia.x;
    g.updateGabia(gabia, 0.1);
    expect(gabia.x).toBeGreaterThan(x0);
  });

  // kiteNear~kiteFar 사이 → 가로 정지(x 불변).
  t.test("카이팅: near~far 사이면 가로 정지(x 불변)", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const gabia = setup(g, 320); // 250~400 사이
    const x0 = gabia.x;
    g.updateGabia(gabia, 0.1);
    expect(gabia.x).toBe(x0);
  });

  // 돌 패링 = 각도 반사: vx만 반전·vy(입사각) 유지, 무피해, reflected.
  t.test("돌: 패링 시 각도 반사(vx 반전·vy 유지·무피해)", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const gabia = g.bossOf("gabia");
    g.projectiles.length = 0;
    g.fireGabiaStone(gabia);
    const stone = g.projectiles.find((p) => p.kind === "stone");
    const vx0 = stone.vx, vy0 = stone.vy;
    g.parryGabiaStone(stone);
    expect(stone.state).toBe("reflected");
    expect(stone.vx).toBeCloseTo(-vx0); // 수평 성분만 반전
    expect(stone.vy).toBeCloseTo(vy0); // 입사각(수직) 유지
    expect(stone.damage).toBe(0); // 반사 중 플레이어 무피해
  });

  // 반사된 돌이 이프리트를 맞히면 reflectDamage(=stoneDamage 1).
  t.test("돌: 반사체가 이프리트를 맞히면 reflectDamage", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const gabia = g.bossOf("gabia");
    const ifrit = g.bossOf("ifrit");
    g.projectiles.length = 0;
    g.fireGabiaStone(gabia);
    const stone = g.projectiles.find((p) => p.kind === "stone");
    g.parryGabiaStone(stone);
    stone.vx = 0; stone.vy = 0; // 제자리(이프리트에 겹쳐 둠)
    const eh = g.getHurtbox(ifrit);
    stone.x = eh.x + eh.w / 2 - stone.w / 2;
    stone.y = eh.y + eh.h / 2 - stone.h / 2;
    const hp0 = ifrit.hp;
    g.updateStone(stone, 0.016);
    expect(ifrit.hp).toBeLessThan(hp0);
    expect(stone.alive).toBe(false);
  });

  // 공유 방어막: 시전 시 이프리트+가비아 동시에 시간제 방어력 버프(+0.8).
  t.test("공유 방어막: 이프리트+가비아 동시 방어력 버프(+shieldDefenseBuff)", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const gabia = g.bossOf("gabia");
    const ifrit = g.bossOf("ifrit");
    g.castGabiaShield(gabia.ai.gabia);
    expect(gabia.gShieldTime).toBeGreaterThan(0);
    expect(ifrit.gShieldTime).toBeGreaterThan(0);
    expect(gabia.gShieldBuff).toBeCloseTo(gabia.ai.gabia.shieldDefenseBuff); // 0.8
  });

  // 방어막 중 피격: 방어력 합산으로 피해 감산 + gShieldHit 표식(해제 후 폭발 예약용).
  t.test("공유 방어막: 유지 중 피격은 감산 + gShieldHit 표식", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const gabia = g.bossOf("gabia");
    gabia.hp = 80; gabia.defense = 0;
    g.castGabiaShield(gabia.ai.gabia); // gShieldTime>0, buff 0.8
    g.hitEnemy(gabia, 1); // 1 * (1 - 0.8) = 0.2만 들어감
    expect(gabia.hp).toBeCloseTo(79.8);
    expect(gabia.gShieldHit).toBe(true);
  });

  // 매 3번째 시전은 방어막 대신 무적(HP 적은 쪽 하나). gCastCount 2→3에서 무적 시전.
  t.test("매 3번째 시전: 방어막 대신 무적(HP 적은 쪽)", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const gabia = g.bossOf("gabia");
    const ifrit = g.bossOf("ifrit");
    ifrit.hp = 10; // 이프리트가 HP 더 적음 → 무적 대상
    gabia.gCastCount = 2; gabia.gShieldCd = 0; // 다음 시전 = 3번째
    gabia.groggyTime = 0; gabia.permaGroggy = false;
    g.updateGabiaShared(0.016);
    expect(gabia.gCastCount).toBe(3);
    expect(ifrit.gInvinc).toBe(true);
    expect(ifrit.gInvincTime).toBeGreaterThan(0);
  });

  // 무적 가격: 때리면 무적 즉시 해제 + 플레이어 경직(staggerTime), 피해는 0.
  t.test("무적 가격: 무적 즉시 해제 + 플레이어 경직(무피해)", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const ifrit = g.bossOf("ifrit");
    ifrit.gInvinc = true; ifrit.gInvincTime = 1.5; ifrit.gStagger = 0.5;
    const hp0 = ifrit.hp;
    g.hitEnemy(ifrit, 10);
    expect(ifrit.gInvinc).toBe(false); // 즉시 해제
    expect(g.player.staggerTime).toBeGreaterThan(0); // 공격자 경직
    expect(ifrit.hp).toBe(hp0); // 무피해
  });

  // 방어막 해제 후 자기중심 폭발: 피격됐던 쪽은 explodeDelay 뒤 폭발(gabiaBlasts).
  t.test("공유 방어막: 피격 후 해제 → explodeDelay 뒤 자기중심 폭발", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const gabia = g.bossOf("gabia");
    g.castGabiaShield(gabia.ai.gabia);
    gabia.gShieldHit = true; gabia.gShieldTime = 0.01; // 곧 해제 + 피격 표식
    g.gabiaBlasts = [];
    // 해제(폭발 예약) → explodeDelay(0.5s) 카운트다운 → 폭발.
    for (let i = 0; i < 45 && g.gabiaBlasts.length === 0; i++) g.updateGabiaShared(0.016);
    expect(g.gabiaBlasts.length).toBeGreaterThan(0);
  });

  // 동적 붕괴 불변 보장: 임계 4회 모두 무너뜨려도 (1) 바닥(row25~29) 불가침,
  // (2) 발판층(row4/11/18)은 연속 빈칸 ≤ COLLAPSE_MAX_GAP·최소 1칸 잔존(좌우이동·도달 보장).
  t.test("붕괴: 임계 4회 후에도 바닥 불가침 + 발판층 빈칸 ≤ MAX_GAP", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const MAX_GAP = g.eval("COLLAPSE_MAX_GAP");
    for (let i = 0; i < 4; i++) g.collapseStage3Floors(); // 64/48/32/16 임계 전부
    const st = g.stage;
    // (1) 바닥 row25~29 전부 solid.
    for (let r = 25; r < st.rows; r++)
      for (let c = 0; c < st.cols; c++) expect(st.tiles[r][c].solid).toBe(true);
    // (2) 발판층은 연속 빈칸이 MAX_GAP를 넘지 않고 최소 1칸은 남아 있다.
    for (const r of [4, 11, 18]) {
      let run = 0, any = false;
      for (let c = 0; c < st.cols; c++) {
        if (st.tiles[r][c].solid) { any = true; run = 0; }
        else { run++; expect(run).toBeLessThan(MAX_GAP + 1); }
      }
      expect(any).toBe(true);
    }
  });
});

// ── 나이아(3연발 물줄기 레이저 / 파도) ────────────────────────────────────────
// data.js naia.naia(laserVolley3·laserVolleyGap0.2·laserCd12·bossHit2·waveEvery3 등) +
//   projectiles.js updateNaia/scheduleNaiaLasers/processNaiaLaserQueue/spawnNaiaLaser/
//   updateNaiaLasers/spawnNaiaWave/updateNaiaWave.
suite("스테이지3 · 나이아", (t) => {
  // 볼리 예약: 3발을 0.2초 간격으로, 마지막 발만 플레이어 정조준(aimPlayer).
  t.test("레이저 볼리: 3발 0.2초 시차 예약·마지막만 aimPlayer", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const naia = g.bossOf("naia");
    g.naiaLaserQueue = [];
    g.scheduleNaiaLasers(naia);
    expect(g.naiaLaserQueue.length).toBe(3);
    expect(g.naiaLaserQueue.map((q) => q.aimPlayer)).toEqual([false, false, true]);
    expect(g.naiaLaserQueue[1].delay).toBeCloseTo(0.2);
  });

  // 시차 발사: 대기열이 시간차로 비워지며 레이저 3발이 모두 스폰된다.
  t.test("레이저 볼리: 시차대로 3발 모두 발사", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const naia = g.bossOf("naia");
    g.naiaLaserQueue = []; g.naiaLasers = [];
    g.scheduleNaiaLasers(naia);
    for (let i = 0; i < 40; i++) g.processNaiaLaserQueue(0.016); // 0.64s > 0.4s
    expect(g.naiaLaserQueue.length).toBe(0);
    expect(g.naiaLasers.length).toBe(3);
  });

  // 레이저 피격(패링 불가): telegraph → firing 후 정조준 선분 위 플레이어가 1회 피해.
  t.test("레이저: telegraph 후 firing에서 플레이어 피격(패링 불가)", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const naia = g.bossOf("naia");
    const p = g.player;
    p.hp = 100; p.dead = false;
    g.naiaLasers = [];
    g.spawnNaiaLaser(naia, true); // 플레이어 정조준 선분
    for (let i = 0; i < 90; i++) g.updateNaiaLasers(0.016); // telegraph1.2 + firing
    expect(g.player.hp).toBeLessThan(100);
  });

  // 보스 명중: 이프리트에 닿으면 피해(bossHit).
  t.test("레이저: 이프리트 명중 시 피해(bossHit)", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const naia = g.bossOf("naia");
    const ifrit = g.bossOf("ifrit");
    const eh = g.getHurtbox(ifrit);
    const cy = eh.y + eh.h / 2, cx = eh.x + eh.w / 2;
    g.naiaLasers = [];
    // 이프리트 중심을 지나는 가로 firing 선분(플레이어는 hitPlayer=true로 제외).
    g.naiaLasers.push({ ox: cx - 1500, oy: cy, angle: 0, ex: cx + 1500, ey: cy, state: "firing", t: 0, shooter: naia, hitPlayer: true, hitBosses: [], alive: true });
    const hp0 = ifrit.hp;
    g.updateNaiaLasers(0.016);
    expect(ifrit.hp).toBeLessThan(hp0);
  });

  // 보스 명중: 가비아에 닿으면 회복(bossHit, maxHp 클램프).
  t.test("레이저: 가비아 명중 시 회복(bossHit)", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const naia = g.bossOf("naia");
    const gabia = g.bossOf("gabia");
    gabia.hp = 70; // maxHp 80 미만
    const eh = g.getHurtbox(gabia);
    const cy = eh.y + eh.h / 2, cx = eh.x + eh.w / 2;
    g.naiaLasers = [];
    g.naiaLasers.push({ ox: cx - 1500, oy: cy, angle: 0, ex: cx + 1500, ey: cy, state: "firing", t: 0, shooter: naia, hitPlayer: true, hitBosses: [], alive: true });
    g.updateNaiaLasers(0.016);
    expect(gabia.hp).toBeGreaterThan(70); // 회복
  });

  // 파도 차례: 매 waveEvery(3)번째 공격은 레이저 대신 파도(naiaWave warn 상태).
  t.test("파도: 매 3번째 공격은 레이저 대신 파도(warn)", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const naia = g.bossOf("naia");
    naia.naiaCount = 2; naia.naiaCd = 0; // 다음 발동 = 3번째
    g.naiaWave = null;
    g.updateNaia(0.016);
    expect(g.naiaWave).toBeTruthy();
    expect(g.naiaWave.phase).toBe("warn");
  });

  // 쿨 정지: 파도가 떠 있는 동안은 naiaCd가 줄지 않는다.
  t.test("파도: 존재하는 동안 쿨(naiaCd) 정지", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const naia = g.bossOf("naia");
    naia.naiaCd = 5; naia.naiaCount = 0;
    g.naiaWave = { phase: "warn" }; // 파도 존재(truthy)
    g.updateNaia(1.0);
    expect(naia.naiaCd).toBe(5); // 정지
  });

  // 파도 회피: 최상층(floor 0) 발판 위면 무피해, 그 외 층이면 다단히트 피해.
  t.test("파도: 최상층(floor0)은 회피, 그 외 층은 피격", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const naia = g.bossOf("naia");
    const p = g.player;
    const wave = () => ({ shooter: naia, phase: "active", t: 0, warnTime: 2, speed: 0, w: g.stage.widthPx * 3, x: p.x - 100, damage: 1, tickInterval: 1, tickTimer: 0 });
    // 그 외 층(1층 바닥 y500) → 피격.
    p.hp = 100; p.dead = false; p.y = 500 - p.h;
    g.naiaWave = wave();
    g.updateNaiaWave(0.016);
    expect(g.player.hp).toBeLessThan(100);
    // 최상층(floor0, y80) → 무피해.
    p.hp = 100; p.y = 80 - p.h;
    g.naiaWave = wave();
    g.updateNaiaWave(0.016);
    expect(g.player.hp).toBe(100);
  });

  // 파도 완전 소멸: 맵 오른쪽 끝을 지나면 종료 + 쿨(naiaCd) 리셋.
  t.test("파도: 완전 소멸 시 종료 + 쿨 리셋", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const naia = g.bossOf("naia");
    naia.naiaCd = 0;
    g.naiaWave = { shooter: naia, phase: "active", t: 0, warnTime: 2, speed: 0, w: 100, x: g.stage.widthPx + 1, damage: 1, tickInterval: 1, tickTimer: 0 };
    g.updateNaiaWave(0.016);
    expect(g.naiaWave).toBe(null);
    expect(naia.naiaCd).toBeCloseTo(naia.ai.naia.laserCd); // 12로 리셋
  });

  // 봉인: sealed면 발사 결정이 즉시 중단된다(볼리 예약 안 됨).
  t.test("봉인: sealed면 레이저 발사 중지", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const naia = g.bossOf("naia");
    naia.sealed = true; naia.naiaCd = 0; naia.naiaCount = 0;
    g.naiaLaserQueue = []; g.naiaWave = null;
    g.updateNaia(0.016);
    expect(g.naiaLaserQueue.length).toBe(0); // 발사 결정 자체가 중지
  });
});

// ── 실라(포물선 화살 / 반사 봉인 / 착탄 잡몹) ─────────────────────────────────
// data.js sila.sila(arrowSpeed340·arrowGravity700·reflectSpeedMult2·sealHits4·
//   mobFloorChance0.25 등) + projectiles.js updateSila/fireSilaArrow/parrySilaArrow/
//   silaReflectTarget/updateArrow/spawnSilaMob/updateSilaMobs.
suite("스테이지3 · 실라", (t) => {
  // 화살 발사: 맵 상단 밖(y<0)에서 아래로 떨어지는 incoming 화살.
  t.test("화살: 상단 밖에서 incoming 화살 발사(중력 세팅)", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const sila = g.bossOf("sila");
    g.projectiles.length = 0;
    g.fireSilaArrow(sila);
    const arrow = g.projectiles.find((p) => p.kind === "arrow");
    expect(arrow).toBeTruthy();
    expect(arrow.state).toBe("incoming");
    expect(arrow.y).toBeLessThan(0); // 맵 상단 밖
    expect(arrow.gravity).toBe(sila.ai.sila.arrowGravity);
    expect(arrow.vy).toBeGreaterThan(0); // 아래로(±65°라 cos>0)
  });

  // 포물선: incoming 화살은 매 프레임 화살 전용 중력으로 vy가 증가한다.
  t.test("화살: incoming 동안 vy가 중력으로 증가(포물선)", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const sila = g.bossOf("sila");
    g.projectiles.length = 0;
    g.fireSilaArrow(sila);
    const arrow = g.projectiles.find((p) => p.kind === "arrow");
    g.player.x = -9999; // 플레이어 피격 없게(맵 밖)
    const vy0 = arrow.vy;
    g.updateArrow(arrow, 0.016);
    expect(arrow.vy).toBeGreaterThan(vy0);
  });

  // 패링 반사: 속도 2배(reflectSpeedMult)·무피해·reflected.
  t.test("화살: 패링 시 반사(속도 2배·무피해)", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const sila = g.bossOf("sila");
    const cfg = sila.ai.sila;
    g.projectiles.length = 0;
    g.fireSilaArrow(sila);
    const arrow = g.projectiles.find((p) => p.kind === "arrow");
    g.parrySilaArrow(arrow);
    expect(arrow.state).toBe("reflected");
    expect(arrow.damage).toBe(0);
    expect(arrow.reflectSpeed).toBeCloseTo(cfg.arrowSpeed * cfg.reflectSpeedMult); // 680
  });

  // 반사 대상: 나이아 생존 시 나이아, 나이아 봉인 후엔 실라.
  t.test("반사 대상: 나이아 생존→나이아, 봉인 후→실라", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const naia = g.bossOf("naia");
    const sila = g.bossOf("sila");
    expect(g.silaReflectTarget()).toBe(naia); // 나이아 먼저
    naia.sealed = true;
    expect(g.silaReflectTarget()).toBe(sila); // 봉인 후 실라
  });

  // 반사 호밍 봉인: 반사 화살이 모서리 나이아에 닿으면 sealHits++ ≥4 → 봉인.
  t.test("봉인: 반사 화살이 나이아에 4회째 도달하면 봉인", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const naia = g.bossOf("naia");
    const sila = g.bossOf("sila");
    naia.sealHits = 3; // 다음 도달이 4회째
    const nh = g.getHurtbox(naia);
    // 반사 화살을 나이아 hurtbox에 겹쳐 두고 갱신 → 도달 판정.
    const arrow = g.makeProjectile(nh.x, nh.y, 0, 0, { w: g.eval("ARROW_W"), h: g.eval("ARROW_H"), kind: "arrow", damage: 0, parryable: false });
    arrow.state = "reflected"; arrow.cfg = sila.ai.sila; arrow.reflectSpeed = sila.ai.sila.arrowSpeed * 2;
    g.projectiles.push(arrow);
    g.updateArrow(arrow, 0.016);
    expect(naia.sealHits).toBeGreaterThan(3); // 4 도달
    expect(naia.sealed).toBe(true);
  });

  // 봉인 순서: 나이아 봉인 후 추가 반사 화살은 실라로 호밍해 실라를 봉인한다.
  t.test("봉인: 나이아 봉인 후 추가 반사 4회로 실라 봉인", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const naia = g.bossOf("naia");
    const sila = g.bossOf("sila");
    naia.sealed = true; // 나이아 이미 봉인 → 대상은 실라
    sila.sealHits = 3;
    const sh = g.getHurtbox(sila);
    const arrow = g.makeProjectile(sh.x, sh.y, 0, 0, { w: g.eval("ARROW_W"), h: g.eval("ARROW_H"), kind: "arrow", damage: 0, parryable: false });
    arrow.state = "reflected"; arrow.cfg = sila.ai.sila; arrow.reflectSpeed = sila.ai.sila.arrowSpeed * 2;
    g.projectiles.push(arrow);
    g.updateArrow(arrow, 0.016);
    expect(sila.sealed).toBe(true);
  });

  // 바닥 착탄: 미패링 화살이 층 표면을 지나면 mobFloorChance로 잡몹 생성(여기선 100% 발동).
  t.test("바닥 착탄: 층 표면 통과 시 잡몹 생성(mobFloorChance)", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const sila = g.bossOf("sila");
    g.projectiles.length = 0;
    g.fireSilaArrow(sila);
    const arrow = g.projectiles.find((p) => p.kind === "arrow");
    g.player.x = -9999; // 플레이어 피격 없게
    // 1층 표면(y500)을 이번 프레임에 가로지르게 배치.
    arrow.prevCy = 490; arrow.y = 494; arrow.vy = 1000; arrow.parryLock = 0;
    g.eval("Math.random=()=>0.1;"); // < mobFloorChance 0.25 → 생성 확정
    g.updateArrow(arrow, 0.016);
    expect(g.enemies.some((e) => e.role === "silaMob")).toBe(true);
    expect(arrow.alive).toBe(false); // 착탄 후 소멸
  });

  // 잡몹 근접 폭발: 플레이어가 가로 mobNearX 이내면 폭발(gabiaBlasts) + 소멸.
  t.test("잡몹: 가로 근접 시 폭발 + 소멸", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const sila = g.bossOf("sila");
    g.gabiaBlasts = [];
    g.spawnSilaMob(g.player.x + g.player.w / 2, 500, sila.ai.sila); // 플레이어 바로 위
    const mob = g.enemies.find((e) => e.role === "silaMob");
    g.updateSilaMobs(0.016);
    expect(g.gabiaBlasts.length).toBeGreaterThan(0); // 폭발 박스 생성
    expect(mob.alive).toBe(false);
  });

  // 잡몹 선제거: 평타로 먼저 죽인(!alive) 잡몹은 근접해도 폭발하지 않는다.
  t.test("잡몹: 선제거(!alive)된 잡몹은 폭발 안 함", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    const sila = g.bossOf("sila");
    g.gabiaBlasts = [];
    g.spawnSilaMob(g.player.x + g.player.w / 2, 500, sila.ai.sila);
    const mob = g.enemies.find((e) => e.role === "silaMob");
    mob.alive = false; // 평타로 선제거된 상태
    g.updateSilaMobs(0.016);
    expect(g.gabiaBlasts.length).toBe(0); // 폭발 없음
  });
});

// ── 클리어 조건 ──────────────────────────────────────────────────────────────
// main.js: 스테이지3은 '이프리트+가비아 둘 다 사망'으로 클리어를 판정한다(실라·나이아는
//   봉인만 될 뿐 죽지 않아 전멸 판정이 성립하지 않으므로).
suite("스테이지3 · 클리어", (t) => {
  const cleared = (enemies) =>
    !enemies.some((e) => (e.role === "ifrit" || e.role === "gabia") && e.alive);

  t.test("클리어: 이프리트+가비아 둘 다 사망이면 (실라·나이아 생존 무관) 클리어", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    g.bossOf("ifrit").alive = false;
    g.bossOf("gabia").alive = false;
    // 실라·나이아는 살아 있어도(봉인만) 클리어를 막지 않는다.
    expect(cleared(g.enemies)).toBe(true);
  });

  t.test("미클리어: 이프리트가 살아 있으면 클리어 아님", () => {
    const g = loadGame();
    g.startStage("스테이지 3");
    g.bossOf("gabia").alive = false; // 가비아만 처치
    expect(cleared(g.enemies)).toBe(false);
  });
});
