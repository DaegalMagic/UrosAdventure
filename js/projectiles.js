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

// ---- 상태 ----
let projectiles = []; // 살아있는 투사체
let pendingDaggers = []; // 시차 발사 대기열: { delay, shooter }
let lines = []; // 키디언 직선 공격: { axis, pos, state, t, shooter, hitPlayer, alive }

// startStage에서 호출(스테이지 새로 구성 시 잔재 제거).
function resetProjectiles() {
  projectiles = [];
  pendingDaggers = [];
  lines = [];
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

// main.js update()에서 호출. dt는 시간배율이 적용된 scaledDt.
function updateProjectiles(dt) {
  updateRangedEnemies(dt);
  processPendingDaggers(dt);
  updateLineShooters(dt);
  updateLines(dt);
  for (const p of projectiles) {
    if (!p.alive) continue;
    if (p.kind === "big") updateBigDagger(p, dt);
    else updateSimpleProjectile(p, dt);
  }
  projectiles = projectiles.filter((p) => p.alive);
}

// ---- 렌더 ---- main.js render()의 월드 파트에서 호출(줌/흔들림 변환 안).
function renderProjectiles() {
  for (const p of projectiles) {
    if (!p.alive) continue;
    let color = "#c2ccd6"; // 강철빛(작은 단검 / 큰 단검 비행)
    if (p.kind === "big") {
      if (p.state === "stopped") color = "#ff7b00"; // 멈춤: 주황 경고(곧 폭발)
      else if (p.state === "returning") color = "#ffd166"; // 다야로: 금빛
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
