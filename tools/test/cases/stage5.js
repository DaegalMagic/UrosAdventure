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

// ── 1단계: 드론 시스템 ───────────────────────────────────────────────────────
// 드론 = 이 스테이지 핵심 메커니즘. 출몰(4s 우변)→궤도이동(200px·240px/s)→탄(3s)→
// 탄패링(쏜 드론에 1뎀)→HP1 낙하→막타 발사→본체 명중(3뎀+그로기3). SSOT [[stage5-meow-spec]].
suite("스테이지5 · 드론", (t) => {
  // 출몰: M.E.O.W 생존 중 4초마다 화면 우변에서 드론 1기(비행체). 4초 전엔 없다.
  t.test("출몰: 4초마다 우변에서 드론 1기(floating)", () => {
    const g = loadGame();
    g.startStage("스테이지 5");
    g.eval("Math.random=()=>0.5"); // 출몰 y 결정적
    g.update(240); // 3.84s < 4s → 아직 없음
    expect(g.enemies.filter((e) => e.role === "drone").length).toBe(0);
    g.update(40); // 누적 4.48s → 정확히 1기 출몰(다음은 8s)
    const drones = g.enemies.filter((e) => e.role === "drone");
    expect(drones.length).toBe(1);
    expect(drones[0].floating).toBeTruthy(); // 비행체(중력·세로충돌 면제)
    expect(drones[0].x + drones[0].w / 2).toBeGreaterThan(g.stage.widthPx / 2); // 우변에서
    expect(drones[0].hp).toBe(g.eval("DRONE_HP")); // HP 5
  });

  // 이동: 목표점으로 DRONE_SPEED(=MOVE_SPEED×1.2=240px/s)로 다가간다. 리타깃을 멀리
  // 미뤄 한 프레임 변위가 정확히 240×dt인지 본다(목표를 멀리 둬 클램프 미적용).
  t.test("이동: 목표점으로 240px/s(=플레이어×1.2)", () => {
    const g = loadGame();
    g.startStage("스테이지 5");
    g.eval("Math.random=()=>0");
    g.spawnDrone();
    const d = g.enemies.find((e) => e.role === "drone");
    d.x = 700; d.y = 300; d.droneRetarget = 999; // 리타깃 막기
    d.droneTx = 5000; d.droneTy = d.y + d.h / 2; // 멀리(순수 +x 방향)
    const x0 = d.x, y0 = d.y;
    g.update(1, 0.016);
    const mag = Math.hypot(d.x - x0, d.y - y0);
    expect(mag).toBeCloseTo(g.eval("DRONE_SPEED") * 0.016, 0.05); // 240×0.016 = 3.84
  });

  // 탄: 플레이어를 맞히면 dmg 1(패링 안 하면).
  t.test("탄: 플레이어 명중 시 dmg 1", () => {
    const g = loadGame();
    g.startStage("스테이지 5");
    g.eval("Math.random=()=>0");
    g.spawnDrone();
    const d = g.enemies.find((e) => e.role === "drone");
    const p = g.player;
    const hp0 = p.hp;
    g.fireDroneBullet(d);
    const b = g.projectiles.find((pr) => pr.kind === "droneBullet");
    expect(b).toBeTruthy();
    b.x = p.x + p.w / 2; b.y = p.y + p.h / 2; // 플레이어 위
    p.attack = null; // 패링 자세 없음
    g.updateDroneBullet(b, 0.016);
    expect(p.hp).toBe(hp0 - 1);
    expect(b.alive).toBeFalsy();
  });

  // 탄 패링: 패링하면 탄이 '쏜 드론'을 역호밍 → 명중 시 그 드론에 1뎀.
  t.test("탄 패링: 쏜 드론으로 되돌아가 1뎀", () => {
    const g = loadGame();
    g.startStage("스테이지 5");
    g.eval("Math.random=()=>0");
    g.spawnDrone();
    const d = g.enemies.find((e) => e.role === "drone");
    d.x = 800; d.y = 300;
    const p = g.player;
    p.x = 400; p.y = 300;
    g.fireDroneBullet(d);
    const b = g.projectiles.find((pr) => pr.kind === "droneBullet");
    // 플레이어 공격 히트박스 안에 탄을 두고 패링 → 반사 전환.
    p.attack = g.eval("ATTACKS").playerSlash; p.attackElapsed = 0.05; p.attackDir = 1;
    const atk = g.getAttackHitbox();
    b.x = atk.x + 10; b.y = atk.y + 10;
    g.updateDroneBullet(b, 0.016);
    expect(b.state).toBe("reflected");
    // 반사탄을 드론 위로 옮겨 한 프레임 더 → 그 드론에 1뎀.
    b.x = d.x + d.w / 2; b.y = d.y + d.h / 2;
    const hp0 = d.hp;
    g.updateDroneBullet(b, 0.016);
    expect(d.hp).toBe(hp0 - 1);
    expect(b.alive).toBeFalsy();
  });

  // HP 1: 그로기 + 바닥 낙하(영구 그로기·floating 해제 → 중력으로 떨어짐, 공격 중단).
  t.test("HP 1: 그로기 + 바닥 낙하(중력 적용)", () => {
    const g = loadGame();
    g.startStage("스테이지 5");
    g.eval("Math.random=()=>0");
    g.spawnDrone();
    const d = g.enemies.find((e) => e.role === "drone");
    d.x = 400; d.y = 100; // 맵 중앙 빈 공간(추격 끝 위치 — 우변 벽 임베드 회피)
    d.hp = 2;
    g.hitEnemy(d, 1); // 2→1 → 낙하 진입
    expect(d.hp).toBe(1);
    expect(d.droneFell).toBeTruthy();
    expect(d.permaGroggy).toBeTruthy();
    expect(d.floating).toBeFalsy(); // 중력 적용
    expect(d.alive).toBeTruthy(); // 아직 안 죽음(막타 대기)
    const y0 = d.y;
    g.update(10); // 물리 패스가 떨군다
    expect(d.y).toBeGreaterThan(y0);
  });

  // 막타: 죽는 마지막 타격 → 죽는 대신 '플레이어가 보는 방향'으로 발사된다.
  t.test("막타: facing 방향으로 발사(죽지 않고 발사체 전환)", () => {
    const g = loadGame();
    g.startStage("스테이지 5");
    g.eval("Math.random=()=>0");
    g.spawnDrone();
    const d = g.enemies.find((e) => e.role === "drone");
    d.hp = 1; g.droneFall(d);
    g.player.facing = 1; // 오른쪽
    g.hitEnemy(d, 1); // 막타(그로기 1.5뎀 → hp≤0)
    expect(d.launched).toBeTruthy();
    expect(d.alive).toBeTruthy(); // 죽지 않고 발사체로
    expect(d.launchVx).toBeGreaterThan(0); // 오른쪽으로
    // 왼쪽을 보면 왼쪽으로 발사된다(대조).
    const g2 = loadGame();
    g2.startStage("스테이지 5");
    g2.eval("Math.random=()=>0");
    g2.spawnDrone();
    const d2 = g2.enemies.find((e) => e.role === "drone");
    d2.hp = 1; g2.droneFall(d2);
    g2.player.facing = -1;
    g2.hitEnemy(d2, 1);
    expect(d2.launchVx).toBeLessThan(0);
  });

  // 발사 드론이 본체에 명중 → 본체에 데미지 3 + 그로기 게이지 3 적립(P2에서 15로 수렴).
  t.test("막타 발사 → 본체 명중: 데미지 3 + 그로기 3", () => {
    const g = loadGame();
    g.startStage("스테이지 5");
    g.eval("Math.random=()=>0");
    g.spawnDrone();
    const d = g.enemies.find((e) => e.role === "drone");
    const meow = g.bossOf("meow");
    const hp0 = meow.hp, gauge0 = meow.groggyGauge;
    d.hp = 0; g.player.facing = 1; g.launchDrone(d);
    const mhb = g.getHurtbox(meow);
    d.x = mhb.x + 5; d.y = mhb.y + 5; d.launchVx = 0; d.launchVy = 0; // 본체 위에 겹쳐 정지
    g.update(1);
    expect(meow.hp).toBe(hp0 - 3); // 데미지 3
    expect(meow.groggyGauge).toBe(gauge0 + 3); // 그로기 게이지 3 적립
    expect(d.alive).toBeFalsy(); // 본체에 꽂히고 소멸
  });

  // 발사 드론은 더는 피격 대상이 아니다(재발사/중복 처리 방지).
  t.test("발사된 드론은 피격 무시(재발사 방지)", () => {
    const g = loadGame();
    g.startStage("스테이지 5");
    g.eval("Math.random=()=>0");
    g.spawnDrone();
    const d = g.enemies.find((e) => e.role === "drone");
    d.hp = 0; g.player.facing = 1; g.launchDrone(d);
    const vx0 = d.launchVx;
    g.player.facing = -1; // 방향을 바꿔도
    g.hitEnemy(d, 1); // 다시 때려도 무시 → 재발사/방향전환 없음
    expect(d.launchVx).toBe(vx0);
    expect(d.alive).toBeTruthy();
  });
});
