// 스테이지1 — 사료스탕스(베니/루포/티그 3인 동시전). 전용 스펙 메모리가 없어
// data.js ENEMY_AI + combat.js(힘겨루기·devour-ripple) + main.js(group 연동)에 1:1 anchor한다.
//   실행: node tools/test.js stage1
// 하니스 빠른 참조는 cases/common.js 머리말 참고(loadGame/eval/step/bossOf/expect).
//   powerStruggle은 top-level let이라 EPILOGUE에 없다 → g.eval("powerStruggle")로 접근.
const { suite, expect, loadGame } = require("../harness");

// ── 배치 / AI 특성 ───────────────────────────────────────────────────────────
// data.js ENEMY_AI: benny(bennySlash + rangeReplace bennyStruggle, floorPref 1),
//   lupo(blink lupoBlink, floorPref -1), tig(dash tigDash needSameRow, floorPref 0).
// main.js startStage: 셋을 같은 group(자기 포함 배열)으로 묶는다(포식/힘겨루기 전파용).
suite("스테이지1 · 배치/AI", (t) => {
  t.test("3인(베니/루포/티그)이 같은 group으로 묶여 배치", () => {
    const g = loadGame();
    g.startStage("사료스탕스");
    expect(g.enemies.length).toBe(3);
    const benny = g.bossOf("benny"), lupo = g.bossOf("lupo"), tig = g.bossOf("tig");
    expect(!!(benny && lupo && tig)).toBe(true);
    // group은 enemies 배열 그 자체(서로·자기 포함 참조).
    for (const e of [benny, lupo, tig]) expect(e.group).toBe(g.enemies);
  });

  t.test("베니: bennySlash 평타 + rangeReplace 힘겨루기(bennyStruggle), floorPref 1", () => {
    const g = loadGame();
    g.startStage("사료스탕스");
    const benny = g.bossOf("benny");
    expect(benny.ai.basic).toBe("bennySlash");
    expect(benny.ai.special.kind).toBe("rangeReplace");
    expect(benny.ai.special.attack).toBe("bennyStruggle");
    expect(benny.ai.floorPref).toBe(1); // 한 층 아래 선호
  });

  t.test("루포: blink 블링크(lupoBlink), floorPref -1", () => {
    const g = loadGame();
    g.startStage("사료스탕스");
    const lupo = g.bossOf("lupo");
    expect(lupo.ai.special.kind).toBe("blink");
    expect(lupo.ai.special.attack).toBe("lupoBlink");
    expect(lupo.ai.floorPref).toBe(-1); // 한 층 위 선호
  });

  t.test("티그: dash 돌진(tigDash, needSameRow), floorPref 0", () => {
    const g = loadGame();
    g.startStage("사료스탕스");
    const tig = g.bossOf("tig");
    expect(tig.ai.special.kind).toBe("dash");
    expect(tig.ai.special.attack).toBe("tigDash");
    expect(tig.ai.special.needSameRow).toBe(true);
    expect(tig.ai.floorPref).toBe(0); // 같은 층 선호
  });
});

// ── 힘겨루기(power-struggle) ──────────────────────────────────────────────────
// combat.js: bennyStruggle는 triggersStruggle 공격 → 패링 시 누적과 무관하게 즉시
//   enterPowerStruggle. updatePowerStruggle은 연타(Input attack)로 게이지를 채워
//   MAX 도달 시 승리(group 전원 그로기 + 충격파), 0으로 밀리면 패배(피해).
suite("스테이지1 · 힘겨루기", (t) => {
  // triggersStruggle 공격을 패링하면 onParry가 누적 경로를 건너뛰고 즉시 힘겨루기 진입.
  t.test("진입: bennyStruggle 패링 시 누적 무관 즉시 힘겨루기", () => {
    const g = loadGame();
    g.startStage("사료스탕스");
    const benny = g.bossOf("benny");
    benny.attack = g.eval("ATTACKS").bennyStruggle; // triggersStruggle 공격
    benny.groggyGauge = 0; // 누적은 0이지만 즉시 진입해야 한다
    g.onParry(benny);
    const ps = g.eval("powerStruggle");
    expect(ps.active).toBe(true);
    expect(ps.enemy).toBe(benny);
  });

  // 연타로 게이지를 MAX까지 채우면 승리 → group 전원 그로기(+ 충격파). MAX-1에서
  // attack을 한 번 더 눌러(연타 스텁) 임계를 넘긴다.
  t.test("승리: 게이지 MAX 도달 시 group 전원 그로기", () => {
    const g = loadGame();
    g.startStage("사료스탕스");
    const benny = g.bossOf("benny");
    benny.attack = g.eval("ATTACKS").bennyStruggle;
    g.enterPowerStruggle(benny);
    const MAX = g.eval("POWER_STRUGGLE_GAUGE_MAX");
    g.eval(`powerStruggle.gauge = ${MAX - 1};`);
    g.eval("Input.justPressed=(a)=>a==='attack'; Input.isDown=()=>false;");
    g.updatePowerStruggle(0.016); // +1 연타 → MAX 도달 → 승리
    expect(g.eval("powerStruggle.active")).toBe(false); // 승리로 종료
    for (const e of g.enemies) expect(e.groggyTime).toBeGreaterThan(0); // 전원 그로기
  });

  // 게이지가 0으로 밀리면(연타 없음 + 자연 감소) 패배 → 플레이어 피해.
  t.test("패배: 게이지 0으로 밀리면 플레이어 피해", () => {
    const g = loadGame();
    g.startStage("사료스탕스");
    const benny = g.bossOf("benny");
    benny.attack = g.eval("ATTACKS").bennyStruggle;
    g.enterPowerStruggle(benny);
    g.eval("powerStruggle.gauge = 0.01;"); // 거의 0
    g.player.hp = 100; g.player.dead = false;
    g.eval("Input.justPressed=()=>false; Input.isDown=()=>false;"); // 연타 없음
    g.updatePowerStruggle(0.5); // 감소율 BASE*0.5=0.5 > 0.01 → 0 도달 → 패배
    expect(g.eval("powerStruggle.active")).toBe(false);
    expect(g.player.hp).toBeLessThan(100); // 패배 피해
  });
});

// ── 포식 연동(devour-ripple, combat.js applyDevourRipple) ─────────────────────
// 누구를 포식했느냐에 따라 남은 형제의 상태가 3분기로 갈린다.
suite("스테이지1 · 포식 연동", (t) => {
  // 티그 포식 → 남은 둘(베니/루포) 영구 그로기(가장 쉬운 공략 루트).
  t.test("티그 포식 → 남은 둘 permaGroggy", () => {
    const g = loadGame();
    g.startStage("사료스탕스");
    const tig = g.bossOf("tig");
    tig.alive = false; // 포식당함
    g.applyDevourRipple(tig);
    expect(g.bossOf("benny").permaGroggy).toBe(true);
    expect(g.bossOf("lupo").permaGroggy).toBe(true);
  });

  // 부하 1명(베니)만 포식 → 티그 폭주(berserk) + 남은 부하(루포) 그로기.
  t.test("부하 1명 포식 → 티그 berserk + 남은 부하 그로기", () => {
    const g = loadGame();
    g.startStage("사료스탕스");
    const benny = g.bossOf("benny");
    benny.alive = false; // 베니만 포식
    g.applyDevourRipple(benny);
    expect(g.bossOf("tig").berserk).toBe(true);
    expect(g.bossOf("lupo").groggyTime).toBeGreaterThan(0);
    expect(g.bossOf("tig").invincible).toBeFalsy(); // 1명 포식은 무적 아님
  });

  // 부하 2명(베니+루포) 다 포식 → 티그 무적 폭주 + 자가 체력 감소(selfDrain).
  t.test("부하 2명 다 포식 → 티그 무적 + selfDrain", () => {
    const g = loadGame();
    g.startStage("사료스탕스");
    const benny = g.bossOf("benny"), lupo = g.bossOf("lupo");
    benny.alive = false; lupo.alive = false; // 둘 다 포식
    g.applyDevourRipple(lupo);
    const tig = g.bossOf("tig");
    expect(tig.berserk).toBe(true);
    expect(tig.invincible).toBe(true);
    expect(tig.selfDrain).toBe(g.eval("TIG_SELF_DRAIN"));
  });

  // 폭주 추격: chaseStep의 이동량이 평소의 1/BERSERK_INTERVAL_MULT(=2)배로 빨라진다.
  t.test("폭주: chaseStep 이동량이 평소의 2배(BERSERK_INTERVAL_MULT)", () => {
    const g = loadGame();
    g.startStage("사료스탕스");
    const mult = g.eval("BERSERK_INTERVAL_MULT"); // 0.5 → 1/0.5 = 2배
    const tig = g.bossOf("tig");
    tig.facing = 1;
    // 평소 이동량.
    tig.berserk = false; tig.x = 100;
    g.chaseStep(tig, 1);
    const normal = tig.x - 100;
    // 폭주 이동량.
    tig.berserk = true; tig.x = 100;
    g.chaseStep(tig, 1);
    const berserk = tig.x - 100;
    expect(berserk).toBeCloseTo(normal / mult); // = normal * 2
  });
});
