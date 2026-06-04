// 스테이지5 — M.E.O.W 솔로전. 스펙 [[stage5-meow-spec]]와 1:1 대응.
//   실행: node tools/test.js stage5
// 하니스 빠른 참조는 cases/common.js 머리말 참고(loadGame/eval/step/bossOf/expect).
//   교전 = 4층 높이 거대 보스(M.E.O.W) + 드론. 0단계(맵+뼈대)에선 M.E.O.W는 AI 없는
//   정지형 더미(meow=stationary)다 — 드론·본체 4패턴·그로기15·처치 시퀀스는 이후 단계.
const { suite, expect, loadGame } = require("../harness");

// ── 0단계: 맵 + 보스 스폰 뼈대 ───────────────────────────────────────────────
suite("스테이지5 · 맵/스폰 뼈대", (t) => {
  // 맵: 75×30, 기본 4층 좌표(간격 80px), 1층 바닥은 막힌 #(구멍 없음).
  t.test("맵: 75×30·기본 층 좌표·1층 바닥(row25~29) 막힌 #", () => {
    const g = loadGame();
    g.startStage("스테이지 5");
    const stage = g.stage;
    expect(stage.cols).toBe(75);
    expect(stage.rows).toBe(30);
    expect(stage.floorSurfaces).toEqual([260, 340, 420, 500]);
    // 1층 바닥(row25~29): 구멍 없이 꽉 찬 solid(플레이어·보스가 안 빠지게).
    for (let r = 25; r < 30; r++)
      for (let c = 0; c < stage.cols; c++) expect(stage.tiles[r][c].solid).toBeTruthy();
  });

  // 2·4층(row13·row21)은 구멍 위치가 동일하고, 3층(row17)은 그 사이로 어긋난다.
  // → 내려갈 때 좌우 위빙 강제. 구멍 = solid가 아닌 칸(empty).
  t.test("구멍: 2·4층 동일 위치 / 3층 엇갈림(위빙 강제)", () => {
    const g = loadGame();
    g.startStage("스테이지 5");
    const tiles = g.stage.tiles;
    const holesOf = (r) => {
      const h = [];
      for (let c = 0; c < g.stage.cols; c++) if (!tiles[r][c].solid) h.push(c);
      return h;
    };
    const h4 = holesOf(13); // 4층
    const h3 = holesOf(17); // 3층
    const h2 = holesOf(21); // 2층
    // 4층·2층 구멍 위치가 정확히 같다(동일 x).
    expect(h2).toEqual(h4);
    // 3층은 구멍이 있지만 2·4층과 한 칸도 겹치지 않는다(엇갈림).
    expect(h3.length).toBeGreaterThan(0);
    expect(h3.some((c) => h4.includes(c))).toBeFalsy();
  });

  // 구멍 폭: 플레이어(폭 45px = 2.25타일)가 온전히 빠지려면 ≥3타일이어야 한다.
  // 각 구멍의 연속 길이가 3 이상인지 확인(2타일 구멍은 양옆 솔리드에 걸려 안 떨어짐).
  t.test("구멍 폭: 연속 ≥3타일(플레이어가 통과 가능)", () => {
    const g = loadGame();
    g.startStage("스테이지 5");
    const tiles = g.stage.tiles;
    for (const r of [13, 17, 21]) {
      let run = 0;
      for (let c = 0; c < g.stage.cols; c++) {
        if (!tiles[r][c].solid) {
          run++;
        } else {
          if (run > 0) expect(run).toBeGreaterThan(2); // 빈칸 구간이 있으면 ≥3
          run = 0;
        }
      }
      if (run > 0) expect(run).toBeGreaterThan(2);
    }
  });

  // 플레이어 스폰: 맨 위(4층) 왼쪽 — 보스(우측) 반대편, 구멍이 아닌 발판 위.
  t.test("스폰: 플레이어는 4층(맨 위) 왼쪽에서 시작", () => {
    const g = loadGame();
    g.startStage("스테이지 5");
    expect(g.stage.spawn).toBeTruthy();
    expect(g.player.x).toBeLessThan(200); // 왼쪽
    // 발이 4층 표면(y≈260) 근처(아래 1층 바닥이 아니라 맨 위 층).
    expect(g.player.y + g.player.h).toBeLessThan(290);
  });

  // M.E.O.W 스폰: 한쪽 변(우측), 4층 전체 높이의 거대 보스, HP 180, 정지형 더미.
  t.test("스폰: M.E.O.W는 우측에 4층 높이로 서고 HP 180·정지형", () => {
    const g = loadGame();
    g.startStage("스테이지 5");
    const meow = g.bossOf("meow");
    expect(meow).toBeTruthy();
    expect(meow.alive).toBeTruthy();
    expect(meow.hp).toBe(180);
    expect(g.enemies.length).toBe(1);
    // 거대 보스: 4층 전체 높이(상당히 큼) + 우측 배치.
    expect(meow.h).toBeGreaterThan(200); // 4층 높이(≈280)
    expect(meow.x).toBeGreaterThan(g.stage.widthPx / 2); // 우측 변
    // 발이 1층 바닥(y≈500)에 닿아 있다(4층 높이로 우뚝).
    expect(meow.y + meow.h).toBeCloseTo(500, 1);
    // 0단계는 AI 없는 정지형 더미. floating으로 떠 있어(중력·세로충돌 면제) 솔리드
    // 발판과 겹쳐도 위로 안 밀린다(좌우 이동은 이후 단계에서 x만 옮김).
    expect(meow.ai.stationary).toBeTruthy();
    expect(meow.floating).toBeTruthy();
    // group은 자기 포함 같은 배열(이후 드론/처치 연동용).
    expect(meow.group).toBe(g.enemies);
  });

  // 클리어 조건(기본 전멸 = M.E.O.W HP 0). 살아 있으면 미클리어, 죽으면 클리어.
  // (엘레나/아멜리아 처치 시퀀스는 프롬프트3에서 연결.)
  t.test("클리어: M.E.O.W 사망 시 전멸 성립", () => {
    const g = loadGame();
    g.startStage("스테이지 5");
    const alive = () => g.enemies.every((e) => !e.alive);
    expect(alive()).toBeFalsy(); // 생존 → 미클리어
    g.bossOf("meow").alive = false;
    expect(alive()).toBeTruthy(); // 사망 → 클리어
  });
});
