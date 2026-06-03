// 스테이지2 — 다야/비비/키디언/포식. 기존 verify-split.js의 통합 driver를 보스별·
// 스펙별 named 케이스로 분해해 이관한다(진행 중). 스펙: docs/메모리 daya/bibi/kidian.
const { suite, expect, loadGame } = require("../harness");

suite("스테이지2 · 다야", (t) => {
  t.test("부채꼴(P1): 3발 dayaShot이 incoming으로 생성", () => {
    const g = loadGame();
    g.startStage("스테이지 2");
    const daya = g.bossOf("daya");
    g.projectiles.length = 0;
    g.fireDayaFan(daya);
    expect(g.projectiles.length).toBe(3);
    expect(g.projectiles.every((p) => p.kind === "dayaShot" && p.state === "incoming")).toBe(true);
  });

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
});

suite("스테이지2 · 포식", (t) => {
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
});
