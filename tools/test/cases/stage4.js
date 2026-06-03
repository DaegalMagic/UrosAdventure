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

  // 0단계 더미: 정지형(stationary)이라 시간이 흘러도 제자리(가만히 서 있음).
  t.test("더미: 정지형이라 여러 프레임 흘러도 x가 안 변한다", () => {
    const g = loadGame();
    g.startStage("스테이지 4");
    const rim = g.bossOf("rim");
    const shady = g.bossOf("shady");
    expect(rim.ai.stationary).toBeTruthy();
    expect(shady.ai.stationary).toBeTruthy();
    const rimX = rim.x;
    const shadyX = shady.x;
    g.update(60); // 약 1초
    expect(rim.x).toBe(rimX);
    expect(shady.x).toBe(shadyX);
    expect(rim.alive).toBeTruthy(); // 가만히 둬도 안 죽음(selfDrain 없음)
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
