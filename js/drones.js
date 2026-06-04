// 우로스의 모험 — 스테이지5(M.E.O.W) 드론 시스템(이 스테이지 핵심 메커니즘)
// (새 서브시스템은 별도 파일 — main.js god file 방지. 호출은 updateEnemies(드론 1기
//  AI)·updateProjectiles(스포너+탄)·hitEnemy(피해/막타 훅)·startStage(reset)에서 몇 줄만.)
//
// 드론은 '적'이다(enemies에 산다 — 평타로 때려지고 HP/그로기/facing을 그대로 쓴다).
// 비행체(floating)라 평소엔 중력·세로충돌을 면제받고 updateDrone이 x/y를 직접 옮긴다.
//   ① 출몰: 4초마다 화면 우변 랜덤 y에서 1기(HP 5).
//   ② 이동: 1.3초마다 리타깃 — 플레이어에서 200px 떨어진 점들 중 랜덤 각도로 맴돈다.
//          속도 = 플레이어 MOVE_SPEED(200)×1.2 = 240px/s.
//   ③ 공격: 3초마다 플레이어 조준 탄 1발(패링 가능, 맞으면 dmg 1).
//   ④ 탄 패링: 탄이 '쏜 드론'을 역으로 호밍 → 명중 시 그 드론에 1뎀(다야 reflect 구조).
//   ⑤ HP 1 되면 그로기+바닥 낙하(floating 해제 → 중력. 더는 공격 안 함).
//   ⑥ 막타(핵심): 드론을 죽이는 마지막 타격 → 죽는 대신 '플레이어가 보는 방향(facing)'
//      으로 발사 → M.E.O.W 본체(hurtbox) 명중 시 본체에 데미지 3 + 그로기 3.
// SSOT: 메모리 stage5-meow-spec.md "드론". 본체 그로기 게이지15 수렴은 프롬프트2에서.

// ---- 상수 ----
const DRONE_HP = 5; // 드론 체력(평타/반사탄 1뎀씩 → 5대면 HP 1 그로기)
const DRONE_W = 40; // 드론 이동/피격 박스(작은 비행체)
const DRONE_H = 34;
const DRONE_SPAWN_INTERVAL = 4; // 출몰 주기(초)
const DRONE_SPAWN_Y_MIN = 120; // 우변 출몰 y 범위(맵 높이 600 안, 4층 위~1층 근처)
const DRONE_SPAWN_Y_MAX = 480;
const DRONE_SPEED = MOVE_SPEED * 1.2; // 추격 속도 = 플레이어×1.2배 = 240px/s
const DRONE_ORBIT = 200; // 플레이어에서 이만큼 떨어진 점을 목표로(주위 맴돌기)
const DRONE_RETARGET = 1.3; // 리타깃 주기(초) — 새 각도로 목표점 갱신
const DRONE_FIRE_INTERVAL = 3; // 탄 발사 주기(초)
const DRONE_BULLET_W = 14; // 드론 탄 박스
const DRONE_BULLET_H = 10;
const DRONE_BULLET_SPEED = 260; // 탄 속도(px/s)
const DRONE_BULLET_REFLECT_SPEED = 460; // 패링 반사 시 호밍 속도(되돌아갈 땐 빠르게)
const DRONE_BULLET_DAMAGE = 1; // 탄이 플레이어를 맞힐 때 / 반사탄이 드론을 맞힐 때
const DRONE_LAUNCH_SPEED = 640; // 막타로 발사된 드론의 직진 속도(px/s)
const DRONE_MEOW_DAMAGE = 3; // 발사 드론이 본체에 꽂힐 때 데미지
const DRONE_MEOW_GROGGY = 3; // 발사 드론이 본체에 꽂힐 때 그로기 게이지 적립(15로 수렴은 P2)

// ---- 상태 ----
let droneSpawnTimer = 0; // 다음 출몰까지 남은 시간(초). resetDrones가 초기화

// startStage에서 호출(스테이지 새로 구성 시 출몰 주기 리셋). 드론 자체는 enemies에
// 살므로 startStage가 enemies를 새로 만들면 함께 사라진다 — 여기선 타이머만 리셋한다.
function resetDrones() {
  droneSpawnTimer = DRONE_SPAWN_INTERVAL; // 첫 출몰은 4초 뒤
}

// ---- 출몰(스포너) ----
// updateProjectiles에서 매 프레임 호출. M.E.O.W가 살아 있을 때만(=스테이지5 전용)
// 4초마다 우변 랜덤 y에서 드론 1기를 enemies에 추가한다.
function updateDroneSpawner(dt) {
  const meow = enemies.find((e) => e.role === "meow" && e.alive);
  if (!meow) return; // 본체 없음/사망 → 출몰 중지
  droneSpawnTimer -= dt;
  if (droneSpawnTimer <= 0) {
    spawnDrone();
    droneSpawnTimer = DRONE_SPAWN_INTERVAL;
  }
}

// 우변(x=맵 오른쪽 끝) 랜덤 y에 드론 1기 생성. floating으로 떠 있고(중력/세로충돌 면제)
// 즉시 플레이어 주위 한 점을 목표로 잡는다(다음 프레임부터 updateDrone이 추격).
function spawnDrone() {
  const footY = DRONE_SPAWN_Y_MIN + Math.random() * (DRONE_SPAWN_Y_MAX - DRONE_SPAWN_Y_MIN);
  const d = makeEnemy(stage.widthPx, footY, "drone", DRONE_HP, 0, {
    w: DRONE_W, h: DRONE_H, hurtW: DRONE_W, hurtH: DRONE_H,
  });
  d.floating = true; // 비행체: 중력·세로충돌 면제(updateDrone이 직접 이동)
  d.droneRetarget = DRONE_RETARGET; // 리타깃 타이머
  d.droneFireCd = DRONE_FIRE_INTERVAL; // 발사 타이머
  d.droneFell = false; // HP 1 그로기+낙하 진입 여부
  d.launched = false; // 막타로 본체에 발사된 상태
  pickDroneTarget(d); // 첫 목표점
  enemies.push(d); // 다음 프레임 updateEnemies가 반영(루프 중 추가)
}

// 리타깃: 플레이어 중심에서 DRONE_ORBIT(200px) 떨어진 점들 중 랜덤 각도 하나를 목표로.
function pickDroneTarget(drone) {
  const a = Math.random() * Math.PI * 2;
  const pcx = player.x + player.w / 2;
  const pcy = player.y + player.h / 2;
  drone.droneTx = pcx + Math.cos(a) * DRONE_ORBIT;
  drone.droneTy = pcy + Math.sin(a) * DRONE_ORBIT;
}

// ---- 드론 1기 갱신(updateEnemies의 role 분기에서 호출) ----
// 모든 드론 상태(추격/낙하그로기/발사)를 여기서 전담한다 — updateEnemies의 일반 FSM·
// permaGroggy 처리를 타지 않게 호출부에서 곧장 continue한다.
function updateDrone(drone, dt) {
  if (drone.launched) { updateLaunchedDrone(drone, dt); return; }
  // HP 1 낙하 그로기: 정지(공격 안 함). 물리 패스가 중력으로 떨군다(floating 해제됨).
  if (drone.droneFell) return;

  // 추격: 리타깃 → 목표점으로 240px/s 이동 → 3초마다 탄 발사.
  drone.facing = player.x + player.w / 2 >= drone.x + drone.w / 2 ? 1 : -1;
  drone.droneRetarget -= dt;
  if (drone.droneRetarget <= 0) { pickDroneTarget(drone); drone.droneRetarget = DRONE_RETARGET; }

  const cx = drone.x + drone.w / 2;
  const cy = drone.y + drone.h / 2;
  const dx = drone.droneTx - cx;
  const dy = drone.droneTy - cy;
  const dist = Math.hypot(dx, dy);
  if (dist > 1) {
    const step = Math.min(dist, DRONE_SPEED * dt); // 목표를 지나치지 않게 클램프
    drone.x += (dx / dist) * step;
    drone.y += (dy / dist) * step;
  }

  drone.droneFireCd -= dt;
  if (drone.droneFireCd <= 0) { fireDroneBullet(drone); drone.droneFireCd = DRONE_FIRE_INTERVAL; }
}

// 막타로 발사된 드론: facing 방향으로 직진(floating 유지 — 중력 무시). 본체 hurtbox에
// 명중하면 데미지 3 + 그로기 3을 본체에 주고 소멸. 맵 밖으로 나가도 소멸한다.
function updateLaunchedDrone(drone, dt) {
  drone.x += drone.launchVx * dt;
  drone.y += drone.launchVy * dt;
  const meow = enemies.find((e) => e.role === "meow" && e.alive);
  if (meow && aabbOverlap(getHurtbox(drone), getHurtbox(meow))) {
    hitEnemy(meow, DRONE_MEOW_DAMAGE); // 본체에 3뎀(비그로기 시점이라 풀뎀)
    addGroggyGauge(meow, DRONE_MEOW_GROGGY); // 그로기 게이지 3 적립(P2에서 게이지15로 수렴)
    TimeControl.freeze(ATTACK_HIT_STOP);
    parryFlash = 0.12;
    drone.alive = false;
    return;
  }
  if (
    drone.x + drone.w < 0 || drone.x > stage.widthPx ||
    drone.y + drone.h < 0 || drone.y > stage.heightPx
  ) drone.alive = false;
}

// ---- hitEnemy 드론 훅(combat.js에서 호출) ----
// 드론이 한 대 맞은 직후(HP는 이미 깎임)의 상태 전이를 한 곳에서 처리한다.
//   - 이미 발사된 드론: 더 처리하지 않음(재발사 방지) → true(사망 처리 건너뜀).
//   - HP 0 이하(막타): 죽는 대신 facing 방향으로 발사 → true(사망 처리 건너뜀).
//   - HP 1 이하(>0): 그로기+바닥 낙하 진입(1회) → false(일반 처리로 — 아직 안 죽음).
// 반환 true면 hitEnemy가 기본 사망 처리를 건너뛴다.
function handleDroneDamage(drone) {
  if (drone.launched) return true;
  if (drone.hp <= 0) { launchDrone(drone); return true; }
  if (drone.hp <= 1 && !drone.droneFell) droneFall(drone);
  return false;
}

// HP 1 낙하: 영구 그로기(무방비·공격 중단) + floating 해제(중력으로 바닥에 떨어짐).
// 이제 플레이어가 막타를 넣으면(다음 피격) 발사된다.
function droneFall(drone) {
  drone.droneFell = true;
  drone.permaGroggy = true; // 색/상태 표시(흙빛) + 안전상 무방비
  drone.floating = false; // 중력 적용 → 물리 패스가 떨군다
  drone.attack = null;
}

// 막타 발사: 죽는 대신 '플레이어가 보는 방향'으로 직진 발사한다(floating으로 중력 무시).
// 발사된 드론은 더는 피격/그로기 대상이 아니다(updateLaunchedDrone이 전담).
function launchDrone(drone) {
  drone.launched = true;
  drone.floating = true; // 직진 비행(중력 무시)
  drone.permaGroggy = true;
  drone.launchVx = player.facing * DRONE_LAUNCH_SPEED; // 발사 시점 facing 고정
  drone.launchVy = 0;
  if (drone.hp < 0) drone.hp = 0;
}

// ---- 드론 탄(projectiles.js의 투사체 풀에 산다) ----
// 발사 순간 플레이어 중심을 조준한 탄 1발(패링 가능). 패링하면 '쏜 드론'으로 역호밍한다.
function fireDroneBullet(drone) {
  const sx = projCenterX(drone);
  const sy = projCenterY(drone);
  const { vx, vy } = aimVel(sx, sy, projCenterX(player), projCenterY(player), DRONE_BULLET_SPEED);
  const p = makeProjectile(sx, sy, vx, vy, {
    w: DRONE_BULLET_W, h: DRONE_BULLET_H, kind: "droneBullet", damage: DRONE_BULLET_DAMAGE, parryable: true,
  });
  p.state = "incoming"; // incoming(플레이어 조준) → (패링)reflected(쏜 드론 호밍)
  p.shooter = drone; // 패링 시 되돌아갈 표적
  projectiles.push(p);
}

// 탄 패링: 반사 상태로 전환(무피해). 반사 방향(쏜 드론 호밍)은 매 프레임 updateDroneBullet이 잡는다.
function parryDroneBullet(p) {
  parryFlash = 0.15;
  TimeControl.freeze(PARRY_HIT_STOP);
  p.parryLock = PROJ_PARRY_LOCK;
  p.state = "reflected";
  p.parryable = false;
  p.damage = 0; // 반사 중엔 플레이어를 때리지 않는다
}

// 드론 탄 갱신(projectiles.js updateProjectiles의 kind 분기에서 호출).
function updateDroneBullet(p, dt) {
  if (p.parryLock > 0) p.parryLock -= dt;
  if (p.state === "incoming") {
    // 예고 없이 날아오지만 패링 가능: 플레이어 공격 히트박스와 겹치면 반사 성사
    // (탄은 방향이 없어 dayaShot처럼 겹침만 본다).
    if (p.parryable && p.parryLock <= 0) {
      const atkHb = getAttackHitbox();
      if (atkHb && aabbOverlap(atkHb, p)) { parryDroneBullet(p); return; }
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.angle = Math.atan2(p.vy, p.vx);
    if (projOutOfBounds(p)) { p.alive = false; return; }
    if (!player.dead && aabbOverlap(p, getHurtbox(player))) {
      damagePlayer(p.damage);
      p.alive = false;
    }
  } else { // reflected: 쏜 드론으로 호밍 → 명중 시 그 드론에 1뎀
    const d = p.shooter;
    if (!d || !d.alive || d.launched) { // 드론이 사라졌으면(사망/발사) 직진하다 소멸
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (projOutOfBounds(p)) p.alive = false;
      return;
    }
    const v = aimVel(projCenterX(p), projCenterY(p), projCenterX(d), projCenterY(d), DRONE_BULLET_REFLECT_SPEED);
    p.vx = v.vx;
    p.vy = v.vy;
    p.angle = Math.atan2(v.vy, v.vx);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (aabbOverlap(p, getHurtbox(d))) { // 도달 → 그 드론에 1뎀(HP1 낙하/막타 발사로 이어짐)
      hitEnemy(d, DRONE_BULLET_DAMAGE);
      p.alive = false;
    }
  }
}
