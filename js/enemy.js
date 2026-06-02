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
  const maxFloor = FLOOR_SURFACES_Y.length - 1;
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
