// 스테이지2 — 다야/비비/키디언/포식. 기존 verify-split.js의 통합 driver를 보스별·
// 스펙별 named 케이스로 분해해 이관했다. 케이스 이름은 메모리 스펙 용어와 1:1 대응한다.
//   스펙: [[daya-pattern-spec]](부채꼴/가시/비) · [[bibi-boss-spec]](#1~#5) · [[kidian-spec]](직선 슈터)
//   실행: node tools/test.js stage2
// 하니스 빠른 참조는 cases/common.js 머리말 참고(loadGame/eval/step/bossOf/expect).
const { suite, expect, loadGame } = require("../harness");

// ── 다야: 원거리 견제 3패턴(부채꼴/가시/비) ─────────────────────────────────
// 스펙 [[daya-pattern-spec]]: cooldown 10초마다 3패턴 랜덤·연속 금지. 정지형 앵커.
suite("스테이지2 · 다야", (t) => {
  // 패턴 선택은 직전 인덱스(dayaLastPattern)를 기억해 같은 패턴이 연달아 나오지 않는다.
  t.test("패턴 선택: 직전과 같은 패턴 연속 금지(dayaLastPattern)", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const daya = g.bossOf("daya");
    let prev = -1;
    for (let i = 0; i < 40; i++) {
      g.projectiles.length = 0; g.dayaSpikes.length = 0; g.dayaRainQueue.length = 0;
      g.fireDayaPattern(daya);
      expect(daya.dayaLastPattern === prev).toBe(false);
      prev = daya.dayaLastPattern;
    }
  });

  // P1 부채꼴: 발동 시점 플레이어 정조준 1발 + 위아래 ±fanSpread 2발 = 3발 incoming.
  t.test("부채꼴(P1): 3발 dayaShot이 incoming으로 생성", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const daya = g.bossOf("daya");
    g.projectiles.length = 0;
    g.fireDayaFan(daya);
    expect(g.projectiles.length).toBe(3);
    expect(g.projectiles.every((p) => p.kind === "dayaShot" && p.state === "incoming")).toBe(true);
  });

  // P1 반사: 한 발을 패링하면 '플레이어가 보는 방향(facing)'으로 수평 반사(무피해).
  t.test("부채꼴 반사: 패링 시 reflected + 플레이어 방향 수평·무피해", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const daya = g.bossOf("daya");
    g.projectiles.length = 0;
    g.fireDayaFan(daya);
    const shot = g.projectiles[0];
    g.player.facing = 1;
    g.parryDayaShot(shot);
    expect(shot.state).toBe("reflected");
    expect(shot.vy).toBe(0);
    expect(shot.damage).toBe(0);
    expect(shot.vx).toBeGreaterThan(0); // facing=1 → 오른쪽
  });

  // 반사체가 비비를 맞히면 reflectDamage(=3)로 hitEnemy. 반사체는 vy=0 수평이라 비비
  // hurtbox 정중앙에 세로를 맞춰 겹쳐 둔다(안 그러면 빗나간다).
  t.test("부채꼴 반사체가 비비를 맞히면 reflectDamage", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const daya = g.bossOf("daya");
    g.projectiles.length = 0;
    g.fireDayaFan(daya);
    const shot = g.projectiles[0];
    g.player.facing = 1;
    g.parryDayaShot(shot);
    const bibi = g.bossOf("bibi");
    bibi.alive = true; bibi.hp = 50; bibi.shieldCharges = 0; bibi.groggyTime = 0; bibi.permaGroggy = false;
    bibi.x = 400; bibi.y = 400;
    const bhb = g.getHurtbox(bibi);
    shot.x = bhb.x + bhb.w / 2 - shot.w / 2;
    shot.y = bhb.y + bhb.h / 2 - shot.h / 2;
    const hp0 = bibi.hp;
    for (let i = 0; i < 30 && shot.alive; i++) g.updateDayaShot(shot, 0.016);
    expect(bibi.hp).toBeLessThan(hp0);
  });

  // P2 가시: 발동 순간 플레이어 발밑 1곳에 위험표시(telegraph) 고정.
  t.test("가시(P2): 발동 시 플레이어 발밑에 telegraph 가시 예약", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const daya = g.bossOf("daya");
    g.dayaSpikes.length = 0;
    g.spawnDayaSpike(daya);
    expect(g.dayaSpikes.length).toBe(1);
    expect(g.dayaSpikes[0].state).toBe("telegraph");
  });

  // P2 가시: telegraph는 spikeTelegraph(2.0s) 경과 후 updateDayaSpikes에서 active로 전이한다.
  t.test("가시(P2): telegraph가 시간 경과 후 active로 전이", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const daya = g.bossOf("daya");
    g.dayaSpikes.length = 0;
    g.spawnDayaSpike(daya);
    let sawActive = false;
    for (let i = 0; i < 130 && g.dayaSpikes.length; i++) {
      g.updateDayaSpikes(0.016);
      if (g.dayaSpikes.length && g.dayaSpikes[0].state === "active") { sawActive = true; break; }
    }
    expect(sawActive).toBe(true);
  });

  // P2 가시: telegraph 뒤 active로 솟아 그 자리의 플레이어를 때린다(패링 불가·회피 전용).
  // active 가시를 플레이어 발밑에 직접 두고 피격(hp 감소)을 결정적으로 본다.
  t.test("가시(P2): active 가시에 플레이어 피격", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const daya = g.bossOf("daya");
    const p = g.player;
    p.hp = 1e9; p.dead = false;
    const phb = g.getHurtbox(p);
    g.dayaSpikes.length = 0;
    g.dayaSpikes.push({ x: phb.x + phb.w / 2, surfaceY: p.y + p.h, state: "active", t: 0, shooter: daya, hitPlayer: false, alive: true });
    const hp0 = p.hp;
    for (let i = 0; i < 20; i++) g.updateDayaSpikes(0.016);
    expect(p.hp).toBeLessThan(hp0);
  });

  // P3 비: rainCount(20)개를 예약 → processDayaRain이 시간차로 rainDrop을 스폰한다.
  t.test("비(P3): 20개 예약 후 rainDrop으로 낙하 스폰", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const daya = g.bossOf("daya");
    g.projectiles.length = 0; g.dayaRainQueue.length = 0;
    g.scheduleDayaRain(daya);
    expect(g.dayaRainQueue.length).toBe(20);
    for (let i = 0; i < 200; i++) g.processDayaRain(0.016);
    expect(g.projectiles.filter((p) => p.kind === "rainDrop").length).toBeGreaterThan(0);
  });

  // P3 비: 낙하 방울은 패링하면 반사 없이 그냥 부서진다(소멸).
  t.test("비(P3): 낙하 방울은 패링 시 반사 없이 소멸", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const daya = g.bossOf("daya");
    g.projectiles.length = 0; g.dayaRainQueue.length = 0;
    g.scheduleDayaRain(daya);
    for (let i = 0; i < 200; i++) g.processDayaRain(0.016);
    const drop = g.projectiles.find((p) => p.kind === "rainDrop");
    expect(drop).toBeTruthy();
    g.player.attack = g.eval("ATTACKS").playerSlash;
    g.player.attackElapsed = 0.05; g.player.attackDir = 1;
    const ahb = g.getAttackHitbox();
    drop.x = ahb.x + 2; drop.y = ahb.y + 2; drop.parryLock = 0;
    g.updateRainDrop(drop, 0.016);
    expect(drop.alive).toBe(false);
  });
});

// ── 비비: 근접 #1#2 → 투사체 #3#4 → 방어막 #5 ────────────────────────────────
// 스펙 [[bibi-boss-spec]]. 여기서는 투사체·방어막 위주(근접 패링/취약은 공통 전투에서 커버).
suite("스테이지2 · 비비", (t) => {
  // #3 4연 단검: scheduleVolley가 PROJ_VOLLEY_COUNT개를 시차 대기열(pendingDaggers)에
  // 예약하고, 이후 update 루프가 시차대로 발사한다. 큰 단검까지 함께 띄워 투사체 전 경로
  // (이동/플레이어피격/소멸/렌더)를 크래시 없이 돌리는 스모크를 겸한다(불사로 띄움).
  t.test("#3 4연 단검: scheduleVolley가 예약 후 update 경로에서 전부 발사", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    g.player.hp = 1e9; // 스모크 동안 불사(죽으면 update early-return으로 경로가 멈춤)
    const bibi = g.bossOf("bibi");
    g.fireBigDagger(bibi);
    g.scheduleVolley(bibi);
    expect(g.eval("pendingDaggers.length")).toBe(g.eval("PROJ_VOLLEY_COUNT")); // 4 예약
    g.step(150); // ~2.4s: 시차(250ms×4) 발사 완료 + 전 경로 스모크
    expect(g.eval("pendingDaggers.length")).toBe(0); // 전부 소진
  });

  // #4 큰 단검 상태기계: 패링으로 멈춘(stopped) 큰 단검은 fuse 만료 시 8방향 파편으로
  // 폭발한다(PROJ_EXPLOSION_COUNT). 파편은 데미지 있는 작은 단검(kind "dagger").
  t.test("#4 큰 단검: stopped fuse 만료 시 8방향 파편 폭발", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const N = g.eval("PROJ_EXPLOSION_COUNT");
    const W = g.eval("BIG_DAGGER_W"), H = g.eval("BIG_DAGGER_H");
    g.projectiles.length = 0;
    const big = g.makeProjectile(g.player.x + 220, g.player.y, -120, 0, { w: W, h: H, kind: "big", damage: 1, parryable: true });
    big.state = "stopped"; big.fuse = 0.05; // 다음 몇 프레임 안에 폭발
    g.projectiles.push(big);
    for (let i = 0; i < 6; i++) g.update(1, 0.016); // fuse(0.05) 만료 → 폭발
    const frags = g.projectiles.filter((p) => p.kind === "dagger");
    expect(frags.length).toBe(N);
    expect(frags.every((p) => p.damage > 0)).toBe(true); // 파편은 데미지 있음
  });

  // #4 2차 패링: 멈춘 큰 단검을 다시 패링하면 returning(다야로 호밍). 다야에 도달하면
  // 방어력을 깎는다(DAGGER_DEFENSE_DROP). 다야 근처에서 출발시켜 도달을 확실히 본다.
  t.test("#4 큰 단검: 패링→returning→다야 도달 시 방어력 감소", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const W = g.eval("BIG_DAGGER_W"), H = g.eval("BIG_DAGGER_H");
    const daya = g.bossOf("daya");
    g.projectiles.length = 0;
    const big = g.makeProjectile(daya.x - 80, daya.y + 10, 120, 0, { w: W, h: H, kind: "big", damage: 1, parryable: true });
    g.projectiles.push(big);
    g.parryBigDagger(big); // flying → stopped
    expect(big.state).toBe("stopped");
    g.parryBigDagger(big); // stopped → returning(다야로)
    expect(big.state).toBe("returning");
    const defBefore = daya.defense;
    for (let i = 0; i < 60; i++) g.update(1, 0.016);
    expect(g.bossOf("daya").defense).toBeLessThan(defBefore);
  });

  // #5 방어막: shieldCharges만큼 피격을 흡수(HP 무피해)하고, 막이 깨진 뒤의 다음 타격부터
  // HP가 깎인다. (충전 흡수는 데미지 무관·HP 보존, 히트스톱만.)
  t.test("#5 방어막: 충전만큼 흡수(HP 보존) 후 깨지면 HP 감소", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const bibi = g.bossOf("bibi");
    const hpBefore = bibi.hp;
    bibi.shieldCharges = 2;
    g.hitEnemy(bibi); g.hitEnemy(bibi); // 2회 흡수
    expect(bibi.shieldCharges).toBe(0);
    expect(bibi.hp).toBe(hpBefore); // 흡수 동안 HP 보존
    g.hitEnemy(bibi); // 막 깨진 뒤 → HP 감소
    expect(bibi.hp).toBeLessThan(hpBefore);
  });

  // #5 방어막 재시전: 쿨(shieldCd)이 만료됐고 막이 없으면(shieldCharges 0) updateShields가
  // 즉시 막을 다시 친다(blocks만큼 충전).
  t.test("#5 방어막: 쿨 만료 + 막 없음 → updateShields가 재시전", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const bibi = g.bossOf("bibi");
    const blocks = bibi.ai.shield.blocks;
    bibi.shieldCd = 0; bibi.shieldCharges = 0;
    g.updateShields(0.016);
    expect(bibi.shieldCharges).toBe(blocks);
  });
});

// ── 키디언: 직선 슈터(라인 공격·패링 봉인·광폭화) ──────────────────────────────
// 스펙 [[kidian-spec]]: 5~7초 쿨, 가로/세로 라인, 1초 예고 동안만 패링, 5회 패링=봉인(처치).
suite("스테이지2 · 키디언", (t) => {
  // 라인 발사: spawnLine은 예고(telegraph) 상태의 라인 1개를 띄운다.
  t.test("라인 발사: spawnLine 시 telegraph 라인 1개 생성", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const kid = g.bossOf("kidian");
    g.lines.length = 0;
    g.spawnLine(kid);
    expect(g.lines.length).toBe(1);
    expect(g.lines[0].state).toBe("telegraph");
  });

  // 라인 피격: firing 상태 라인이 플레이어 피격박스 정중앙을 관통하면 가로/세로 모두에서
  // 플레이어가 맞는다(데미지 2). 불사로 띄워 죽지 않게 하고 hp 감소만 확인.
  t.test("라인 피격: 가로·세로 firing 라인이 플레이어를 관통하면 피격", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const kid = g.bossOf("kidian");
    const p = g.player;
    p.hp = 1e9;
    const phb = g.getHurtbox(p);
    for (const ax of ["h", "v"]) {
      g.lines.length = 0;
      const pos = ax === "h" ? phb.y + phb.h / 2 : phb.x + phb.w / 2;
      g.lines.push({ axis: ax, pos, state: "firing", t: 0, shooter: kid, hitPlayer: false, alive: true });
      const hp0 = p.hp;
      for (let i = 0; i < 12; i++) g.update(1, 0.016);
      expect(p.hp).toBeLessThan(hp0);
    }
  });

  // 봉인: 라인을 sealParries(5)회 패링하면 영구 봉인 = 처치(alive=false). HP가 없는 적이라
  // 봉인이 처치를 대체한다(클리어 조건 enemies.every(!alive)에 편입).
  t.test("봉인: 라인 5회 패링 시 영구 봉인(alive=false)", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const kid = g.bossOf("kidian");
    const seal = kid.ai.lineShooter.sealParries;
    g.lines.length = 0; kid.lineParries = 0; kid.lineEnraged = false; kid.alive = true;
    for (let i = 0; i < seal; i++) { g.spawnLine(kid); g.parryLine(g.lines[g.lines.length - 1]); }
    expect(kid.alive).toBe(false);
    expect(kid.lineParries).toBeGreaterThan(seal - 1); // ≥ seal
  });

  // 비비 포식 → 광폭화 연동: 같은 group의 다야 방어력 최저(피해 증폭) + 키디언 lineEnraged.
  t.test("광폭화: 비비 포식 ripple로 다야 방어력 최저 + 키디언 lineEnraged", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const MIN = g.eval("DAGGER_DEFENSE_MIN");
    const bibi = g.bossOf("bibi");
    g.applyDevourRipple(bibi);
    expect(g.bossOf("daya").defense).toBe(MIN);
    expect(g.bossOf("kidian").lineEnraged).toBe(true);
  });

  // 광폭화 패링 불가: 광폭 상태의 라인은 예고 중 플레이어 공격을 겹쳐도 패링되지 않는다
  // (봉인도 자연히 불가). lineParries가 늘지 않고 라인도 소멸하지 않는다.
  t.test("광폭화: 라인이 패링 불가(공격을 겹쳐도 lineParries 불변)", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const kid = g.bossOf("kidian");
    kid.lineEnraged = true; kid.lineParries = 0;
    g.lines.length = 0;
    g.spawnLine(kid);
    g.player.attack = g.eval("ATTACKS").playerSlash;
    g.player.attackElapsed = 0.05; g.player.attackDir = 1; g.player.attackHits.clear();
    g.updateLines(0.02);
    expect(kid.lineParries).toBe(0);
    expect(g.lines.length).toBe(1); // 패링 소멸 없음
  });

  // 광폭화 쿨 3배: updateLineShooters의 쿨 감소가 enrageCdMult(3)배로 빨라진다.
  // lineCd 5에서 dt 1.0이면 1*3=3을 깎아 2가 된다.
  t.test("광폭화: 쿨 감소가 3배(enrageCdMult)", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const kid = g.bossOf("kidian");
    kid.lineEnraged = true;
    kid.lineCd = 5;
    g.updateLineShooters(1.0);
    expect(kid.lineCd).toBeCloseTo(2); // 5 - 1*3
  });

  // 봉인 유지: 이미 봉인된(alive=false) 키디언은 비비 재포식 ripple의 group 루프에서
  // !e.alive 가드로 건너뛰어, 다시 살아나지 않는다(부활 금지).
  t.test("봉인 유지: 봉인된 키디언은 재포식 ripple에도 부활하지 않음", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const kid = g.bossOf("kidian");
    const seal = kid.ai.lineShooter.sealParries;
    g.lines.length = 0; kid.lineParries = 0; kid.lineEnraged = false;
    for (let i = 0; i < seal; i++) { g.spawnLine(kid); g.parryLine(g.lines[g.lines.length - 1]); }
    expect(kid.alive).toBe(false);
    g.applyDevourRipple(g.bossOf("bibi")); // 재포식 ripple
    expect(g.bossOf("kidian").alive).toBe(false); // 여전히 죽어 있음
  });
});

// ── 포식(S): 그로기 마무리 + 광역 히트박스 ──────────────────────────────────
// 스펙 [[bibi-boss-spec]]/[[skill-input-scheme]]. 히트박스 3배 + 그로기 적 HP 무관 즉시 처치.
suite("스테이지2 · 포식", (t) => {
  // 포식 공격 히트박스는 평타의 3배(가로 300·세로 180)로 광역. active 구간에서만 생성.
  t.test("히트박스 3배: 가로 300 · 세로 180", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    g.player.attack = g.eval("ATTACKS.devour"); // const 접근은 eval 탈출구로
    g.player.attackElapsed = 0.31;
    g.player.attackDir = 1;
    const hb = g.getAttackHitbox();
    expect(hb).toBeTruthy();
    expect(hb.w).toBe(300);
    expect(hb.h).toBe(180);
  });

  // 포식 처치: 그로기 상태의 비비를(방어막 없을 때) 때리면 HP가 남아도 즉시 사망.
  t.test("포식 처치: 그로기 비비를 HP 무관 즉시 처치", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const bibi = g.bossOf("bibi");
    bibi.groggyTime = 5; bibi.hp = 99; bibi.shieldCharges = 0;
    g.hitEnemy(bibi, 0.01, true); // 포식 공격 → 즉시 사망(HP 남아도)
    expect(bibi.alive).toBe(false);
  });

  // 포식 윈드업 잠금 경로: 포식을 직접 걸고 끝까지(>0.55s) 진행해도 크래시 없이 종료된다
  // (player.attack이 null로 돌아옴).
  t.test("포식 윈드업: 끝까지 진행 시 크래시 없이 종료(attack=null)", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    g.player.attack = g.eval("ATTACKS.devour");
    g.player.attackElapsed = 0; g.player.attackHits.clear();
    for (let i = 0; i < 40; i++) g.step(1); // ~0.64s > 전체 0.55s
    expect(g.player.attack).toBe(null);
  });
});
