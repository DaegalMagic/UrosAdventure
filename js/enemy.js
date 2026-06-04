// 우로스의 모험 — 적 AI / 이동(추격·세로 층 추격·CHASE→ATTACK→RECOVER FSM·돌진/블링크 gap-closer)
// (main.js에서 분리. 빌드/모듈 시스템이 없어 전역 스코프를 공유하므로 분리는 코드
//  이동 + index.html <script> 추가가 전부다. 전부 함수 선언이라 본문은 호출 시점에
//  평가 → main.js의 상수/팩토리/헬퍼(ATTACKS·player·enemies·stage·getHurtbox·
//  makeAttackHitbox·isAttackActive·startJump·moveAndCollide 등)와 data.js의 AI 상수를
//  call-time에 참조한다. main.js 뒤에 로드. wiki enemy-ai-and-locomotion 참조.)

// 적이 공격을 시작한다(ATTACKS의 키). 상태를 "attack"으로 바꾸고 공격 파이프라인
// (windup→active→recovery)을 발동한다. 방향은 발동 시점 facing으로 고정한다.
function startEnemyAttack(enemy, attackKey) {
  enemy.attack = ATTACKS[attackKey];
  enemy.attackElapsed = 0;
  enemy.attackDir = enemy.facing; // 발동 시점 방향 고정
  enemy.parried = false;
  enemy.hitPlayer = false;
  enemy.blinkPending = false; // 기본 해제(블링크 발동부에서 이 호출 직후 다시 켠다)
  enemy.state = "attack";
}

// (피격/포식/단검/그로기 일부 → js/combat.js 로 분리)
// 플레이어가 적의 '공격 사거리' 안에 있는가(wiki enemy-ai-and-locomotion §B).
//   세로: 그 공격의 히트박스가 플레이어 피격박스와 세로로 겹친다(같은 층/같은 줄).
//   가로: 중심간 거리 ≤ attackRangeX.
// 발동 방향(facing)으로 만든 히트박스로 세로 겹침을 보므로, 키 큰/낮은 공격도
// 같은 규칙으로 판정된다.
function playerInAttackRange(enemy, attackKey) {
  const spec = ATTACKS[attackKey];
  const hb = makeAttackHitbox(getHurtbox(enemy), enemy.facing, spec.range);
  const pHurt = getHurtbox(player);
  const vOverlap = hb.y < pHurt.y + pHurt.h && hb.y + hb.h > pHurt.y; // 세로 겹침
  const dx = Math.abs(player.x + player.w / 2 - (enemy.x + enemy.w / 2));
  return vOverlap && dx <= enemy.ai.attackRangeX;
}

// 적을 플레이어 쪽으로 한 프레임 추격 이동시킨다(지상, 가로만). 폭주면 더 빠르게.
function chaseStep(enemy, dt) {
  const speed = enemy.ai.chaseSpeed * (enemy.berserk ? 1 / BERSERK_INTERVAL_MULT : 1);
  enemy.x += enemy.facing * speed * dt;
  // 맵 밖으로 못 나가게 clamp(스테이지 폭 기준).
  enemy.x = Math.max(0, Math.min(enemy.x, stage.widthPx - enemy.w));
}

// 세로(층) 추격: 적이 자기 선호 층으로 가도록 점프/드롭을 '발동'한다(실제 이동은
// 물리 패스가 처리). wiki enemy-ai-and-locomotion §B.
//   - 근접 모드(approaching): 가로로 충분히 가까우면 반드시 플레이어 층으로 맞춘다
//     (공격하려고). 진입/이탈 거리를 달리해 경계 떨림을 막는다(히스테리시스).
//   - 원거리: 플레이어 층 + 선호 오프셋(floorPref)을 목표 층으로. 매 프레임이 아니라
//     VERT_DECIDE_INTERVAL마다 시도하고, 근접이 아니면 VERT_MOVE_CHANCE 확률로만
//     실행한다(선호도를 '부지런함'으로 표현 — 우왕좌왕 방지).
//   - 점프/드롭은 바닥(onGround)에 있을 때만 발동한다.
function updateVerticalChase(enemy, dt) {
  const enemyCx = enemy.x + enemy.w / 2;
  const playerCx2 = player.x + player.w / 2;
  const dx = Math.abs(playerCx2 - enemyCx);

  // 근접 모드 갱신(히스테리시스).
  if (!enemy.approaching && dx <= VERT_APPROACH_ENTER_X) enemy.approaching = true;
  else if (enemy.approaching && dx > VERT_APPROACH_EXIT_X) enemy.approaching = false;

  // 목표 층: 근접이면 플레이어 층, 아니면 플레이어 층 + 선호 오프셋.
  const playerFloor = floorOf(player.y + player.h);
  const maxFloor = stage.floorSurfaces.length - 1;
  let targetFloor = enemy.approaching ? playerFloor : playerFloor + enemy.ai.floorPref;
  targetFloor = Math.max(0, Math.min(targetFloor, maxFloor));

  const curFloor = floorOf(enemy.y + enemy.h);
  if (curFloor === targetFloor) return; // 이미 목표 층

  // 시도 타이머: 근접이면 즉시(머뭇거리지 않음), 원거리면 주기적으로만 시도.
  enemy.vertTimer -= dt;
  if (!enemy.approaching) {
    if (enemy.vertTimer > 0) return;
    enemy.vertTimer = VERT_DECIDE_INTERVAL;
    if (Math.random() > VERT_MOVE_CHANCE) return; // 이번 시도는 게으르게 패스
  }

  if (!enemy.onGround) return; // 공중에선 새 점프/드롭 발동 안 함

  // 층 인덱스가 작을수록 위. 목표가 더 위(작은 인덱스)면 점프, 더 아래면 드롭스루.
  if (targetFloor < curFloor) {
    startJump(enemy); // 한 층 위로
  } else {
    // 한 층 아래로: 원웨이 발판 위면 드롭스루로 뚫고 내려간다.
    if (enemy.onOneWay) {
      enemy.dropThrough = DROP_THROUGH_TIME;
      enemy.onGround = false;
    }
  }
}

// 적 갱신: 상태 기계(CHASE→ATTACK→RECOVER)로 추격/공격/후딜을 돌린다.
function updateEnemies(dt) {
  const playerCx = player.x + player.w / 2;
  for (const enemy of enemies) {
    if (!enemy.alive) continue;

    // 아공간(스테이지4 림/셰이디): 피신 중이면 화면에서 사라진 채 복귀 타이머만 돌린다
    // (이동/공격/세로 물리 정지). dwellTime 경과 시 30% 회복 복귀, 상대 사망 시 즉시
    // 강제 복귀(체류시간 비례 회복) — 둘 다 updateSubspace가 처리한다.
    if (enemy.inSubspace) { updateSubspace(enemy, dt); continue; }

    // 무적 폭주(베니+루포 둘 다 포식당한 티그): 스스로 체력이 깎인다. 0이 되면
    // 사망한다 — 마지막 1인이라 더 전파할 연동은 없다.
    if (enemy.selfDrain > 0) {
      enemy.hp -= enemy.selfDrain * dt;
      if (enemy.hp <= 0) {
        enemy.alive = false;
        continue;
      }
    }

    // facing: 플레이어가 있는 쪽(마주봄 판정 + 추격 방향에 쓰임)
    const enemyCx = enemy.x + enemy.w / 2;
    enemy.facing = playerCx >= enemyCx ? 1 : -1;

    // 스테이지5 드론: 일반 FSM/그로기 처리를 타지 않고 updateDrone이 모든 상태(추격/
    // 낙하그로기/막타발사)를 전담한다. 세로 물리(낙하)는 아래 물리 패스가 floating
    // 여부로 처리한다(추격·발사 드론=floating 면제, HP1 낙하 드론=중력 적용). drones.js.
    if (enemy.role === "drone") { updateDrone(enemy, dt); continue; }

    // 영구 그로기: 타이머 없이 계속 무방비. 공격/이동 로직을 돌리지 않는다(포식 대기).
    if (enemy.permaGroggy) continue;

    // 스페셜 쿨다운은 그로기 중에도 흐르게 둔다(복귀하자마자 바로 쓸 수 있게).
    if (enemy.specialCooldown > 0) enemy.specialCooldown -= dt;

    // 그로기 중: 공격/이동 정지. 타이머만 감소시키고, 끝나면 추격으로 복귀하며
    // 그로기 게이지를 0으로 드레인한다(그로기 내내 가득 찬 채로 보이다가 비워짐).
    if (enemy.groggyTime > 0) {
      enemy.groggyTime -= dt;
      if (enemy.groggyTime <= 0) {
        enemy.groggyTime = 0;
        // 누적 그로기만 게이지를 0으로 드레인한다. 공격 차단 그로기(돌진 패링)는
        // 게이지와 무관하므로 누적분을 보존한다(groggyDrains=false).
        if (enemy.groggyDrains) enemy.groggyGauge = 0;
        enemy.state = "chase";
        enemy.attack = null;
      }
      continue;
    }

    // ---- 상태 기계 ----
    if (enemy.state === "attack") {
      // 공격 진행: windup→active→recovery. 끝나면 RECOVER(후딜 정지)로 넘어간다.
      enemy.attackElapsed += dt;
      // 돌진(kind="dash"): active 동안 돌진 방향으로 이동한다(몸통이 곧 히트박스).
      // 단 패링당하면(parried) 더 못 가고 멈춘다 — onParry가 앞에서 그로기로 넣는다.
      if (
        enemy.attack &&
        enemy.attack.kind === "dash" &&
        !enemy.parried &&
        isAttackActive(enemy.attack, enemy.attackElapsed)
      ) {
        enemy.x += enemy.dashDir * enemy.dashSpeed * dt;
        enemy.x = Math.max(0, Math.min(enemy.x, stage.widthPx - enemy.w));
      }
      // 블링크(kind="blink"): windup이 끝나 active에 막 진입한 순간 등 뒤로 텔레포트.
      // 패링당했다면(parried) 블링크는 취소된다 — windup 중 패링이므로 이동 자체가
      // 일어나지 않는다(예약만 해제).
      if (enemy.blinkPending && enemy.attack && enemy.attack.kind === "blink") {
        if (enemy.parried) {
          enemy.blinkPending = false; // windup 패링 → 블링크 취소
        } else if (isAttackActive(enemy.attack, enemy.attackElapsed)) {
          blinkBehindPlayer(enemy);
          enemy.blinkPending = false;
        }
      }
      if (enemy.attackElapsed >= attackDuration(enemy.attack)) {
        enemy.attack = null;
        enemy.parried = false;
        enemy.hitPlayer = false;
        enemy.state = "recover";
        // 후딜도 폭주면 짧아진다(더 빨리 다시 덤빈다).
        enemy.recoverTime = ENEMY_RECOVER_TIME * (enemy.berserk ? BERSERK_INTERVAL_MULT : 1);
      }
      continue;
    }

    if (enemy.state === "recover") {
      // 공격이 끝난 뒤 제자리에서 쉰다. 끝나면 추격 재개.
      enemy.recoverTime -= dt;
      if (enemy.recoverTime <= 0) enemy.state = "chase";
      continue;
    }

    // 정지형 앵커(다야): 제자리에서 받기만 하는 탱커. 추격·공격을 하지 않는다(공격
    // 패턴 미정 — wiki open_question). facing/그로기 처리와 아래 세로 물리는 그대로 적용.
    if (enemy.ai.stationary) continue;

    // 이프리트: 거리 분기(패턴/평타)를 일반 CHASE 위에 얹는다. 진행 중인 슬램/변신/
    // 밀림이거나 이번에 패턴을 발동했으면 true → 일반 추격을 건너뛴다(전담 처리).
    // false면 평타·추격이 필요한 상태라 아래 일반 CHASE 로직을 그대로 탄다.
    if (enemy.role === "ifrit" && updateIfritPatterns(enemy, dt)) continue;

    // 가비아: 카이팅(거리 유지)·돌 던지기·동적 붕괴를 전담한다(일반 CHASE 미사용).
    // 이동(x)은 updateGabia가 직접 옮기고, 세로는 updateVerticalChase로 플레이어 층을
    // 대략 따라간다. 물리 패스(중력/충돌)는 아래에서 그대로 적용된다.
    if (enemy.role === "gabia") { updateGabia(enemy, dt); continue; }

    // 림(스테이지4): 쿨 7초 패턴(내려찍기/광역 강타)을 일반 CHASE 위에 얹는다.
    // true면 이번 프레임은 패턴이 전담(추격/평타 건너뜀), false면 일반 CHASE에 맡긴다.
    if (enemy.role === "rim" && updateRimPatterns(enemy, dt)) continue;

    // 셰이디(스테이지4): 추격이 아니라 '도주'라 일반 CHASE를 안 쓴다 — updateShady가
    // 이동(도주/점프)·등 뒤 평타·차원문 난사를 전담한다(가비아처럼 직접 옮기고 continue).
    // 등 뒤 평타(블링크)를 발동하면 state="attack"로 빠져 위 FSM이 텔레포트를 처리한다.
    if (enemy.role === "shady") { updateShady(enemy, dt); continue; }

    // CHASE: 행동 우선순위 — ① gap-closer 스페셜(거리 무관, 쿨+조건) →
    //        ② 사거리 안이면 공격(평타 또는 rangeReplace 스페셜) → ③ 추격 이동.
    const sp = enemy.ai.special;
    const specialReady = sp && enemy.specialCooldown <= 0;

    // ① gap-closer(돌진): 쿨이 차고 조건(needSameRow면 같은 가로줄)을 만족하면
    //    거리와 무관하게 발동해 '플레이어 등 뒤'까지 돌진한다. 등 뒤 목표점까지의
    //    거리를 active 시간으로 나눠 이번 돌진 속도(dashSpeed)를 역산한다 — 그래야
    //    시작 거리와 무관하게 항상 등 뒤로 파고든다(고정 속도면 거리에 따라
    //    못 미치거나 지나친다).
    if (specialReady && sp.kind === "dash" && (!sp.needSameRow || sameRow(enemy))) {
      startEnemyAttack(enemy, sp.attack);
      enemy.dashDir = enemy.facing; // 돌진 방향(플레이어 쪽으로 파고듦) 고정
      // 목표 거리 = (플레이어 중심 − 적 중심)의 크기 + 등 뒤 여유. 돌진 방향으로
      // 이만큼 가면 플레이어를 지나 등 뒤에 선다.
      const gap = Math.abs(player.x + player.w / 2 - (enemy.x + enemy.w / 2)) + TIG_DASH_BEHIND_GAP;
      enemy.dashSpeed = gap / enemy.attack.active; // active 동안 gap을 주파하는 속도
      enemy.specialCooldown = sp.cooldown;
      continue;
    }

    // ①' gap-closer(블링크): 쿨이 차면 거리와 무관하게 발동한다. 위치 이동은 지금이
    //    아니라 windup이 끝나는 순간(attack 블록)에 등 뒤로 텔레포트한다.
    if (specialReady && sp.kind === "blink") {
      startEnemyAttack(enemy, sp.attack);
      enemy.blinkPending = true; // windup 종료 시 텔레포트할 예약 플래그
      enemy.specialCooldown = sp.cooldown;
      continue;
    }

    // ② 사거리 안: rangeReplace 스페셜이 준비됐으면 평타 대신 그걸 쓴다.
    const useRangeSpecial = specialReady && sp.kind === "rangeReplace";
    let attackKey = useRangeSpecial ? sp.attack : enemy.ai.basic;
    // 비비: 근접 공격을 할 때 altBasic.chance 확률로 basic 대신 대체 공격(패링 불가
    // 강타)을 쓴다. 스페셜을 쓰는 경우는 제외. 두 근접 공격의 사거리가 같아 굴림이
    // 사거리 판정을 흔들지 않는다(둘 다 안 맞으면 추격으로 빠져 다음 프레임 재굴림).
    if (!useRangeSpecial && enemy.ai.altBasic && Math.random() < enemy.ai.altBasic.chance) {
      attackKey = enemy.ai.altBasic.attack;
    }
    if (playerInAttackRange(enemy, attackKey)) {
      startEnemyAttack(enemy, attackKey);
      if (useRangeSpecial) enemy.specialCooldown = sp.cooldown; // 스페셜 사용 → 쿨 시작
    } else {
      // ③ 추격 이동(가로) + 세로 층 맞추기(점프/드롭). 세로는 발동만 하고 실제
      //    이동은 아래 물리 패스가 처리한다.
      chaseStep(enemy, dt);
      updateVerticalChase(enemy, dt);
    }
  }

  // ---- 세로 물리 패스 ----
  // AI가 위에서 x(추격/돌진)와 점프(vy<0)를 정한 뒤, 모든 살아있는 적에 중력 +
  // 세로 충돌을 일괄 적용한다. x는 AI가 직접 옮기므로 moveAndCollide에는 vx=0을
  // 넘겨 'x축은 이동 없이' 두고(벽 충돌은 4층 맵에서 추가) y축만 처리한다.
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    if (enemy.inSubspace) continue; // 아공간 피신 중: 좌표 고정(물리 정지)
    // 화면 밖 모서리 저격수(스테이지3 실라/나이아): 고정 위치로 떠 있어 중력·충돌을
    // 받지 않는다(화면 밖에서 투사체만 쏘는 보스). 좌표를 둔 채 물리 패스를 건너뛴다.
    if (enemy.floating) continue;
    if (enemy.dropThrough > 0) enemy.dropThrough -= dt; // 드롭스루 타이머 감소
    enemy.vy += GRAVITY * dt; // 중력
    if (enemy.vy > MAX_FALL) enemy.vy = MAX_FALL;
    enemy.vx = 0; // x 이동은 AI가 끝냈다 → 물리 패스에선 x를 옮기지 않는다
    moveAndCollide(enemy, dt);
  }
}

// 플레이어와 적이 '같은 가로줄'인가 — 피격박스 세로 구간이 겹치는지로 판정한다
// (티그 돌진의 needSameRow 조건). 같은 바닥이면 항상 참, 플레이어가 점프로 떠
// 있으면 거짓이 되어 돌진이 헛나가지 않는다.
function sameRow(enemy) {
  const e = getHurtbox(enemy);
  const p = getHurtbox(player);
  return e.y < p.y + p.h && e.y + e.h > p.y;
}

// 루포 블링크: 적을 '플레이어 등 뒤'로 순간이동시킨다. 등 뒤 = 플레이어가 보는
// 방향(player.facing)의 반대편. 적을 그쪽에 BEHIND_GAP만큼 떨어뜨려 세우고, 적이
// 플레이어를 다시 바라보도록 facing/attackDir을 갱신한다(공격이 플레이어를 향하게).
function blinkBehindPlayer(enemy) {
  const behindDir = -player.facing; // 플레이어 등 뒤 방향
  const pcx = player.x + player.w / 2;
  // 등 뒤 지점에 적 '중심'을 두고, 박스 좌상단 x로 환산.
  let cx = pcx + behindDir * TIG_DASH_BEHIND_GAP;
  enemy.x = cx - enemy.w / 2;
  enemy.x = Math.max(0, Math.min(enemy.x, stage.widthPx - enemy.w));
  // 적은 플레이어를 향한다(등 뒤에서 플레이어 쪽 = behindDir의 반대).
  enemy.facing = player.facing;
  enemy.attackDir = enemy.facing; // 이번 공격 방향도 갱신(텔레포트 후 재조준)
}

// ---- 이프리트(스테이지3 1보스) 패턴 ----
// 거리 분기를 일반 CHASE 위에 얹는다. 반환 true면 이번 프레임은 패턴이 전담했으니
// 일반 추격/평타를 건너뛰고, false면 일반 CHASE(추격·사거리 평타)에 맡긴다.
//   - 진행 중(슬램 공중 / 패링 밀림 / 거대 변신)이면 그 단계를 갱신하고 true.
//   - idle: 쿨을 흘리고, 중심 직선거리가 patternDist 이상이고 쿨이 찼으며 바닥이면
//     점프슬램(A)/불기둥(B)을 랜덤으로 발동(true). 그 외(가까움/쿨대기)는 false.
function updateIfritPatterns(enemy, dt) {
  const cfg = enemy.ai.ifrit;
  if (enemy.ifritPhase == null) enemy.ifritPhase = "idle";
  if (enemy.ifritPatternCd == null) enemy.ifritPatternCd = cfg.cooldown;

  if (enemy.ifritPhase === "slam") { ifritUpdateSlam(enemy, dt, cfg); return true; }
  if (enemy.ifritPhase === "pushback") { ifritUpdatePushback(enemy, dt, cfg); return true; }
  if (enemy.ifritPhase === "transform") { ifritUpdateTransform(enemy, dt, cfg); return true; }

  // idle: 쿨 감소 후 거리 분기.
  if (enemy.ifritPatternCd > 0) enemy.ifritPatternCd -= dt;
  const ex = enemy.x + enemy.w / 2, ey = enemy.y + enemy.h / 2;
  const px = player.x + player.w / 2, py = player.y + player.h / 2;
  const dist = Math.hypot(px - ex, py - ey);
  if (dist >= cfg.patternDist && enemy.ifritPatternCd <= 0 && enemy.onGround) {
    if (Math.random() < 0.5) ifritStartSlam(enemy, cfg);
    else ifritFirePillar(enemy, cfg);
    return true;
  }
  return false; // 가깝거나(평타) 쿨 대기 → 일반 추격/평타
}

// 패턴 A 점프슬램 발동: 플레이어 방향 포물선 점프(2단점프 높이). x 이동은 물리 패스가
// vx=0으로 두므로 슬램 동안 직접 옮긴다(slamVx). 대략 체공시간 안에 플레이어에
// 도달하도록 수평속도를 잡되 과속은 막는다.
function ifritStartSlam(enemy, cfg) {
  enemy.ifritPhase = "slam";
  enemy.slamAirborne = false; // 한 번 떠야 착지 판정(발동 직후 onGround=true 방지)
  enemy.slamHitPlayer = false;
  enemy.vy = -cfg.slamJumpSpeed;
  enemy.onGround = false;
  const ex = enemy.x + enemy.w / 2;
  const px = player.x + player.w / 2;
  const AIR_EST = 1.1; // 대략적 체공시간(초)
  const maxVx = 300;
  enemy.slamVx = Math.max(-maxVx, Math.min(maxVx, (px - ex) / AIR_EST));
}

function ifritUpdateSlam(enemy, dt, cfg) {
  // 공중 수평 이동(물리 패스가 x를 옮기지 않으므로 직접).
  enemy.x += enemy.slamVx * dt;
  enemy.x = Math.max(0, Math.min(enemy.x, stage.widthPx - enemy.w));
  if (!enemy.onGround) enemy.slamAirborne = true;

  // 패링 윈도(공중 내내): 플레이어 공격 active 히트박스가 몸통과 겹치고 마주보면 성공.
  const pHb = getAttackHitbox();
  if (pHb && player.attackDir === -enemy.facing && aabbOverlap(pHb, getHurtbox(enemy))) {
    ifritOnSlamParried(enemy, cfg);
    return;
  }
  // 미패링 몸통 접촉 피해(슬램당 1회).
  if (!player.dead && !enemy.slamHitPlayer && aabbOverlap(getHurtbox(enemy), getHurtbox(player))) {
    damagePlayer(cfg.slamDamage);
    enemy.slamHitPlayer = true;
  }
  // 착지(떴다가 다시 바닥) → 패링 실패 → 거대 불꽃 변신.
  if (enemy.slamAirborne && enemy.onGround) ifritStartTransform(enemy, cfg);
}

// 슬램 패링 성공: 변신 없이 뒤로(플레이어 반대) pushbackDist를 pushbackTime에 걸쳐
// 밀린다. 상승을 멈추고(vy=0) 이후 중력으로 떨어진다. 자기경직 없음.
function ifritOnSlamParried(enemy, cfg) {
  parryFlash = 0.15;
  TimeControl.freeze(PARRY_HIT_STOP);
  enemy.ifritPhase = "pushback";
  enemy.pushbackTime = cfg.pushbackTime;
  enemy.pushbackVx = -enemy.facing * (cfg.pushbackDist / cfg.pushbackTime); // 뒤로
  enemy.vy = 0;
}

function ifritUpdatePushback(enemy, dt, cfg) {
  enemy.x += enemy.pushbackVx * dt;
  enemy.x = Math.max(0, Math.min(enemy.x, stage.widthPx - enemy.w));
  enemy.pushbackTime -= dt;
  if (enemy.pushbackTime <= 0) {
    enemy.ifritPhase = "idle";
    enemy.ifritPatternCd = cfg.cooldown;
  }
}

// 거대 불꽃 변신: 발(하단 중앙) 고정으로 가로·세로 transformScale배 확대 + 무적.
// transformTime초 뒤 원복하고, 변신 해제 직후부터 cooldown 쿨이 시작된다.
function ifritStartTransform(enemy, cfg) {
  enemy.ifritPhase = "transform";
  enemy.transformTime = cfg.transformTime;
  enemy.transformTick = 0;
  enemy.invincible = true;
  ifritSetScale(enemy, cfg.transformScale);
}

function ifritUpdateTransform(enemy, dt, cfg) {
  enemy.transformTime -= dt;
  // 겹치면 transformTickInterval초당 transformTickDmg.
  if (!player.dead && aabbOverlap(getHurtbox(enemy), getHurtbox(player))) {
    enemy.transformTick -= dt;
    if (enemy.transformTick <= 0) {
      damagePlayer(cfg.transformTickDmg);
      enemy.transformTick = cfg.transformTickInterval;
    }
  } else {
    enemy.transformTick = 0; // 떨어지면 다음 접촉 즉시 1틱
  }
  if (enemy.transformTime <= 0) {
    ifritSetScale(enemy, 1); // 원복
    enemy.invincible = false;
    enemy.ifritPhase = "idle";
    enemy.ifritPatternCd = cfg.cooldown;
  }
}

// 발(하단 중앙)을 고정한 채 이동/피격 박스를 scale배로 맞춘다(원본 크기는 최초 1회
// baseW/baseH/baseHurt로 보존하고, scale=1이면 원복). 확대 시 맵 밖으로 나가지 않게 clamp.
function ifritSetScale(enemy, scale) {
  if (enemy.baseW == null) {
    enemy.baseW = enemy.w; enemy.baseH = enemy.h;
    enemy.baseHurtW = enemy.hurt.w; enemy.baseHurtH = enemy.hurt.h;
  }
  const cx = enemy.x + enemy.w / 2;
  const bottom = enemy.y + enemy.h;
  enemy.w = enemy.baseW * scale;
  enemy.h = enemy.baseH * scale;
  enemy.hurt = { w: enemy.baseHurtW * scale, h: enemy.baseHurtH * scale };
  enemy.x = cx - enemy.w / 2;
  enemy.y = bottom - enemy.h;
  enemy.x = Math.max(0, Math.min(enemy.x, stage.widthPx - enemy.w));
}

// 패턴 B 불기둥: 플레이어 발밑(현재 층 표면)에 불기둥 예고를 깐다(다야 가시 telegraph
// 구조 재활용, projectiles.js). 발동 즉시 쿨이 시작된다(fire-and-forget — 이프리트는
// 예고를 깔고 곧장 일반 추격으로 복귀).
function ifritFirePillar(enemy, cfg) {
  const footY = player.y + player.h;
  spawnFirePillar(enemy, player.x + player.w / 2, floorSurfaceY(floorOf(footY)));
  enemy.ifritPatternCd = cfg.cooldown;
}

// ---- 가비아(스테이지3 1보스) — 카이팅 / 돌 던지기 / 동적 붕괴 ----
// 추격형(이프리트)과 달리 거리를 '유지'한다: 플레이어가 너무 가까우면 물러나고, 너무
// 멀면 좁힌다(그 사이는 가로 정지). 세로는 updateVerticalChase로 플레이어 층을 대략
// 따라가 돌 조준이 같은 높이에서 의미 있게 한다. x 이동은 직접 옮기고(물리 패스가
// vx=0으로 두므로), 중력/충돌은 물리 패스가 처리한다(슬램과 같은 방식).
//   공유 방어막/무적 시전은 projectiles.js updateGabiaShared가 별도 주기로 돌린다.
function updateGabia(enemy, dt) {
  const cfg = enemy.ai.gabia;

  // 동적 붕괴: HP가 임계(64/48/32/16)에 도달할 때마다 1회씩 맵을 무너뜨린다(누적).
  // 그로기/사망과 무관하게 HP만 보고 처리한다(HP는 이 함수 밖에서만 변하므로 안전).
  if (enemy.collapseStep == null) enemy.collapseStep = 0;
  const thr = cfg.collapseThresholds;
  while (enemy.collapseStep < thr.length && enemy.hp <= thr[enemy.collapseStep]) {
    collapseStage3Floors();
    enemy.collapseStep++;
  }

  // 그로기 중엔 이동·투척 정지(그로기 자체는 위 공통 처리에서 continue로 못 옴 —
  // 여기 도달했다는 건 비그로기. 방어적으로 한 번 더 가드).
  if (enemy.permaGroggy || enemy.groggyTime > 0) return;

  // 카이팅 이동(가로): kiteNear 안이면 물러나고, kiteFar 밖이면 좁힌다, 그 사이는 정지.
  const ecx = enemy.x + enemy.w / 2;
  const pcx = player.x + player.w / 2;
  const dx = Math.abs(pcx - ecx);
  let moveDir = 0;
  if (dx < cfg.kiteNear) moveDir = ecx < pcx ? -1 : 1; // 물러남(플레이어 반대 방향)
  else if (dx > cfg.kiteFar) moveDir = pcx < ecx ? -1 : 1; // 접근(거리 좁힘)
  enemy.x += moveDir * cfg.moveSpeed * dt;
  enemy.x = Math.max(0, Math.min(enemy.x, stage.widthPx - enemy.w));

  // 세로: 플레이어 층을 대략 따라간다(floorPref 0 → 근접 시 플레이어 층, 평소도 같은 층).
  updateVerticalChase(enemy, dt);

  // 돌 던지기: 2~4초 랜덤 쿨마다 발사 순간 플레이어를 조준(projectiles.js).
  if (enemy.stoneCd == null) enemy.stoneCd = randRange(cfg.stoneCdMin, cfg.stoneCdMax);
  enemy.stoneCd -= dt;
  if (enemy.stoneCd <= 0) {
    fireGabiaStone(enemy);
    enemy.stoneCd = randRange(cfg.stoneCdMin, cfg.stoneCdMax);
  }
}

// ---- 림(스테이지4 보스) — 추격/강타 패턴(내려찍기 / 광역 강타) ----
// 일반 CHASE(추격+사거리 평타 rimSwing) 위에 쿨 7초 패턴을 얹는다. 반환 true면 이번
// 프레임은 패턴이 전담(추격/평타 건너뜀), false면 일반 CHASE에 맡긴다.
//   - 내려찍기(slam): 전용 phase(telegraph→strike)로 직접 처리한다. enemy.attack을 쓰지
//     않으므로(패링 불가) 강타 순간 '점프 안 한 플레이어'에게 커스텀으로 피해+스턴을 준다.
//   - 광역 강타(aoe): 일반 공격 rimAoe(긴 windup=기 모으기)로 위임 → FSM state="attack"가
//     telegraph·active 판정·패링을 전담한다. 이 함수는 발동만 하고 한 프레임 true로 빠진다.
function updateRimPatterns(enemy, dt) {
  const cfg = enemy.ai.rim;
  if (enemy.rimPatternCd == null) enemy.rimPatternCd = cfg.cooldown;

  // 내려찍기 진행 중(전용 phase): 기 모으기 → 바닥 강타.
  if (enemy.rimPhase === "slamTele") { rimUpdateSlamTele(enemy, dt, cfg); return true; }
  if (enemy.rimPhase === "slamStrike") { rimUpdateSlamStrike(enemy, dt, cfg); return true; }

  // idle: 쿨 감소 후, 쿨이 차고 바닥이면 둘 중 랜덤 발동(거리 무관 — telegraph가 회피 시간).
  if (enemy.rimPatternCd > 0) enemy.rimPatternCd -= dt;
  if (enemy.rimPatternCd <= 0 && enemy.onGround) {
    enemy.rimPatternCd = cfg.cooldown; // 발동 시점부터 다음 패턴까지 쿨 7초
    if (Math.random() < 0.5) {
      // ① 내려찍기: 전용 phase 시작(제자리에서 기 모으기 — 추격 정지).
      enemy.rimPhase = "slamTele";
      enemy.rimTele = 0;
      enemy.attackDir = enemy.facing; // 렌더 방향 일관성(판정은 arena-wide)
    } else {
      // ② 광역 강타: 일반 공격 파이프라인으로 위임(다음 프레임부터 FSM이 전담).
      startEnemyAttack(enemy, "rimAoe");
    }
    return true;
  }
  return false; // 일반 CHASE(추격/평타)
}

// 내려찍기 기 모으기(telegraph): 제자리에서 cfg.telegraph초 모은 뒤 강타로 전이한다.
function rimUpdateSlamTele(enemy, dt, cfg) {
  enemy.rimTele += dt;
  if (enemy.rimTele >= cfg.telegraph) {
    enemy.rimPhase = "slamStrike";
    enemy.rimStrike = 0;
    enemy.rimSlamHit = false;
  }
}

// 내려찍기 강타(strike): 첫 프레임에 '점프 안 하고 지면에 있는'(player.onGround)
// 플레이어에게 dmg + 스턴(slamStun초 행동불가). 공중이면 안 맞음(점프로 회피).
// 판정은 가로 무관(바닥 충격파) — 지면 접지 여부만 본다. slamActive초 뒤 idle 복귀.
function rimUpdateSlamStrike(enemy, dt, cfg) {
  if (!enemy.rimSlamHit) {
    enemy.rimSlamHit = true;
    ScreenShake.shake(SHOCKWAVE_SHAKE_MAG, SHOCKWAVE_SHAKE_TIME); // 바닥 강타 충격
    if (player.onGround && !player.dead) {
      damagePlayer(cfg.slamDamage);
      player.staggerTime = cfg.slamStun; // 점프 안 한 페널티: 행동불가
    }
  }
  enemy.rimStrike += dt;
  if (enemy.rimStrike >= cfg.slamActive) enemy.rimPhase = "idle";
}

// ---- 셰이디(스테이지4 보스) — 도주 / 등 뒤 순간이동 평타 / 차원문 난사 ----
// 추격형(림)과 정반대로 플레이어에게서 '달아난다'. 일반 CHASE를 쓰지 않고 이 함수가
// 이동(x)을 직접 옮긴 뒤 continue로 빠진다(세로 물리는 updateEnemies 물리 패스가 처리).
//   ① 차원문 난사 진행 중이면 시퀀서(updateShadyBarrage)가 전담(도주/점프 정지).
//   ② 난사 쿨(gateCooldown)이 차고 바닥이면 난사 발동.
//   ③ 맵 좌우 끝 도달 또는 플레이어와 approachDist 이상 벌어지면 → 차원문으로 등 뒤
//      순간이동 평타(shadyBlink, kind="blink"). 발동하면 state="attack"로 빠져 위 FSM이
//      windup 종료 시 blinkBehindPlayer로 등 뒤 텔레포트를 처리한다(루포와 동일 경로).
//   ④ 그 외: 플레이어 반대 x로 fleeSpeed 도주 + jumpInterval마다 jumpChance로 최대 점프.
function updateShady(enemy, dt) {
  const cfg = enemy.ai.shady;

  // ① 차원문 난사 진행 중: 전용 시퀀서가 전담(이동·점프 정지).
  if (enemy.shadyBarrage) { updateShadyBarrage(enemy, dt, cfg); return; }

  // ② 난사 쿨: 차고 바닥이면 발동(공중이면 grounded까지 대기).
  if (enemy.shadyGateCd == null) enemy.shadyGateCd = cfg.gateCooldown;
  enemy.shadyGateCd -= dt;
  if (enemy.shadyGateCd <= 0 && enemy.onGround) {
    startShadyBarrage(enemy, cfg);
    return;
  }

  // ③ 접근 평타: 맵 끝 도달 또는 플레이어와 approachDist 이상 → 등 뒤 블링크 평타.
  const ecx = enemy.x + enemy.w / 2;
  const pcx = player.x + player.w / 2;
  const dist = Math.abs(pcx - ecx);
  const atEdge = enemy.x <= 0 || enemy.x + enemy.w >= stage.widthPx;
  if (dist >= cfg.approachDist || atEdge) {
    startEnemyAttack(enemy, "shadyBlink");
    enemy.blinkPending = true; // windup 종료 시 등 뒤로 텔레포트(FSM blink 블록)
    return;
  }

  // ④ 평소: 플레이어 반대 x로 도주(facing은 매 프레임 플레이어 쪽 → -facing이 도주 방향).
  enemy.x += -enemy.facing * cfg.fleeSpeed * dt;
  enemy.x = Math.max(0, Math.min(enemy.x, stage.widthPx - enemy.w));

  // 점프: jumpInterval마다 1회 판정, jumpChance(10%)로 최대 점프(바닥일 때만).
  if (enemy.shadyJumpTimer == null) enemy.shadyJumpTimer = cfg.jumpInterval;
  enemy.shadyJumpTimer -= dt;
  if (enemy.shadyJumpTimer <= 0) {
    enemy.shadyJumpTimer = cfg.jumpInterval;
    if (enemy.onGround && Math.random() < cfg.jumpChance) startJump(enemy);
  }
}

// 차원문 한 개를 플레이어 전방/후방 콘에 배치한다. 콘 = 플레이어 정면(facing) 또는
// 후면(-facing) 기준 ±gateConeDeg(70°). 이 두 콘이 수평을 중심으로 ±70°씩 덮으면
// 위/아래 각 40° 쐐기(콘 사이 빈틈)는 자연히 제외된다(스펙의 "상·하 40° 쐐기 제외").
//   차원문 자체는 히트박스가 없는 순수 이펙트다. 0.3초 뒤 여기서 나올 '검격'이 노릴
//   지점(targetX/Y)을 생성 시점의 플레이어 중심으로 박아 둔다 — 텔레그래프 동안 이
//   지점에서 비켜나면 검격을 회피한다(검격은 플레이어를 재추적하지 않는다).
function makeShadyGate(cfg) {
  const pcx = player.x + player.w / 2;
  const pcy = player.y + player.h / 2;
  const front = Math.random() < 0.5; // 전방/후방 50:50
  const dir = (front ? player.facing : -player.facing); // 콘 중심 수평 방향(+1 우/-1 좌)
  const base = dir > 0 ? 0 : Math.PI; // 0=오른쪽, π=왼쪽
  const spread = (Math.random() * 2 - 1) * cfg.gateConeDeg * (Math.PI / 180); // ±70°
  const a = base + spread;
  return {
    cx: pcx + Math.cos(a) * cfg.gateDist,
    cy: pcy + Math.sin(a) * cfg.gateDist,
    targetX: pcx, targetY: pcy, // 검격이 향하는 지점(생성 시 플레이어 자리). 여기서 비키면 회피
    parried: false, // 이 검격을 패링했는가(패링하면 무피해 + 누적 카운트)
    struck: false,  // 이 검격이 이미 피해를 줬는가(검격당 1회)
  };
}

// 검격(공격) 판정 박스: 차원문(gate.cx,cy) → 목표 지점(targetX,targetY)을 잇는 회랑을
// gateStrikeHalf만큼 부풀린 AABB. 차원문이 순수 이펙트인 동안(open)이 아니라 '검격'이
// 나오는 strike 단계에서만 이 박스가 산다. 회랑 = 차원문에서 생성 시 플레이어 자리까지의
// 통로라, 그 자리에 머물면 베이고 옆으로 비키면 빗나간다.
function shadyStrikeBox(g, cfg) {
  const half = cfg.gateStrikeHalf;
  const minX = Math.min(g.cx, g.targetX) - half;
  const minY = Math.min(g.cy, g.targetY) - half;
  const maxX = Math.max(g.cx, g.targetX) + half;
  const maxY = Math.max(g.cy, g.targetY) + half;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// 차원문 난사 시작: 첫 차원문을 열고 시퀀서 상태를 건다(index 0..gateCount-1).
function startShadyBarrage(enemy, cfg) {
  enemy.shadyBarrage = { index: 0, t: 0, phase: "open", parries: 0, gate: makeShadyGate(cfg) };
}

// 차원문 난사 시퀀서. 차원문마다 open(이펙트 텔레그래프, 히트박스 없음) → strike(검격
// 판정: 패링/피해/회피) → 즉시 숨김 → gap(다음까지 대기) → 다음 차원문. gateCount회
// 완주하면 맵 최상단에서 거대 무기를 떨군다(spawnShadyWeapon). 누적 패링이
// gateParryCancel(3)에 닿으면 즉시 취소 + 그로기(별도 카운터 — 전역 게이지와 무관).
function updateShadyBarrage(enemy, dt, cfg) {
  const b = enemy.shadyBarrage;
  const g = b.gate;
  b.t += dt;

  // open: 차원문은 순수 이펙트(피격 안 됨). gateOpen초 텔레그래프 후 검격(strike)으로.
  if (b.phase === "open") {
    if (b.t >= cfg.gateOpen) { b.phase = "strike"; b.t = 0; }
    return;
  }

  // strike: 차원문에서 나온 '검격'. 이 동안만 패링/피해 판정(차원문 본체는 무관).
  if (b.phase === "strike") {
    const box = shadyStrikeBox(g, cfg);
    // 패링: 플레이어 공격 히트박스가 검격 회랑과 겹치고 그쪽(차원문 방향)을 향해 베면 성사.
    if (!g.parried) {
      const pHb = getAttackHitbox();
      const strikeDir = g.cx >= player.x + player.w / 2 ? 1 : -1; // 검격이 오는 방향(좌/우)
      if (pHb && player.attackDir === strikeDir && aabbOverlap(pHb, box)) {
        g.parried = true;
        b.parries += 1;
        parryFlash = 0.15;
        TimeControl.freeze(PARRY_HIT_STOP);
        if (b.parries >= cfg.gateParryCancel) { shadyCancelBarrage(enemy, cfg); return; }
      }
    }
    // 미패링 피해(검격당 1회): 회랑 안에 있으면 베인다(옆으로 비켜 있으면 무피해=회피).
    if (!g.parried && !g.struck && !player.dead && aabbOverlap(box, getHurtbox(player))) {
      damagePlayer(cfg.gateDamage);
      g.struck = true;
    }
    if (b.t >= cfg.gateStrike) { b.phase = "gap"; b.t = 0; } // 검격 종료 → 즉시 숨김(gap)
    return;
  }

  // gap: 숨김 상태로 gateGap초 대기 후 다음 차원문(또는 완주 처리).
  if (b.t >= cfg.gateGap) {
    b.index += 1;
    if (b.index >= cfg.gateCount) {
      // gateCount회 완주 → 맵 최상단에서 거대 무기 낙하(패링 불가) + 난사 종료.
      spawnShadyWeapon(enemy, player.x + player.w / 2);
      enemy.shadyBarrage = null;
      enemy.shadyGateCd = cfg.gateCooldown;
      return;
    }
    b.gate = makeShadyGate(cfg);
    b.phase = "open";
    b.t = 0;
  }
}

// 누적 3회 패링 → 난사 즉시 취소 + groggyTime초 그로기. 이 그로기는 전역 그로기
// 게이지와 무관하다(groggyDrains=false → 종료 시 게이지를 드레인하지 않아 누적 보존).
// 낙하 무기는 취소 시 떨어지지 않는다(완주 분기에서만 spawn).
function shadyCancelBarrage(enemy, cfg) {
  enemy.shadyBarrage = null;
  enemy.shadyGateCd = cfg.gateCooldown; // 다음 난사까지 풀쿨
  enemy.groggyTime = cfg.groggyTime;    // 3초 그로기(updateEnemies 그로기 블록이 처리)
  enemy.groggyDrains = false;           // 전역 게이지 무관(보존)
  enemy.attack = null;
  enemy.parried = false;
  enemy.hitPlayer = false;
}

// ---- 아공간(스테이지4 공통 — 림/셰이디 2인 연동) ----
// 두 보스가 모두 살아 있는 동안엔 HP를 5% 이하로 깎아도 죽지 않고 아공간으로
// 피신했다가 회복해 복귀한다 → 즉사 불가. 한쪽이 처치되면 생존자는 봉인되어 정상
// 처치된다. 공략 루트 = 한쪽을 아공간에 보낸 뒤 상대를 처치(또는 첫 처치를 성립).
// SSOT: 메모리 stage4-rim-shady-spec.md "공통 — 아공간". 설정 = data.js SUBSPACE.

// 아공간 진입 시도(combat.js hitEnemy에서 피해 적용 직후 호출). 진입했으면 true를
// 반환해 hitEnemy의 사망 처리를 건너뛴다(HP가 0 이하라도 죽지 않고 피신). 조건:
//   ① 아공간 보스(ai.subspace)이고 아직 피신 중이 아니다.
//   ② 상대(같은 group의 다른 아공간 보스)가 살아 있다 — 봉인 규칙(둘 다 생존 중만).
//   ③ HP가 enterThreshold(5%) 이하로 떨어졌다.
function maybeEnterSubspace(enemy) {
  const cfg = enemy.ai && enemy.ai.subspace;
  if (!cfg || enemy.inSubspace) return false;
  const partnerAlive =
    enemy.group && enemy.group.some((e) => e !== enemy && e.ai.subspace && e.alive);
  if (!partnerAlive) return false; // 상대 사망 → 봉인(아공간 불가, 정상 처치)
  if (enemy.hp > enemy.maxHp * cfg.enterThreshold) return false; // 아직 5% 초과
  // 피신: 화면에서 사라지고(피격/공격/물리 정지) 진행 중 패턴을 취소한다.
  enemy.inSubspace = true;
  enemy.subspaceTime = 0;
  enemy.hpAtEntry = Math.max(enemy.hp, 0); // 복귀 회복의 기준선(음수 방지)
  enemy.hp = enemy.hpAtEntry;
  enemy.state = "chase";
  enemy.attack = null;
  enemy.shadyBarrage = null; // 셰이디 차원문 난사 중단
  enemy.rimPhase = "idle";   // 림 내려찍기 진행 중단
  return true;
}

// 아공간 체류 갱신(updateEnemies가 inSubspace인 적에 매 프레임 호출). 상대가 죽으면
// 즉시 강제 복귀(체류시간 비례 회복 — park-and-kill 방지), 아니면 dwellTime 경과 시
// 정상 복귀(returnHp=30%로 회복)한다.
function updateSubspace(enemy, dt) {
  const cfg = enemy.ai.subspace;
  const partnerAlive = enemy.group.some((e) => e !== enemy && e.ai.subspace && e.alive);
  if (!partnerAlive) { returnFromSubspace(enemy, true); return; } // 상대 사망 → 즉시 복귀
  enemy.subspaceTime += dt;
  if (enemy.subspaceTime >= cfg.dwellTime) returnFromSubspace(enemy, false); // 정상 복귀
}

// 아공간 복귀: HP를 회복하고 다시 전장에 나타난다(추격 재개). forced(상대 사망 강제
// 복귀)면 회복량이 체류시간에 비례하고(frac<1), 정상 복귀면 returnHp(30%)까지 채운다.
// 회복선 = hpAtEntry → target 사이를 frac만큼 보간(진입 HP보다 항상 같거나 높음).
function returnFromSubspace(enemy, forced) {
  const cfg = enemy.ai.subspace;
  const target = enemy.maxHp * cfg.returnHp;
  const frac = forced ? Math.min(enemy.subspaceTime / cfg.dwellTime, 1) : 1;
  enemy.hp = enemy.hpAtEntry + frac * (target - enemy.hpAtEntry);
  enemy.inSubspace = false;
  enemy.subspaceTime = 0;
  enemy.state = "chase";
}
