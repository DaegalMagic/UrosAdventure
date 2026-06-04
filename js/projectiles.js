// 우로스의 모험 — 투사체 시스템(비비 #3 4연 단검 · #4 큰 단검)
// (새 서브시스템은 처음부터 별도 파일 — main.js god file 방지. main.js는 update/
//  render/startStage에서 호출 3줄만 추가한다.)
//
// 투사체는 적이 아니므로 enemies/hittables가 아니라 projectiles에 산다. 전역 상태와
// 함수는 전부 호출 시점에 main/combat/effects의 player·enemies·getAttackHitbox·
// aabbOverlap·damagePlayer·redirectDaggerToDaya·TimeControl·parryFlash 등을 참조한다
// (projectiles.js는 main.js 뒤에 로드되지만 본문은 런타임에만 도므로 안전).
//
// 비비 원거리는 7초 쿨(ai.ranged.cooldown)마다 발동: bigChance(¼) 확률로 큰 단검(#4),
// 아니면 4연 단검(#3, 250ms 시차로 각자 발사 순간 플레이어 중심 조준). #2(패링불가)와
// #4의 ¼은 서로 독립이다(근접 굴림과 원거리 굴림이 별개). 방어막(#5, 다음 단계)이
// 켜지면 이 쿨이 절반이 된다 — 그 자리는 updateRangedEnemies에 주석으로 표시.

// ---- 상수 ----
const PROJ_DAGGER_W = 16; // #3 작은 단검(=폭발 파편) 박스
const PROJ_DAGGER_H = 8;
const PROJ_DAGGER_SPEED = 340; // px/s
const BIG_DAGGER_W = 34; // #4 큰 단검 박스
const BIG_DAGGER_H = 16;
const BIG_DAGGER_SPEED = 240; // px/s
const BIG_DAGGER_FUSE = 1.0; // 멈춘 뒤 폭발까지(초)
const PROJ_VOLLEY_COUNT = 4; // #3 한 번에 던지는 수
const PROJ_VOLLEY_STAGGER = 0.25; // 단검 간 시차(초) = 250ms
const PROJ_EXPLOSION_COUNT = 8; // #4 폭발 시 8방향
const PROJ_EXPLOSION_SPEED = 300;
const PROJ_DAMAGE = 1; // 플레이어가 맞을 때 피해
const PROJ_PARRY_LOCK = 0.25; // 패링 직후 같은 스윙으로 재패링 방지(초)
const PROJ_BOUNDS_MARGIN = 48; // 이 밖으로 나가면 소멸

// 키디언 직선 공격(lineShooter). 라인은 stage 전체를 가로지르는 가로/세로 띠다.
// telegraph(예고) 동안 위치가 ease-out-cubic으로 페이드인하며 패링 가능, 그 뒤 fire
// 동안 매우 빠르게 ON(데미지). 두께 LINE_THICK 안이 판정. 쿨/데미지/패링 수치는
// 데이터(ai.lineShooter)에서 읽고, 폭/연출만 여기 상수로 둔다.
const LINE_THICK = 16; // 라인 판정/렌더 두께(px). 라인 중심에서 ±절반이 판정
const LINE_TELE_W = 4; // 예고선(telegraph)의 가는 심지 두께(px)

// 다야 패턴(dayaPatterns) 박스. 수치 규칙은 데이터(ai.patterns)에서, 폭/연출만 여기.
const DAYA_SHOT_W = 18; // P1 부채꼴 투사체(칼날) 박스
const DAYA_SHOT_H = 8;
const RAIN_W = 12; // P3 낙하 투사체 박스
const RAIN_H = 20;
const SPIKE_W = 44; // P2 가시 한 더미의 폭(판정/렌더 공용)
const SPIKE_H = 40; // 다 솟았을 때 표면 위로 솟는 높이

// 이프리트 불기둥(firePillar) 박스. 폭=캐릭터 폭, 높이=캐릭터 2배(스펙). 다야 가시와
// 같은 telegraph→active 구조지만 '즉발'(예고 뒤 곧장 ON)이고 패링 불가(회피 전용)다.
const FIRE_PILLAR_W = PLAYER_W; // 캐릭터 폭(=45)
const FIRE_PILLAR_H = PLAYER_H * 2; // 캐릭터 2배 높이(=120)

// 가비아 돌(stone) 박스 + 공유 방어막 폭발 지속. 수치 규칙은 데이터(ai.gabia)에서,
// 박스/연출 길이만 여기 상수로 둔다.
const STONE_W = 20; // 돌 박스
const STONE_H = 18;
const GABIA_BLAST_TIME = 0.25; // 자기중심 폭발 판정/연출 지속(초). 짧게 한 번 친다

// 나이아 물줄기 레이저. 슈터(화면 밖 모서리) 중심에서 임의 각도로 뻗는 선분이다.
// 키디언 라인(축 고정 AABB)과 달리 '회전된 두께 laserThick 띠'라, 판정은 AABB가 아니라
// 점-선분 거리(플레이어/보스 중심 ↔ 레이저 선분)로 한다(NAIA_LASER_HALF = laserThick/2).
// 선분 길이는 맵을 충분히 가로지르게 길게 둔다(화면 밖 모서리에서 반대편까지).
const NAIA_LASER_LEN = 3000; // 레이저 선분 길이(px). 맵 대각선(~1615)보다 충분히 큼

// 실라 화살(arrow) 박스. 수치 규칙은 데이터(ai.sila)에서, 박스/연출만 여기 상수로 둔다.
const ARROW_W = 30; // 화살 박스(진행 방향이 +x인 길쭉한 화살)
const ARROW_H = 8;

// ---- 상태 ----
let projectiles = []; // 살아있는 투사체
let pendingDaggers = []; // 시차 발사 대기열: { delay, shooter }
let lines = []; // 키디언 직선 공격: { axis, pos, state, t, shooter, hitPlayer, alive }
let dayaSpikes = []; // 다야 P2 가시: { x, surfaceY, state, t, shooter, hitPlayer, alive }
let dayaRainQueue = []; // 다야 P3 낙하 대기열: { delay, x, shooter }
let firePillars = []; // 이프리트 불기둥: { x, surfaceY, state, t, shooter, hitPlayer, alive }
let gabiaBlasts = []; // 가비아 공유 방어막 폭발: { x, y, w, h, t, damage, hitPlayer, alive }
let naiaLasers = []; // 나이아 레이저: { ox, oy, ex, ey, state, t, shooter, hitPlayer, hitBosses[], alive }
let naiaLaserQueue = []; // 시차 발사 대기열(볼리): { delay, shooter, aimPlayer }
let naiaWave = null; // 나이아 파도(동시 1개): { shooter, phase("warn"|"active"), t, x, w, speed, ... } | null
let shadyWeapons = []; // 셰이디 차원문 난사 완주 시 낙하하는 거대 무기: { x, y, w, h, vy, damage, hitPlayer, alive }

// startStage에서 호출(스테이지 새로 구성 시 잔재 제거).
function resetProjectiles() {
  projectiles = [];
  pendingDaggers = [];
  lines = [];
  dayaSpikes = [];
  dayaRainQueue = [];
  firePillars = [];
  gabiaBlasts = [];
  naiaLasers = [];
  naiaLaserQueue = [];
  naiaWave = null;
  shadyWeapons = [];
}

// 점(px,py)에서 선분 (ax,ay)-(bx,by)까지의 최단 거리. 나이아 레이저(회전된 띠) 판정용.
function pointSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t)); // 선분 양 끝으로 클램프(무한직선이 아니라 선분)
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// from→to 단위벡터 × speed.
function aimVel(fromX, fromY, toX, toY, speed) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.hypot(dx, dy) || 1;
  return { vx: (dx / len) * speed, vy: (dy / len) * speed };
}

// 중심(cx,cy) 기준으로 투사체를 만든다(박스는 좌상단 x,y로 저장 — aabbOverlap 공용).
function makeProjectile(cx, cy, vx, vy, opts) {
  return {
    x: cx - opts.w / 2,
    y: cy - opts.h / 2,
    w: opts.w,
    h: opts.h,
    vx,
    vy,
    alive: true,
    kind: opts.kind, // "dagger"(작은/파편) | "big"(큰 단검)
    damage: opts.damage,
    parryable: !!opts.parryable,
    state: opts.kind === "big" ? "flying" : null, // 큰 단검: flying→stopped→returning
    fuse: 0, // stopped 동안 폭발까지 남은 시간
    parryLock: 0, // >0이면 패링 불가(직전 패링의 같은 스윙 방지)
    hitPlayer: false, // stopped 접촉 피해 1회용(빠져나갔다 다시 들어오면 재적용)
    angle: Math.atan2(vy, vx), // 렌더 회전(진행 방향)
  };
}

function projCenterX(p) { return p.x + p.w / 2; }
function projCenterY(p) { return p.y + p.h / 2; }

function projOutOfBounds(p) {
  const M = PROJ_BOUNDS_MARGIN;
  return (
    p.x + p.w < -M ||
    p.x > stage.widthPx + M ||
    p.y + p.h < -M ||
    p.y > stage.heightPx + M
  );
}

// ---- 발사 ----
// 슈터 중심에서 '지금' 플레이어 중심을 향해 작은 단검 하나(#3 한 발/폭발 파편 공용).
function spawnDaggerFrom(shooter) {
  const sx = projCenterX(shooter);
  const sy = projCenterY(shooter);
  const { vx, vy } = aimVel(sx, sy, projCenterX(player), projCenterY(player), PROJ_DAGGER_SPEED);
  projectiles.push(
    makeProjectile(sx, sy, vx, vy, { w: PROJ_DAGGER_W, h: PROJ_DAGGER_H, kind: "dagger", damage: PROJ_DAMAGE, parryable: false })
  );
}

// #4 큰 단검 한 발(발사 순간 플레이어 조준, 패링 가능).
function fireBigDagger(shooter) {
  const sx = projCenterX(shooter);
  const sy = projCenterY(shooter);
  const { vx, vy } = aimVel(sx, sy, projCenterX(player), projCenterY(player), BIG_DAGGER_SPEED);
  projectiles.push(
    makeProjectile(sx, sy, vx, vy, { w: BIG_DAGGER_W, h: BIG_DAGGER_H, kind: "big", damage: PROJ_DAMAGE, parryable: true })
  );
}

// #3 4연 단검 예약(250ms 시차). 각 발은 발사 순간 슈터 위치에서 플레이어를 조준한다.
function scheduleVolley(shooter) {
  for (let i = 0; i < PROJ_VOLLEY_COUNT; i++) {
    pendingDaggers.push({ delay: i * PROJ_VOLLEY_STAGGER, shooter });
  }
}

// 원거리 발동: ¼ 큰 단검(#4), ¾ 4연 단검(#3). (#2와 독립된 굴림.)
function fireRanged(enemy) {
  const bigChance = enemy.ai.ranged.bigChance;
  if (Math.random() < bigChance) fireBigDagger(enemy);
  else scheduleVolley(enemy);
}

// #4 폭발: 중심에서 8방향으로 파편 단검(데미지 있음). 폭발 순간 자체는 무피해.
function explodeBigDagger(p) {
  const cx = projCenterX(p);
  const cy = projCenterY(p);
  for (let i = 0; i < PROJ_EXPLOSION_COUNT; i++) {
    const a = (i / PROJ_EXPLOSION_COUNT) * Math.PI * 2;
    projectiles.push(
      makeProjectile(cx, cy, Math.cos(a) * PROJ_EXPLOSION_SPEED, Math.sin(a) * PROJ_EXPLOSION_SPEED, {
        w: PROJ_DAGGER_W, h: PROJ_DAGGER_H, kind: "dagger", damage: PROJ_DAMAGE, parryable: false,
      })
    );
  }
}

// 큰 단검 패링: flying→stopped(그 자리 멈춤 + 1초 도화선), stopped→returning(다야로).
function parryBigDagger(p) {
  parryFlash = 0.15;
  TimeControl.freeze(PARRY_HIT_STOP);
  p.parryLock = PROJ_PARRY_LOCK;
  if (p.state === "flying") {
    p.state = "stopped";
    p.vx = 0;
    p.vy = 0;
    p.fuse = BIG_DAGGER_FUSE;
    p.hitPlayer = false;
  } else if (p.state === "stopped") {
    p.state = "returning";
    p.damage = 0; // 다야로 돌아가는 동안엔 플레이어를 때리지 않는다
    p.parryable = false;
  }
}

// ---- 갱신 ----
// 적의 원거리 쿨다운(7초)을 굴려 때가 되면 발사한다. 그로기/사망 중엔 쉰다.
function updateRangedEnemies(dt) {
  for (const e of enemies) {
    if (!e.alive || !e.ai.ranged) continue;
    if (e.permaGroggy || e.groggyTime > 0) continue;
    if (e.rangedCd == null) e.rangedCd = e.ai.ranged.cooldown; // 첫 발사까지 풀쿨 대기
    // 방어막(#5) 지속 중엔 쿨을 2배 속도로 깎는다 = 실효 쿨 절반(상태 변화에 즉시 반응).
    const cdSpeed = e.shieldCharges > 0 ? 2 : 1;
    e.rangedCd -= dt * cdSpeed;
    if (e.rangedCd <= 0) {
      fireRanged(e);
      e.rangedCd = e.ai.ranged.cooldown;
    }
  }
}

function processPendingDaggers(dt) {
  const next = [];
  for (const pd of pendingDaggers) {
    if (!pd.shooter.alive) continue; // 슈터가 죽으면 남은 발 취소
    pd.delay -= dt;
    if (pd.delay <= 0) spawnDaggerFrom(pd.shooter);
    else next.push(pd);
  }
  pendingDaggers = next;
}

function updateSimpleProjectile(p, dt) {
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (projOutOfBounds(p)) { p.alive = false; return; }
  if (!player.dead && p.damage > 0 && aabbOverlap(p, getHurtbox(player))) {
    damagePlayer(p.damage);
    p.alive = false;
  }
}

function updateBigDagger(p, dt) {
  if (p.parryLock > 0) p.parryLock -= dt;
  // 패링: 플레이어 공격 히트박스(전방)와 겹치면 성사. 히트박스가 facing 방향으로
  // 만들어지므로 겹침=정면으로 본다(별도 facing 판정 불필요).
  if (p.parryable && p.parryLock <= 0) {
    const atkHb = getAttackHitbox();
    if (atkHb && aabbOverlap(atkHb, p)) parryBigDagger(p);
  }
  if (p.state === "flying") {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.angle = Math.atan2(p.vy, p.vx);
    if (projOutOfBounds(p)) { p.alive = false; return; }
    if (!player.dead && aabbOverlap(p, getHurtbox(player))) {
      damagePlayer(p.damage);
      p.alive = false;
    }
  } else if (p.state === "stopped") {
    p.fuse -= dt;
    // 멈춰 있어도 공격 판정: 접촉 시 1회 피해(빠졌다 다시 들어오면 재적용).
    if (!player.dead && aabbOverlap(p, getHurtbox(player))) {
      if (!p.hitPlayer) { damagePlayer(p.damage); p.hitPlayer = true; }
    } else {
      p.hitPlayer = false;
    }
    if (p.fuse <= 0) { explodeBigDagger(p); p.alive = false; }
  } else if (p.state === "returning") {
    const daya = enemies.find((e) => e.alive && e.role === "daya");
    if (!daya) { // 다야가 없으면(사망) 그냥 날아가다 소멸
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (projOutOfBounds(p)) p.alive = false;
      return;
    }
    const v = aimVel(projCenterX(p), projCenterY(p), projCenterX(daya), projCenterY(daya), BIG_DAGGER_SPEED);
    p.vx = v.vx;
    p.vy = v.vy;
    p.angle = Math.atan2(v.vy, v.vx);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (aabbOverlap(p, getHurtbox(daya))) { // 도달 → 방어력 깎기(단검 진입점과 합류)
      redirectDaggerToDaya();
      p.alive = false;
    }
  }
}

// ---- 키디언 직선 공격(lineShooter) ----
// 라인의 판정/렌더 AABB: stage 전체를 가로지르는 가로(h)/세로(v) 띠.
function lineBand(L) {
  if (L.axis === "h") return { x: 0, y: L.pos - LINE_THICK / 2, w: stage.widthPx, h: LINE_THICK };
  return { x: L.pos - LINE_THICK / 2, y: 0, w: LINE_THICK, h: stage.heightPx };
}

// 가로/세로를 랜덤으로 골라, 발동 시점의 플레이어 '피격박스 정중앙'을 관통하는 라인을
// 예고로 띄운다(이동 박스가 아니라 hurtbox 기준이라야 조준한 곳이 실제로 맞는다).
function spawnLine(shooter) {
  const axis = Math.random() < 0.5 ? "h" : "v";
  const hb = getHurtbox(player);
  const pos = axis === "h" ? hb.y + hb.h / 2 : hb.x + hb.w / 2;
  lines.push({ axis, pos, state: "telegraph", t: 0, shooter, hitPlayer: false, alive: true });
}

// 라인 패링(예고 동안만): 라인을 취소하고 슈터의 다음 발사를 늦춘다. 누적 패링이
// 봉인 임계(sealParries)에 닿으면 키디언을 봉인한다 — HP가 없으니 이게 곧 처치다.
function parryLine(L) {
  parryFlash = 0.15;
  TimeControl.freeze(PARRY_HIT_STOP);
  L.alive = false;
  const k = L.shooter;
  const ls = k.ai.lineShooter;
  k.lineCd += ls.parryCdBonus; // 다음 발사까지 쿨 +parryCdBonus초
  k.lineParries = (k.lineParries || 0) + 1;
  if (k.lineParries >= ls.sealParries) k.alive = false; // 봉인 = 처치(클리어 조건에 편입)
}

// 키디언별 발사 쿨다운을 굴려 때가 되면 라인을 띄운다. 그로기/사망/봉인 중엔 쉰다.
// (미래: 비비 포식 시 키디언 쿨이 빨라짐 → 여기 cd 감소에 배수를 곱하면 된다.)
function updateLineShooters(dt) {
  for (const e of enemies) {
    if (!e.alive || !e.ai.lineShooter) continue;
    if (e.permaGroggy || e.groggyTime > 0) continue;
    const ls = e.ai.lineShooter;
    if (e.lineCd == null) e.lineCd = randRange(ls.cdMin, ls.cdMax); // 첫 발사까지 랜덤 대기
    // 광폭화(비비 포식): 쿨을 enrageCdMult배 속도로 깎는다 = 발사 주기 1/배수.
    e.lineCd -= dt * (e.lineEnraged ? ls.enrageCdMult : 1);
    if (e.lineCd <= 0) {
      spawnLine(e);
      e.lineCd = randRange(ls.cdMin, ls.cdMax);
    }
  }
}

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function updateLines(dt) {
  for (const L of lines) {
    if (!L.alive) continue;
    if (!L.shooter.alive) { L.alive = false; continue; } // 슈터 봉인 시 진행 중 라인도 소멸
    const ls = L.shooter.ai.lineShooter;
    L.t += dt;
    if (L.state === "telegraph") {
      // 예고 동안 패링 가능: 플레이어 공격 히트박스가 라인 띠와 겹치면 성사(라인은
      // 방향이 없어 facing 판정 없이 겹침만 본다 — 큰 단검 패링과 같은 규칙).
      // 단 광폭화(비비 포식) 중인 키디언의 라인은 패링 불가(=봉인 불가) — 피해야 한다.
      if (!L.shooter.lineEnraged) {
        const atkHb = getAttackHitbox();
        if (atkHb && aabbOverlap(atkHb, lineBand(L))) { parryLine(L); continue; }
      }
      if (L.t >= ls.telegraph) { L.state = "firing"; L.t = 0; L.hitPlayer = false; }
    } else { // firing: 라인 ON. 접촉 시 1회 피해(짧게 지나간다).
      if (!player.dead && !L.hitPlayer && aabbOverlap(lineBand(L), getHurtbox(player))) {
        damagePlayer(ls.damage);
        L.hitPlayer = true;
      }
      if (L.t >= ls.fire) L.alive = false;
    }
  }
  lines = lines.filter((L) => L.alive);
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// ---- 다야 패턴(dayaPatterns) ----
// 다야는 정지형이라 enemy.attack(근접 FSM)을 쓰지 않고, 여기서 cooldown초마다 3패턴
// (P1 부채꼴 · P2 가시 · P3 비) 중 직전과 다른 하나를 굴려 발동한다. 쿨/수치는
// 데이터(ai.patterns)에서 읽는다. 그로기/사망 중엔 쉰다(다야는 그로기되진 않지만 가드).
function updateDayaPatterns(dt) {
  for (const e of enemies) {
    if (!e.alive || !e.ai.patterns) continue;
    if (e.permaGroggy || e.groggyTime > 0) continue;
    const pat = e.ai.patterns;
    if (e.dayaCd == null) e.dayaCd = pat.cooldown; // 첫 발동까지 풀쿨 대기
    e.dayaCd -= dt;
    if (e.dayaCd <= 0) {
      fireDayaPattern(e);
      e.dayaCd = pat.cooldown;
    }
  }
}

// 3패턴 중 직전과 다른 하나를 골라 발동(연속 같은 패턴 금지).
function fireDayaPattern(e) {
  let idx;
  do { idx = Math.floor(Math.random() * 3); } while (idx === e.dayaLastPattern);
  e.dayaLastPattern = idx;
  if (idx === 0) fireDayaFan(e);
  else if (idx === 1) spawnDayaSpike(e);
  else scheduleDayaRain(e);
}

// P1 부채꼴: 발동 시점 플레이어 정조준 1발 + 위아래로 ±fanSpread씩 벌어진 발들(총
// fanCount발). 각 발은 패링 가능하며, 패링하면 reflected로 전환된다(updateDayaShot).
function fireDayaFan(e) {
  const pat = e.ai.patterns;
  const sx = projCenterX(e);
  const sy = projCenterY(e);
  const base = Math.atan2(projCenterY(player) - sy, projCenterX(player) - sx);
  const half = (pat.fanCount - 1) / 2; // 중앙(=정조준) 기준 위아래 대칭 분포
  for (let i = 0; i < pat.fanCount; i++) {
    const a = base + (i - half) * pat.fanSpread;
    const p = makeProjectile(sx, sy, Math.cos(a) * pat.shotSpeed, Math.sin(a) * pat.shotSpeed, {
      w: DAYA_SHOT_W, h: DAYA_SHOT_H, kind: "dayaShot", damage: pat.shotDamage, parryable: true,
    });
    p.state = "incoming"; // incoming(플레이어 조준) → (패링)reflected(플레이어 방향)
    p.reflectDamage = pat.reflectDamage; // 반사체가 비비를 맞힐 때 피해
    p.reflectSpeed = pat.reflectSpeed;
    projectiles.push(p);
  }
}

// 다야 P1 투사체 패링: '플레이어가 보는 방향(facing)'으로 수평 반사. 반사 중엔
// 플레이어를 때리지 않고(damage 0) 적에게만 작용한다(updateDayaShot의 reflected).
function parryDayaShot(p) {
  parryFlash = 0.15;
  TimeControl.freeze(PARRY_HIT_STOP);
  p.parryLock = PROJ_PARRY_LOCK;
  p.state = "reflected";
  p.parryable = false;
  p.damage = 0;
  p.vx = player.facing * p.reflectSpeed;
  p.vy = 0;
  p.angle = player.facing > 0 ? 0 : Math.PI;
}

function updateDayaShot(p, dt) {
  if (p.parryLock > 0) p.parryLock -= dt;
  if (p.state === "incoming") {
    // 예고 없이 날아오지만 패링 가능: 플레이어 공격 히트박스와 겹치면 반사 성사.
    if (p.parryable && p.parryLock <= 0) {
      const atkHb = getAttackHitbox();
      if (atkHb && aabbOverlap(atkHb, p)) { parryDayaShot(p); return; }
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.angle = Math.atan2(p.vy, p.vx);
    if (projOutOfBounds(p)) { p.alive = false; return; }
    if (!player.dead && aabbOverlap(p, getHurtbox(player))) {
      damagePlayer(p.damage);
      p.alive = false;
    }
  } else { // reflected: 플레이어 방향으로 직진하며 적에게 작용(플레이어 무피해)
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (projOutOfBounds(p)) { p.alive = false; return; }
    for (const e of enemies) {
      if (!e.alive) continue;
      if (!aabbOverlap(p, getHurtbox(e))) continue;
      // 비비를 맞히면 reflectDamage(=3). 다야/키디언이면 피격은 일어나되 노데미지
      // (연출만 — 다야는 단검 진입점이 따로 있고, 키디언은 봉인으로만 처치).
      if (e.role === "bibi") {
        hitEnemy(e, p.reflectDamage);
      } else {
        TimeControl.freeze(ATTACK_HIT_STOP);
        parryFlash = 0.1;
      }
      p.alive = false;
      break;
    }
  }
}

// P2 가시: 발동 순간 플레이어 발밑(중심 x, 선 층의 표면 y)에 위험표시를 깐다.
// 이후 위치는 고정 — telegraph 동안 따라가지 않으므로 옆으로 피하면 된다.
function spawnDayaSpike(e) {
  const footY = player.y + player.h;
  dayaSpikes.push({
    x: projCenterX(player),
    surfaceY: floorSurfaceY(floorOf(footY)),
    state: "telegraph",
    t: 0,
    shooter: e,
    hitPlayer: false,
    alive: true,
  });
}

// 가시 한 더미의 현재 AABB(판정/렌더 공용). telegraph 중엔 높이 0(판정 없음),
// active 중엔 spikeRise초에 걸쳐 SPIKE_H까지 솟는다(솟는 중에도 닿으면 피해).
function spikeBox(s) {
  const pat = s.shooter.ai.patterns;
  const rise = s.state === "active" ? Math.min(1, s.t / pat.spikeRise) : 0;
  const h = SPIKE_H * rise;
  return { x: s.x - SPIKE_W / 2, y: s.surfaceY - h, w: SPIKE_W, h };
}

function updateDayaSpikes(dt) {
  for (const s of dayaSpikes) {
    if (!s.alive) continue;
    if (!s.shooter.alive) { s.alive = false; continue; } // 다야 사망 시 진행 중 가시도 소멸
    const pat = s.shooter.ai.patterns;
    s.t += dt;
    if (s.state === "telegraph") {
      if (s.t >= pat.spikeTelegraph) { s.state = "active"; s.t = 0; s.hitPlayer = false; }
    } else { // active: 가시 솟음 — 접촉 시 1회 피해(빠졌다 다시 들어오면 재적용)
      if (!player.dead && aabbOverlap(spikeBox(s), getHurtbox(player))) {
        if (!s.hitPlayer) { damagePlayer(pat.spikeDamage); s.hitPlayer = true; }
      } else {
        s.hitPlayer = false;
      }
      if (s.t >= pat.spikeActive) s.alive = false;
    }
  }
  dayaSpikes = dayaSpikes.filter((s) => s.alive);
}

// ---- 이프리트 불기둥(firePillar) ----
// 다야 가시와 같은 telegraph→active 구조를 재활용하되, 예고 뒤 '즉발'(곧장 ON)이고
// 패링 불가다. enemy.js의 ifritFirePillar가 플레이어 발밑(중심 x, 현재 층 표면 y)에
// 깐다. 폭=캐릭터 폭, 높이=캐릭터 2배로 표면 위로 솟는 불기둥(active 동안 접촉 1회 피해).
function spawnFirePillar(shooter, x, surfaceY) {
  firePillars.push({ x, surfaceY, state: "telegraph", t: 0, shooter, hitPlayer: false, alive: true });
}

// 불기둥 한 기의 AABB(판정/렌더 공용). telegraph 중엔 높이 0(판정 없음), active 중엔
// 표면 위로 FIRE_PILLAR_H만큼 선 기둥(즉발이라 솟는 연출 없이 바로 전체 높이).
function firePillarBox(p) {
  const h = p.state === "active" ? FIRE_PILLAR_H : 0;
  return { x: p.x - FIRE_PILLAR_W / 2, y: p.surfaceY - h, w: FIRE_PILLAR_W, h };
}

function updateFirePillars(dt) {
  for (const p of firePillars) {
    if (!p.alive) continue;
    if (!p.shooter.alive) { p.alive = false; continue; } // 이프리트 사망 시 진행 중 기둥도 소멸
    const cfg = p.shooter.ai.ifrit;
    p.t += dt;
    if (p.state === "telegraph") {
      if (p.t >= cfg.pillarTelegraph) { p.state = "active"; p.t = 0; p.hitPlayer = false; }
    } else { // active: 즉발 불기둥 ON — 접촉 시 1회 피해(패링 불가, 회피 전용)
      if (!player.dead && aabbOverlap(firePillarBox(p), getHurtbox(player))) {
        if (!p.hitPlayer) { damagePlayer(cfg.pillarDamage); p.hitPlayer = true; }
      } else {
        p.hitPlayer = false;
      }
      if (p.t >= cfg.pillarActive) p.alive = false;
    }
  }
  firePillars = firePillars.filter((p) => p.alive);
}

// ---- 가비아 돌(stone) ----
// 발사 순간 플레이어를 조준한 돌 한 발(패링 가능). 패링하면 '각도 반사' — 다야 P1이
// player.facing로 '수평' 반사(vy=0)인 것과 달리, 돌은 player.facing 방향의 수직 거울에
// 부딪힌 듯 '수평 성분만 반전'하고 수직 성분(입사각)은 유지한다. 반사된 돌은 플레이어를
// 때리지 않고(damage 0) 이프리트/가비아에게만 reflectDamage로 작용한다.
function fireGabiaStone(shooter) {
  const cfg = shooter.ai.gabia;
  const sx = projCenterX(shooter);
  const sy = projCenterY(shooter);
  const { vx, vy } = aimVel(sx, sy, projCenterX(player), projCenterY(player), cfg.stoneSpeed);
  const p = makeProjectile(sx, sy, vx, vy, {
    w: STONE_W, h: STONE_H, kind: "stone", damage: cfg.stoneDamage, parryable: true,
  });
  p.state = "incoming"; // incoming(플레이어 조준) → (패링)reflected(각도 반사)
  p.reflectDamage = cfg.stoneDamage; // 반사체가 보스를 맞힐 때 피해
  projectiles.push(p);
}

// 돌 패링: 각도 반사(수평 성분만 반전 — 수직 거울에 튕긴 듯, 입사각 유지).
function parryGabiaStone(p) {
  parryFlash = 0.15;
  TimeControl.freeze(PARRY_HIT_STOP);
  p.parryLock = PROJ_PARRY_LOCK;
  p.state = "reflected";
  p.parryable = false;
  p.damage = 0; // 반사 중엔 플레이어를 때리지 않는다
  p.vx = -p.vx; // 수평 성분 반전(수직 거울 = player.facing 면), vy(입사각)는 유지
  p.angle = Math.atan2(p.vy, p.vx);
}

function updateStone(p, dt) {
  if (p.parryLock > 0) p.parryLock -= dt;
  if (p.state === "incoming") {
    // 예고 없이 날아오지만 패링 가능: 플레이어 공격 히트박스와 겹치면 반사 성사.
    if (p.parryable && p.parryLock <= 0) {
      const atkHb = getAttackHitbox();
      if (atkHb && aabbOverlap(atkHb, p)) { parryGabiaStone(p); return; }
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.angle = Math.atan2(p.vy, p.vx);
    if (projOutOfBounds(p)) { p.alive = false; return; }
    if (!player.dead && aabbOverlap(p, getHurtbox(player))) {
      damagePlayer(p.damage);
      p.alive = false;
    }
  } else { // reflected: 각도 반사로 날아가며 이프리트/가비아에게만 작용(플레이어 무피해)
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (projOutOfBounds(p)) { p.alive = false; return; }
    for (const e of enemies) {
      if (!e.alive || e.floating) continue; // 화면 밖 저격수(실라/나이아) 제외
      if (e.role !== "ifrit" && e.role !== "gabia") continue; // 보스만 피해 대상
      if (!aabbOverlap(p, getHurtbox(e))) continue;
      hitEnemy(e, p.reflectDamage);
      p.alive = false;
      break;
    }
  }
}

// ---- 가비아 공유 방어막 / 무적 / 폭발 ----
// 가비아가 shieldCycle(10초)마다 시전한다. 매 3번째 시전은 방어막 대신 무적이다.
//   방어막: 이프리트+가비아 동시에 시간제(shieldDuration초) 방어력 버프(+shieldDefenseBuff).
//     HP를 흡수하는 비비 방어막(shieldCharges)과 달리 '시간'으로만 풀리고, 그 사이 피해는
//     방어력 합산으로 줄어든다(combat.js hitEnemy). 방어막 유지 중 피격된(gShieldHit) 쪽은
//     해제 explodeDelay초 뒤 자기중심 폭발(spawnGabiaBlast).
//   무적(3번째): 둘 중 HP 적은 쪽 하나만 invincDuration초. 때리면 플레이어가 invincStagger초
//     경직되고 무적은 즉시 해제된다(combat.js hitEnemy의 gInvinc 분기).
// 매 프레임 호출(updateProjectiles). 가비아 사망 후에도 잔여 타이머(방어막/폭발/무적)는
// 끝까지 처리하되, 새 시전은 가비아가 살아있고 그로기 아닐 때만 한다.
function updateGabiaShared(dt) {
  // 1) 모든 보스의 방어막/무적/폭발 타이머 진행(가비아 생사와 무관).
  for (const e of enemies) {
    if (e.gShieldTime > 0) {
      e.gShieldTime -= dt;
      if (e.gShieldTime <= 0) {
        e.gShieldTime = 0;
        // 방어막 유지 중 피격됐다면 해제 후 폭발 예약(자기중심).
        if (e.gShieldHit) { e.gExplodeTimer = e.gExplodeDelay; e.gShieldHit = false; }
      }
    }
    if (e.gInvincTime > 0) {
      e.gInvincTime -= dt;
      if (e.gInvincTime <= 0) { e.gInvincTime = 0; e.gInvinc = false; }
    }
    if (e.gExplodeTimer > 0) {
      e.gExplodeTimer -= dt;
      if (e.gExplodeTimer <= 0) { e.gExplodeTimer = 0; spawnGabiaBlast(e); }
    }
  }
  // 2) 가비아 시전 주기(살아있고 그로기 아님).
  const gabia = enemies.find((e) => e.alive && e.role === "gabia");
  if (!gabia || gabia.permaGroggy || gabia.groggyTime > 0) return;
  const cfg = gabia.ai.gabia;
  if (gabia.gShieldCd == null) gabia.gShieldCd = cfg.shieldCycle; // 첫 시전까지 풀쿨 대기
  gabia.gShieldCd -= dt;
  if (gabia.gShieldCd <= 0) {
    gabia.gShieldCd = cfg.shieldCycle;
    gabia.gCastCount = (gabia.gCastCount || 0) + 1;
    if (gabia.gCastCount % 3 === 0) castGabiaInvinc(cfg);
    else castGabiaShield(cfg);
  }
}

// 보호 대상 = 살아있는 이프리트/가비아(공유 방어막은 group의 이프리트도 함께 보호).
function gabiaProtectees() {
  return enemies.filter((e) => e.alive && (e.role === "ifrit" || e.role === "gabia"));
}

// 공유 방어막 시전: 이프리트+가비아 동시에 시간제 방어막 + 방어력 버프를 건다.
// 폭발 수치는 각자에 저장해 둔다(가비아가 죽어도 폭발이 제 수치로 터지도록).
function castGabiaShield(cfg) {
  for (const e of gabiaProtectees()) {
    e.gShieldTime = cfg.shieldDuration;
    e.gShieldBuff = cfg.shieldDefenseBuff;
    e.gShieldHit = false;
    e.gExplodeDelay = cfg.explodeDelay;
    e.gExplodeScale = cfg.explodeScale;
    e.gExplodeDamage = cfg.explodeDamage;
  }
}

// 무적 시전(매 3번째): 둘 중 HP 적은 쪽 하나만. 경직 길이도 저장(hitEnemy가 읽는다).
function castGabiaInvinc(cfg) {
  const ps = gabiaProtectees();
  if (ps.length === 0) return;
  let target = ps[0];
  for (const e of ps) if (e.hp < target.hp) target = e;
  target.gInvinc = true;
  target.gInvincTime = cfg.invincDuration;
  target.gStagger = cfg.invincStagger;
}

// 자기중심 폭발: 캐릭터 중심에서 가로·세로 gExplodeScale배 범위. dmg gExplodeDamage,
// 패링 불가(회피 전용). updateGabiaBlasts가 한 번만 판정한다.
function spawnGabiaBlast(e) {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  const w = e.w * e.gExplodeScale;
  const h = e.h * e.gExplodeScale;
  gabiaBlasts.push({ x: cx - w / 2, y: cy - h / 2, w, h, t: 0, damage: e.gExplodeDamage, hitPlayer: false, alive: true });
}

function updateGabiaBlasts(dt) {
  for (const b of gabiaBlasts) {
    if (!b.alive) continue;
    b.t += dt;
    if (!player.dead && !b.hitPlayer && aabbOverlap(b, getHurtbox(player))) {
      damagePlayer(b.damage); // 패링 불가(회피 전용)
      b.hitPlayer = true;
    }
    if (b.t >= GABIA_BLAST_TIME) b.alive = false;
  }
  gabiaBlasts = gabiaBlasts.filter((b) => b.alive);
}

// P3 비: 맵 가로를 rainSlot으로 나눈 칸 중 랜덤으로 rainCount개를, rainInterval초마다
// 1~2개씩 떨어뜨리도록 대기열에 예약한다(각자 화면 위에서 등속 낙하·패링 시 소멸).
function scheduleDayaRain(e) {
  const pat = e.ai.patterns;
  const slots = Math.max(1, Math.floor(stage.widthPx / pat.rainSlot));
  let delay = 0;
  let made = 0;
  while (made < pat.rainCount) {
    const n = Math.random() < 0.5 ? 1 : 2; // 한 틱에 1~2개
    for (let i = 0; i < n && made < pat.rainCount; i++) {
      const col = Math.floor(Math.random() * slots);
      const x = col * pat.rainSlot + pat.rainSlot / 2; // 칸 중심
      dayaRainQueue.push({ delay, x, shooter: e });
      made++;
    }
    delay += pat.rainInterval;
  }
}

function processDayaRain(dt) {
  const next = [];
  for (const r of dayaRainQueue) {
    if (!r.shooter.alive) continue; // 다야 사망 시 남은 낙하 취소
    r.delay -= dt;
    if (r.delay <= 0) spawnRainDrop(r);
    else next.push(r);
  }
  dayaRainQueue = next;
}

function spawnRainDrop(r) {
  const pat = r.shooter.ai.patterns;
  const p = makeProjectile(r.x, -PROJ_BOUNDS_MARGIN, 0, pat.rainSpeed, {
    w: RAIN_W, h: RAIN_H, kind: "rainDrop", damage: pat.rainDamage, parryable: true,
  });
  projectiles.push(p);
}

// P3 낙하 투사체: 패링하면 반사 없이 그냥 부서진다. 그 외엔 단순 직진 투사체와 동일.
function updateRainDrop(p, dt) {
  if (p.parryLock > 0) p.parryLock -= dt;
  if (p.parryable && p.parryLock <= 0) {
    const atkHb = getAttackHitbox();
    if (atkHb && aabbOverlap(atkHb, p)) {
      parryFlash = 0.15;
      TimeControl.freeze(PARRY_HIT_STOP);
      p.alive = false;
      return;
    }
  }
  updateSimpleProjectile(p, dt);
}

// ---- 나이아(물줄기 레이저 / 파도) ----
// 나이아는 화면 밖 오른쪽 위 모서리에 떠 있는(floating) 정지형 저격수다. 다야 패턴처럼
// 매 프레임 enemies에서 나이아를 찾아 쿨을 굴려 공격을 결정한다. 매 waveEvery번째 공격은
// 레이저 대신 파도(naiaWave)다. 파도가 존재(주의표시~소멸)하는 동안은 쿨을 멈추고, 파도가
// 사라지는 순간 쿨을 다시 채운다(updateNaiaWave). sealed면 새 발사·파도를 시작하지 않는다.
function updateNaia(dt) {
  const naia = enemies.find((e) => e.alive && e.role === "naia");
  if (!naia) return;
  if (naia.sealed) return; // 봉인: 발사·파도 모두 중지(봉인 카운터는 실라 단계에서 연결)
  const cfg = naia.ai.naia;
  if (naia.naiaCd == null) naia.naiaCd = cfg.laserCd; // 첫 발사까지 풀쿨 대기
  if (naia.naiaCount == null) naia.naiaCount = 0;
  // 파도가 떠 있는(주의표시 포함) 동안은 쿨 정지. 파도 소멸 시 updateNaiaWave가 쿨을 리셋한다.
  if (naiaWave) return;
  naia.naiaCd -= dt;
  if (naia.naiaCd <= 0) {
    naia.naiaCount += 1;
    if (naia.naiaCount % cfg.waveEvery === 0) {
      spawnNaiaWave(naia); // 파도 차례 — 쿨은 파도가 사라진 뒤에 리셋(여기선 두지 않음)
    } else {
      scheduleNaiaLasers(naia); // 레이저 볼리(시차 3발) 예약
      naia.naiaCd = cfg.laserCd;
    }
  }
}

// 레이저 볼리 예약: laserVolley발을 laserVolleyGap초 간격으로 발사한다. 마지막 한 발만
// 발사 시점 플레이어를 정조준하고, 앞의 발들은 완전 랜덤 각도다(processNaiaLaserQueue).
function scheduleNaiaLasers(naia) {
  const cfg = naia.ai.naia;
  for (let i = 0; i < cfg.laserVolley; i++) {
    naiaLaserQueue.push({ delay: i * cfg.laserVolleyGap, shooter: naia, aimPlayer: i === cfg.laserVolley - 1 });
  }
}

// 시차 대기열을 굴려 때가 된 레이저를 발사한다. 슈터가 봉인/사망하면 남은 발은 취소.
function processNaiaLaserQueue(dt) {
  const next = [];
  for (const q of naiaLaserQueue) {
    if (!q.shooter.alive || q.shooter.sealed) continue;
    q.delay -= dt;
    if (q.delay <= 0) spawnNaiaLaser(q.shooter, q.aimPlayer);
    else next.push(q);
  }
  naiaLaserQueue = next;
}

// 레이저 한 발: 시작점(ox,oy)에서 조준점(tx,ty)을 향해 길게 뻗는 선분을 telegraph로
// 띄운다. aimPlayer(볼리 마지막 발)면 슈터(오른쪽 위 모서리)에서 플레이어 중심을 정조준.
// 그 외(앞 발들)는 시작점이 맵 위/왼/오른쪽 변 중 랜덤 점, 조준점은 플레이어 중심
// ±(aimSpreadX, aimSpreadY) 랜덤(빗나갈 수 있음).
function spawnNaiaLaser(naia, aimPlayer) {
  const ph = getHurtbox(player);
  const pcx = ph.x + ph.w / 2;
  const pcy = ph.y + ph.h / 2;
  let ox, oy, tx, ty;
  if (aimPlayer) {
    ox = projCenterX(naia);
    oy = projCenterY(naia);
    tx = pcx; // 플레이어 정조준
    ty = pcy;
  } else {
    const edge = Math.floor(Math.random() * 3); // 0=위, 1=왼, 2=오른쪽 변
    if (edge === 0) { ox = Math.random() * stage.widthPx; oy = 0; }
    else if (edge === 1) { ox = 0; oy = Math.random() * stage.heightPx; }
    else { ox = stage.widthPx; oy = Math.random() * stage.heightPx; }
    const cfg = naia.ai.naia;
    tx = pcx + (Math.random() * 2 - 1) * cfg.aimSpreadX; // 플레이어 중심 ± 가로 산포
    ty = pcy + (Math.random() * 2 - 1) * cfg.aimSpreadY; // ± 세로 산포
  }
  const angle = Math.atan2(ty - oy, tx - ox);
  naiaLasers.push({
    ox, oy, angle,
    ex: ox + Math.cos(angle) * NAIA_LASER_LEN,
    ey: oy + Math.sin(angle) * NAIA_LASER_LEN,
    state: "telegraph", t: 0, shooter: naia,
    hitPlayer: false, hitBosses: [], alive: true,
  });
}

// 레이저 진행: telegraph(예고, 무피해) → firing(띠 ON). 패링 불가(회피 전용)라 패링 훅은
// 없다. firing 동안 점-선분 거리 판정으로 플레이어는 1회 피해, 이프리트는 피해·가비아는
// 회복(대상별 1회). 슈터가 사라져도(이론상) 진행 중 레이저는 끝까지 처리한다.
function updateNaiaLasers(dt) {
  const half = (laser) => laser.shooter.ai.naia.laserThick / 2;
  for (const L of naiaLasers) {
    if (!L.alive) continue;
    const cfg = L.shooter.ai.naia;
    L.t += dt;
    if (L.state === "telegraph") {
      if (L.t >= cfg.laserTelegraph) { L.state = "firing"; L.t = 0; }
      continue;
    }
    // firing: 두께 laserThick 띠가 ON. 점-선분 거리 ≤ 절반이면 명중.
    const r = half(L);
    if (!player.dead && !L.hitPlayer) {
      const ph = getHurtbox(player);
      const d = pointSegDist(ph.x + ph.w / 2, ph.y + ph.h / 2, L.ox, L.oy, L.ex, L.ey);
      if (d <= r) { damagePlayer(cfg.laserDamage); L.hitPlayer = true; } // 패링 불가
    }
    // 보스 명중: 이프리트 피해 / 가비아 회복(수치 = 플레이어 피해와 동일). 대상별 1회.
    for (const e of enemies) {
      if (!e.alive || (e.role !== "ifrit" && e.role !== "gabia")) continue;
      if (L.hitBosses.includes(e)) continue;
      const eh = getHurtbox(e);
      const d = pointSegDist(eh.x + eh.w / 2, eh.y + eh.h / 2, L.ox, L.oy, L.ex, L.ey);
      if (d <= r) {
        if (e.role === "ifrit") hitEnemy(e, cfg.bossHit); // 이프리트엔 피해
        else e.hp = Math.min(e.maxHp, e.hp + cfg.bossHit); // 가비아는 회복(상한 클램프)
        L.hitBosses.push(e);
      }
    }
    if (L.t >= cfg.laserActive) L.alive = false;
  }
  naiaLasers = naiaLasers.filter((L) => L.alive);
}

// 파도 시전: 맵 가로×waveWidthMult 폭의 세로 띠를 맵 왼쪽 밖에 둔다. 주의표시(warn)
// waveWarnTime초 → active(왼→오 진행). active에 들어가야 실제 띠가 등장·이동한다.
function spawnNaiaWave(naia) {
  const cfg = naia.ai.naia;
  const w = stage.widthPx * cfg.waveWidthMult;
  naiaWave = {
    shooter: naia,
    phase: "warn", t: 0,
    warnTime: cfg.waveWarnTime,
    speed: MOVE_SPEED * cfg.waveSpeedMult, // 플레이어 이동속도의 배수
    w,
    x: -w, // 오른쪽 끝이 맵 왼쪽(0)에 닿은 위치에서 시작(active 진입 시 왼쪽에서 등장)
    damage: cfg.waveDamage,
    tickInterval: cfg.waveTickInterval,
    tickTimer: 0, // 0이면 다음 접촉 즉시 1히트(이후 tickInterval마다)
  };
}

// 파도 진행. warn 동안은 카메라 왼쪽 주의표시만(렌더는 render.js), 위치는 고정. active에서
// 왼→오로 이동하며, 플레이어가 파도 가로 범위 안 + 최상층(floor 0)이 아니면 tickInterval초당
// waveDamage. 파도가 맵에서 완전히 사라지면(왼쪽 끝이 오른쪽 끝을 지남) 종료 + 쿨 리셋.
function updateNaiaWave(dt) {
  if (!naiaWave) return;
  const W = naiaWave;
  if (W.shooter.sealed) { naiaWave = null; return; } // 봉인되면 진행 중 파도도 중지
  W.t += dt;
  if (W.phase === "warn") {
    if (W.t >= W.warnTime) { W.phase = "active"; W.t = 0; }
    return;
  }
  W.x += W.speed * dt;
  const pf = getHurtbox(player);
  const pcx = pf.x + pf.w / 2;
  const inWave = pcx >= W.x && pcx <= W.x + W.w;
  const onTop = floorOf(player.y + player.h) === 0; // 최상층 발판 위에서만 회피
  if (!player.dead && inWave && !onTop) {
    W.tickTimer -= dt;
    if (W.tickTimer <= 0) { damagePlayer(W.damage); W.tickTimer = W.tickInterval; }
  } else {
    W.tickTimer = 0; // 파도 밖/최상층이면 리셋 — 재진입 시 즉시 한 대
  }
  if (W.x > stage.widthPx) { // 왼쪽 끝이 맵 오른쪽 끝을 지남 = 완전 소멸
    W.shooter.naiaCd = W.shooter.ai.naia.laserCd; // 이제야 쿨 시작
    naiaWave = null;
  }
}

// ---- 실라(포물선 화살 / 반사 봉인 / 바닥 착탄 잡몹) ----
// 실라는 왼쪽 위 모서리에 떠 있는(floating) 정지형 저격수다. 나이아처럼 매 프레임
// enemies에서 실라를 찾아 쿨을 굴려 화살을 쏜다. sealed면 발사 중지.
function updateSila(dt) {
  const sila = enemies.find((e) => e.alive && e.role === "sila");
  if (!sila) return;
  if (sila.sealed) return; // 봉인: 화살 발사 중지(반사 4회 누적으로 봉인됨)
  const cfg = sila.ai.sila;
  if (sila.silaCd == null) sila.silaCd = randRange(cfg.arrowCdMin, cfg.arrowCdMax); // 첫 발사까지 랜덤 대기
  sila.silaCd -= dt;
  if (sila.silaCd <= 0) {
    fireSilaArrow(sila);
    sila.silaCd = randRange(cfg.arrowCdMin, cfg.arrowCdMax);
  }
}

// 화살 한 발: 맵 상단 밖(x 랜덤·y<0)에서 발사각 +y축(아래) 0°±arrowSpreadDeg° 랜덤으로
// 쏜다. 초기 속도는 arrowSpeed, 이후 매 프레임 arrowGravity로 vy가 늘어 포물선이 된다.
function fireSilaArrow(sila) {
  const cfg = sila.ai.sila;
  const ox = Math.random() * stage.widthPx; // 맵 가로 어디서나
  const oy = -ARROW_H; // 맵 상단 밖(y<0)
  const spread = (cfg.arrowSpreadDeg * Math.PI) / 180;
  const theta = (Math.random() * 2 - 1) * spread; // 아래(0°) 기준 ±spread
  const vx = Math.sin(theta) * cfg.arrowSpeed; // 좌우 성분
  const vy = Math.cos(theta) * cfg.arrowSpeed; // 아래(+y) 성분(항상 양수 → 아래로 시작)
  const p = makeProjectile(ox, oy, vx, vy, {
    w: ARROW_W, h: ARROW_H, kind: "arrow", damage: cfg.arrowDamage, parryable: true,
  });
  p.state = "incoming"; // incoming(낙하) → (패링)reflected(모서리 호밍)
  p.cfg = cfg; // 착탄 잡몹/반사 수치 참조용
  p.gravity = cfg.arrowGravity;
  p.reflectSpeed = cfg.arrowSpeed * cfg.reflectSpeedMult;
  p.prevCy = projCenterY(p); // 층 표면 통과 판정용(직전 프레임 중심 y)
  projectiles.push(p);
}

// 화살 패링: 반사 상태로 전환(속도 2배·무피해). 반사 방향(모서리 보스 호밍)은 매 프레임
// updateArrow가 잡으므로 여기선 상태만 바꾼다.
function parrySilaArrow(p) {
  parryFlash = 0.15;
  TimeControl.freeze(PARRY_HIT_STOP);
  p.parryLock = PROJ_PARRY_LOCK;
  p.state = "reflected";
  p.parryable = false;
  p.damage = 0; // 반사 중엔 플레이어를 때리지 않는다
}

// 반사 화살이 노릴 모서리 보스 = 살아있는 저격수: 나이아 생존(!sealed) 시 나이아,
// 나이아 봉인 후엔 실라. 둘 다 floating으로 화면 밖 모서리에 있다.
function silaReflectTarget() {
  const naia = enemies.find((e) => e.alive && e.role === "naia");
  if (naia && !naia.sealed) return naia;
  return enemies.find((e) => e.alive && e.role === "sila");
}

function updateArrow(p, dt) {
  if (p.parryLock > 0) p.parryLock -= dt;
  if (p.state === "incoming") {
    // 예고 없이 떨어지지만 패링 가능: 플레이어 공격 히트박스와 겹치면 반사 성사.
    if (p.parryable && p.parryLock <= 0) {
      const atkHb = getAttackHitbox();
      if (atkHb && aabbOverlap(atkHb, p)) { parrySilaArrow(p); return; }
    }
    p.vy += p.gravity * dt; // 화살 전용 중력 → 포물선(전역 GRAVITY와 분리)
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.angle = Math.atan2(p.vy, p.vx);
    if (!player.dead && aabbOverlap(p, getHurtbox(player))) {
      damagePlayer(p.damage);
      p.alive = false;
      return;
    }
    // 바닥(층 표면) 착탄: 직전~현재 중심 y 사이를 지난 각 층 표면마다 mobFloorChance로
    // 잡몹 생성(맞으면 화살 소멸). cy는 vy>0이라 단조 증가 → 각 표면을 한 번만 지난다.
    const cy = projCenterY(p);
    for (const fy of stage.floorSurfaces) {
      if (p.prevCy < fy && fy <= cy && Math.random() < p.cfg.mobFloorChance) {
        spawnSilaMob(projCenterX(p), fy, p.cfg);
        p.alive = false;
        return;
      }
    }
    p.prevCy = cy;
    if (projOutOfBounds(p)) p.alive = false;
  } else { // reflected: 모서리 보스로 호밍(무피해). 도달 시 그 보스 sealHits++ → 봉인.
    const target = silaReflectTarget();
    if (!target) { // 이론상 없을 때: 그냥 직진하다 소멸
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (projOutOfBounds(p)) p.alive = false;
      return;
    }
    const v = aimVel(projCenterX(p), projCenterY(p), projCenterX(target), projCenterY(target), p.reflectSpeed);
    p.vx = v.vx;
    p.vy = v.vy;
    p.angle = Math.atan2(v.vy, v.vx);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (aabbOverlap(p, getHurtbox(target))) {
      target.sealHits = (target.sealHits || 0) + 1;
      if (target.sealHits >= p.cfg.sealHits) target.sealed = true; // 봉인(나이아 4 / 실라 4)
      TimeControl.freeze(ATTACK_HIT_STOP);
      parryFlash = 0.1;
      p.alive = false;
    }
  }
}

// 화살 착탄 잡몹: 표면(footY) 위에 세운다(role "silaMob", HP mobHp). 평타 한 대에 죽고
// (combat.js hitEnemy), 플레이어가 가로로 근접하면 폭발한다(updateSilaMobs). 폭발 수치는
// 잡몹에 저장해 둔다(생성원 cfg와 분리 — 잡몹만으로 자기완결).
function spawnSilaMob(cx, surfaceY, cfg) {
  const mob = makeEnemy(cx, surfaceY, "silaMob", cfg.mobHp);
  mob.silaMob = true;
  mob.mobNearX = cfg.mobNearX;
  mob.mobExplodeSize = cfg.mobExplodeSize;
  mob.mobExplodeDamage = cfg.mobExplodeDamage;
  enemies.push(mob); // 다음 프레임 updateEnemies가 반영(루프 중 추가라 이번 프레임은 건너뜀)
}

// 잡몹 근접 폭발: 플레이어와 가로 mobNearX px 이내면 자기중심 mobExplodeSize 정사각형으로
// 폭발(패링 불가)한 뒤 소멸한다. 폭발 박스는 가비아와 같은 generic blast(gabiaBlasts)로
// 넣어 판정/렌더를 재활용한다. 플레이어가 먼저 때려 죽인 잡몹(!alive)은 폭발하지 않는다.
function updateSilaMobs(dt) {
  for (const m of enemies) {
    if (!m.alive || m.role !== "silaMob") continue;
    const pcx = player.x + player.w / 2;
    const mcx = m.x + m.w / 2;
    if (Math.abs(pcx - mcx) <= m.mobNearX) {
      const cy = m.y + m.h / 2;
      const s = m.mobExplodeSize;
      gabiaBlasts.push({ x: mcx - s / 2, y: cy - s / 2, w: s, h: s, t: 0, damage: m.mobExplodeDamage, hitPlayer: false, alive: true });
      m.alive = false;
    }
  }
}

// ---- 셰이디 낙하 무기(shadyWeapons) ----
// 차원문 난사 6회 완주 시 enemy.js updateShadyBarrage가 spawn한다. 맵 최상단에서
// 중력(GRAVITY)으로 떨어지는 거대 무기 — 가로 플레이어×weaponWScale·세로 ×weaponHScale.
// dmg weaponDamage(2), 패링 불가(회피 전용). 발동 시점 플레이어 x를 노리고 떨어지므로
// 가로로 비켜야 한다. 화면(맵) 아래로 완전히 지나가면 소멸한다.
function spawnShadyWeapon(shooter, cx) {
  const cfg = shooter.ai.shady;
  const w = PLAYER_W * cfg.weaponWScale; // 225
  const h = PLAYER_H * cfg.weaponHScale; // 420
  shadyWeapons.push({
    x: cx - w / 2,
    y: -h, // 맵 최상단 위(전부 화면 밖)에서 낙하 시작
    w, h, vy: 0,
    damage: cfg.weaponDamage,
    hitPlayer: false, // 접촉 1회 피해(빠졌다 다시 들어와도 재적용 안 함 — 한 번만)
    alive: true,
  });
}

function updateShadyWeapons(dt) {
  for (const wpn of shadyWeapons) {
    if (!wpn.alive) continue;
    wpn.vy += GRAVITY * dt; // 낙하 가속도 = 중력
    wpn.y += wpn.vy * dt;
    // 접촉 1회 피해(패링 불가 — getAttackHitbox 검사 없음).
    if (!wpn.hitPlayer && !player.dead && aabbOverlap(wpn, getHurtbox(player))) {
      damagePlayer(wpn.damage);
      wpn.hitPlayer = true;
    }
    if (wpn.y > stage.heightPx) wpn.alive = false; // 맵 아래로 완전히 지나감 → 소멸
  }
  shadyWeapons = shadyWeapons.filter((w) => w.alive);
}

// 거대 무기: 어두운 강철 칼날(가로로 넓고 세로로 긴 직사각형) + 위험 테두리. 패링
// 불가라 막힘 색(주황) 윤곽으로 "막지 말고 피하라"를 알린다.
function renderShadyWeapons() {
  for (const wpn of shadyWeapons) {
    if (!wpn.alive) continue;
    const x = wpn.x - camera.x;
    const y = wpn.y - camera.y;
    ctx.fillStyle = "#2a2f3a"; // 칼날 본체(어두운 강철)
    ctx.fillRect(x, y, wpn.w, wpn.h);
    ctx.fillStyle = "rgba(200, 210, 225, 0.5)"; // 가운데 능선 하이라이트
    ctx.fillRect(x + wpn.w / 2 - 6, y, 12, wpn.h);
    ctx.strokeStyle = "rgba(255, 140, 0, 0.9)"; // 패링 불가 경고 윤곽
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, wpn.w, wpn.h);
  }
}

// main.js update()에서 호출. dt는 시간배율이 적용된 scaledDt.
function updateProjectiles(dt) {
  updateShadyWeapons(dt);
  updateRangedEnemies(dt);
  processPendingDaggers(dt);
  updateLineShooters(dt);
  updateLines(dt);
  updateDayaPatterns(dt);
  processDayaRain(dt);
  updateDayaSpikes(dt);
  updateFirePillars(dt);
  updateGabiaShared(dt); // 가비아 공유 방어막/무적/폭발 주기(이프리트도 함께 보호)
  updateGabiaBlasts(dt);
  updateNaia(dt); // 나이아 레이저/파도 발사 결정(쿨·파도 차례)
  processNaiaLaserQueue(dt); // 레이저 볼리 시차 발사(마지막 발=플레이어 조준)
  updateNaiaLasers(dt); // 진행 중 레이저(예고→발사·점선분 판정·보스 피해/회복)
  updateNaiaWave(dt); // 진행 중 파도(주의표시→진행·다단히트·쿨 리셋)
  updateSila(dt); // 실라 화살 발사 결정(쿨)
  updateSilaMobs(dt); // 화살 착탄 잡몹 근접 폭발
  updateDroneSpawner(dt); // 스테이지5 드론 출몰(4초마다 우변, 본체 생존 시) — drones.js
  for (const p of projectiles) {
    if (!p.alive) continue;
    if (p.kind === "big") updateBigDagger(p, dt);
    else if (p.kind === "dayaShot") updateDayaShot(p, dt);
    else if (p.kind === "rainDrop") updateRainDrop(p, dt);
    else if (p.kind === "stone") updateStone(p, dt);
    else if (p.kind === "arrow") updateArrow(p, dt);
    else if (p.kind === "droneBullet") updateDroneBullet(p, dt); // 스테이지5 드론 탄 — drones.js
    else updateSimpleProjectile(p, dt);
  }
  projectiles = projectiles.filter((p) => p.alive);
}

// ---- 렌더 ---- main.js render()의 월드 파트에서 호출(줌/흔들림 변환 안).
function renderProjectiles() {
  for (const p of projectiles) {
    if (!p.alive) continue;
    if (p.kind === "rainDrop") { renderRainDrop(p); continue; } // 비는 세로 물방울로
    if (p.kind === "stone") { renderStone(p); continue; } // 가비아 돌
    if (p.kind === "arrow") { renderArrow(p); continue; } // 실라 화살
    let color = "#c2ccd6"; // 강철빛(작은 단검 / 큰 단검 비행)
    if (p.kind === "big") {
      if (p.state === "stopped") color = "#ff7b00"; // 멈춤: 주황 경고(곧 폭발)
      else if (p.state === "returning") color = "#ffd166"; // 다야로: 금빛
    } else if (p.kind === "dayaShot") {
      color = p.state === "reflected" ? "#ffe066" : "#c77bff"; // 반사=금빛, 조준=다야 보라
    } else if (p.kind === "droneBullet") {
      color = p.state === "reflected" ? "#ffe066" : "#ff6b6b"; // 반사=금빛, 조준=드론 적색
    }
    ctx.save();
    ctx.translate(projCenterX(p) - camera.x, projCenterY(p) - camera.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = color;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); // 칼날(진행 방향이 +x)
    const tip = Math.max(3, p.w * 0.18);
    ctx.fillStyle = "#eef3f7"; // 앞끝 밝게(날끝)
    ctx.fillRect(p.w / 2 - tip, -p.h / 2, tip, p.h);
    ctx.restore();
  }
  renderLines(); // 키디언 직선 공격(예고/발사) — 단검 위에 그린다
  renderDayaSpikes(); // 다야 P2 가시(예고/솟음)
  renderFirePillars(); // 이프리트 불기둥(예고/즉발)
  renderGabiaBlasts(); // 가비아 공유 방어막 폭발(자기중심)
  renderNaiaLasers(); // 나이아 물줄기 레이저(예고 가는 선 / 발사 두꺼운 띠)
  renderNaiaWave(); // 나이아 파도(진행 중인 세로 물벽)
  renderShadyWeapons(); // 셰이디 차원문 난사 완주 시 낙하하는 거대 무기
}

// 나이아 레이저: telegraph는 가는 예고선(곧 어디로 올지) + 옅은 띠, firing은 두꺼운
// 청록 물줄기. 선분 시작점(ox,oy)에서 angle로 회전한 직사각형으로 그린다(월드 좌표).
function renderNaiaLasers() {
  for (const L of naiaLasers) {
    if (!L.alive) continue;
    const thick = L.shooter.ai.naia.laserThick;
    ctx.save();
    ctx.translate(L.ox - camera.x, L.oy - camera.y);
    ctx.rotate(L.angle);
    if (L.state === "telegraph") {
      const cfg = L.shooter.ai.naia;
      const prog = Math.min(1, L.t / cfg.laserTelegraph); // 0→1 (다가올수록 진하게)
      ctx.fillStyle = `rgba(90, 200, 255, ${0.08 + 0.16 * prog})`; // 솟을 띠 옅은 윤곽
      ctx.fillRect(0, -thick / 2, NAIA_LASER_LEN, thick);
      ctx.fillStyle = `rgba(180, 240, 255, ${0.5 + 0.4 * prog})`; // 가는 예고 심지
      ctx.fillRect(0, -2, NAIA_LASER_LEN, 4);
    } else { // firing: 두꺼운 물줄기(바깥 청록 + 안쪽 밝은 코어)
      ctx.fillStyle = "rgba(40, 170, 235, 0.85)";
      ctx.fillRect(0, -thick / 2, NAIA_LASER_LEN, thick);
      ctx.fillStyle = "rgba(225, 250, 255, 0.95)";
      ctx.fillRect(0, -thick / 4, NAIA_LASER_LEN, thick / 2);
    }
    ctx.restore();
  }
}

// 나이아 파도: active 동안 맵 세로 전체를 덮는 청록 물벽(왼→오 진행). 앞면(오른쪽 끝)을
// 밝게 강조해 진행 방향을 보여 준다. warn 단계의 카메라 왼쪽 주의표시는 render.js(화면 고정).
function renderNaiaWave() {
  if (!naiaWave || naiaWave.phase !== "active") return;
  const W = naiaWave;
  const x = W.x - camera.x;
  const y = 0 - camera.y;
  ctx.fillStyle = "rgba(40, 150, 220, 0.35)";
  ctx.fillRect(x, y, W.w, stage.heightPx);
  ctx.fillStyle = "rgba(200, 245, 255, 0.7)"; // 선두(오른쪽 끝) 밝은 마루
  ctx.fillRect(x + W.w - 10, y, 10, stage.heightPx);
}

// 나이아 파도 주의표시(화면 고정 UI). render()의 restore 뒤(줌/카메라 밖)에서 호출한다.
// warn 단계에 카메라 왼쪽에서 "← 파도!"를 점멸로 알린다.
function renderNaiaWaveWarning() {
  if (!naiaWave || naiaWave.phase !== "warn") return;
  const blink = 0.5 + 0.5 * Math.abs(Math.sin(naiaWave.t * 8));
  ctx.save();
  ctx.fillStyle = `rgba(40, 150, 220, ${0.25 * blink})`; // 왼쪽 가장자리 띠
  ctx.fillRect(0, 0, 80, canvas.height);
  ctx.fillStyle = `rgba(120, 220, 255, ${blink})`;
  ctx.font = "bold 28px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("← 파도!", 16, canvas.height / 2);
  ctx.restore();
}

// 실라 화살: 진행 방향(angle)으로 회전한 길쭉한 화살(촉+깃). 반사(reflected) 상태면
// 금빛으로 — 모서리 보스로 호밍 중이라는 신호.
function renderArrow(p) {
  const x = projCenterX(p) - camera.x;
  const y = projCenterY(p) - camera.y;
  const reflected = p.state === "reflected";
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(p.angle);
  ctx.fillStyle = reflected ? "#ffd166" : "#b9c4cf"; // 반사=금빛, 일반=강철빛 샤프트
  ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); // 샤프트(진행 방향이 +x)
  ctx.fillStyle = reflected ? "#fff1c1" : "#eef3f7"; // 촉(앞끝) 밝게
  const tip = Math.max(4, p.w * 0.25);
  ctx.beginPath();
  ctx.moveTo(p.w / 2, -p.h);
  ctx.lineTo(p.w / 2 + tip, 0);
  ctx.lineTo(p.w / 2, p.h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = reflected ? "#e0a93f" : "#7d8893"; // 깃(뒤끝)
  ctx.fillRect(-p.w / 2, -p.h, Math.max(3, p.w * 0.18), p.h * 2);
  ctx.restore();
}

// 가비아 돌: 진행 방향으로 회전한 돌덩이(반사 상태면 금빛). 아래쪽에 그림자 톤.
function renderStone(p) {
  const x = projCenterX(p) - camera.x;
  const y = projCenterY(p) - camera.y;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(p.angle);
  ctx.fillStyle = p.state === "reflected" ? "#ffd166" : "#9b8266"; // 반사=금빛, 일반=돌빛
  ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)"; // 아래 그늘
  ctx.fillRect(-p.w / 2, p.h / 2 - 4, p.w, 4);
  ctx.fillStyle = "rgba(255, 255, 255, 0.2)"; // 위 하이라이트
  ctx.fillRect(-p.w / 2, -p.h / 2, p.w, 3);
  ctx.restore();
}

// 가비아 공유 방어막 폭발: 자기중심에서 퍼지는 주황 링 + 옅은 채움(짧게 페이드아웃).
function renderGabiaBlasts() {
  for (const b of gabiaBlasts) {
    if (!b.alive) continue;
    const prog = Math.min(1, b.t / GABIA_BLAST_TIME);
    const cx = b.x + b.w / 2 - camera.x;
    const cy = b.y + b.h / 2 - camera.y;
    const w = b.w * (0.5 + 0.5 * prog); // 0.5배→1배로 퍼짐
    const h = b.h * (0.5 + 0.5 * prog);
    ctx.fillStyle = `rgba(255, 120, 30, ${0.35 * (1 - prog)})`;
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.strokeStyle = `rgba(255, 160, 50, ${1 - prog})`;
    ctx.lineWidth = 4;
    ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
  }
}

// 이프리트 불기둥: telegraph는 표면에 주황 경고 띠 + 솟을 높이를 알리는 옅은 기둥 윤곽
// (점멸), active는 표면에서 솟은 불기둥(주황→노랑 그라데이션 느낌의 두 겹).
function renderFirePillars() {
  for (const p of firePillars) {
    if (!p.alive) continue;
    const cx = p.x - camera.x;
    const sy = p.surfaceY - camera.y;
    const half = FIRE_PILLAR_W / 2;
    if (p.state === "telegraph") {
      const cfg = p.shooter.ai.ifrit;
      const prog = Math.min(1, p.t / cfg.pillarTelegraph); // 0→1 (다가올수록 진하게)
      const blink = 0.35 + 0.4 * Math.abs(Math.sin(p.t * 10));
      ctx.fillStyle = `rgba(255, 140, 0, ${blink})`;
      ctx.fillRect(cx - half, sy - 4, FIRE_PILLAR_W, 4); // 표면 경고 띠
      ctx.fillStyle = `rgba(255, 120, 0, ${0.12 + 0.18 * prog})`; // 솟을 영역 옅은 윤곽
      ctx.fillRect(cx - half, sy - FIRE_PILLAR_H, FIRE_PILLAR_W, FIRE_PILLAR_H);
    } else { // active: 즉발 불기둥
      ctx.fillStyle = "#ff6a00"; // 바깥 불꽃(주황)
      ctx.fillRect(cx - half, sy - FIRE_PILLAR_H, FIRE_PILLAR_W, FIRE_PILLAR_H);
      ctx.fillStyle = "#ffd23f"; // 안쪽 심지(노랑)
      ctx.fillRect(cx - half * 0.5, sy - FIRE_PILLAR_H, FIRE_PILLAR_W * 0.5, FIRE_PILLAR_H);
    }
  }
}

// 다야 P3 낙하 투사체: 회전 없이 세로로 길쭉한 하늘빛 물방울(꼬리 밝게).
function renderRainDrop(p) {
  const x = projCenterX(p) - camera.x;
  const y = projCenterY(p) - camera.y;
  ctx.fillStyle = "#7fd4ff";
  ctx.fillRect(x - p.w / 2, y - p.h / 2, p.w, p.h);
  ctx.fillStyle = "#eaf7ff"; // 아래 끝(낙하 선두) 밝게
  ctx.fillRect(x - p.w / 2, y + p.h / 2 - Math.max(3, p.h * 0.25), p.w, Math.max(3, p.h * 0.25));
}

// 다야 P2 가시: telegraph는 바닥 표면에 붉은 경고 띠(점멸), active는 솟아오르는 톱니.
function renderDayaSpikes() {
  for (const s of dayaSpikes) {
    if (!s.alive) continue;
    const cx = s.x - camera.x;
    const sy = s.surfaceY - camera.y;
    if (s.state === "telegraph") {
      const pat = s.shooter.ai.patterns;
      const blink = 0.4 + 0.4 * Math.abs(Math.sin(s.t * 8)); // 다가올수록 빠른 점멸 느낌
      ctx.fillStyle = `rgba(200, 60, 80, ${blink})`;
      ctx.fillRect(cx - SPIKE_W / 2, sy - 4, SPIKE_W, 4); // 표면에 붉은 경고 띠
      // 솟을 폭/방향을 미리 알려주는 옅은 삼각 윤곽
      ctx.fillStyle = `rgba(200, 60, 80, ${0.18 * blink})`;
      drawSpikeTeeth(cx, sy, SPIKE_H * 0.5);
    } else { // active: 실제로 솟은 높이만큼 톱니를 그린다
      const b = spikeBox(s);
      ctx.fillStyle = "#d94a64";
      drawSpikeTeeth(cx, sy, b.h);
      ctx.fillStyle = "#ffd0d8"; // 날끝 하이라이트
      drawSpikeTeeth(cx, sy - Math.min(6, b.h * 0.3), b.h * 0.4);
    }
  }
}

// 표면(centerX, surfaceY)에서 height만큼 솟은 톱니 3개를 그린다(아래가 표면).
function drawSpikeTeeth(centerX, surfaceY, height) {
  const teeth = 3;
  const tw = SPIKE_W / teeth;
  for (let i = 0; i < teeth; i++) {
    const lx = centerX - SPIKE_W / 2 + i * tw;
    ctx.beginPath();
    ctx.moveTo(lx, surfaceY);
    ctx.lineTo(lx + tw / 2, surfaceY - height);
    ctx.lineTo(lx + tw, surfaceY);
    ctx.closePath();
    ctx.fill();
  }
}

// 키디언 라인: 예고(telegraph)는 가는 심지 + 페이드인 글로우(보라), 발사(firing)는
// 두껍게 밝은 자홍으로 번쩍. 좌표는 월드(camera 적용) — renderProjectiles 안에서 호출.
function renderLines() {
  for (const L of lines) {
    if (!L.alive) continue;
    const b = lineBand(L);
    const bx = b.x - camera.x;
    const by = b.y - camera.y;
    // 광폭화(비비 포식) 라인은 패링 불가라 빨강으로 — "막지 말고 피해라" 신호.
    const enraged = L.shooter.lineEnraged;
    const glow = enraged ? "255, 70, 70" : "199, 125, 255";
    const core = enraged ? "255, 200, 190" : "236, 214, 255";
    if (L.state === "telegraph") {
      const ls = L.shooter.ai.lineShooter;
      const p = easeOutCubic(Math.min(1, L.t / ls.telegraph)); // 0→1 페이드인
      // 넓은 글로우(점점 진해짐) + 항상 보이는 가는 심지(곧 어디로 올지 알려준다).
      ctx.fillStyle = `rgba(${glow}, ${0.1 + 0.45 * p})`;
      ctx.fillRect(bx, by, b.w, b.h);
      ctx.fillStyle = `rgba(${core}, ${0.4 + 0.5 * p})`;
      if (L.axis === "h") {
        const cy = L.pos - camera.y;
        ctx.fillRect(bx, cy - LINE_TELE_W / 2, b.w, LINE_TELE_W);
      } else {
        const cx = L.pos - camera.x;
        ctx.fillRect(cx - LINE_TELE_W / 2, by, LINE_TELE_W, b.h);
      }
    } else { // firing: 두껍게 밝은 번쩍
      ctx.fillStyle = `rgba(${enraged ? "255, 60, 60" : "214, 110, 255"}, 0.85)`;
      ctx.fillRect(bx, by, b.w, b.h);
      ctx.fillStyle = enraged ? "rgba(255, 240, 235, 0.95)" : "rgba(255, 250, 255, 0.95)"; // 중심 코어 밝게
      if (L.axis === "h") {
        const cy = L.pos - camera.y;
        ctx.fillRect(bx, cy - LINE_THICK / 4, b.w, LINE_THICK / 2);
      } else {
        const cx = L.pos - camera.x;
        ctx.fillRect(cx - LINE_THICK / 4, by, LINE_THICK / 2, b.h);
      }
    }
  }
}
