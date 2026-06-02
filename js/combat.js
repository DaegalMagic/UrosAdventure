// 우로스의 모험 — 전투(피격 판정 · 포식 · 단검→다야 · 패링 · 그로기 · 힘겨루기 · 플레이어 피해)
// (main.js에서 분리. 빌드/모듈 시스템이 없어 전역 스코프를 공유하므로 분리는
//  코드 이동 + index.html <script> 추가가 전부다. 전부 함수 선언이라 본문은 호출 시점에 평가 → main.js의 상수/상태를 call-time에 참조. 단검 상수만 동봉.)

// 활성 공격 히트박스와 살아있는 적의 AABB가 겹치면 피격 처리한다.
// 한 번의 공격(attackHits)에서 같은 적은 한 번만 맞는다 — 히트박스가 여러 프레임
// 떠 있어도 중복 타격하지 않게.
function resolveAttackHits() {
  const hb = getAttackHitbox();
  if (!hb) return;
  // 현재 플레이어 공격의 데미지/포식 여부(스펙에서 읽는다). 평타는 기본 데미지·비포식,
  // 포식(S)은 damage 0.01·devour 플래그.
  const spec = player.attack;
  const amount = spec && spec.damage != null ? spec.damage : PLAYER_ATTACK_DAMAGE;
  const isDevour = !!(spec && spec.devour);
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    if (player.attackHits.has(enemy)) continue;
    if (aabbOverlap(hb, getHurtbox(enemy))) {
      player.attackHits.add(enemy);
      hitEnemy(enemy, amount, isDevour);
    }
  }
  // 진입점 B: 떨군 단검(공격판정 없는 hittable)을 공격으로 맞히면 효과 발동 후 소멸.
  // 같은 스윙당 한 번만(attackHits로 소비). 단검은 그 자체 박스가 곧 피격 AABB다.
  for (const obj of hittables) {
    if (!obj.alive) continue;
    if (player.attackHits.has(obj)) continue;
    if (aabbOverlap(hb, obj)) {
      player.attackHits.add(obj);
      obj.alive = false; // 단검은 한 번 때리면 소멸
      redirectDaggerToDaya();
    }
  }
}

// 적이 한 대 맞았을 때. HP를 깎고 0 이하면 처치한다.
//   - 무적(invincible) 상태면 피해를 무시한다(무적 폭주 티그 등).
//   - 방어막(shieldCharges)이 있으면 흡수한다(HP 무피해).
//   - isDevour(포식 공격, S키)가 그로기 적을 때리면 HP와 무관하게 즉시 포식한다
//     (devourEnemy → 연동). 평타/일반 공격은 더 이상 포식을 일으키지 않고 그냥 죽인다.
// amount: 입힐 기본 데미지(기본 = 플레이어 평타). 그로기 중이면 GROGGY_DAMAGE_MULT
// 배수가 적용된다(패링 루프 보상). 데미지/HP는 소수점도 허용한다.
// 방어력 배수(1 - defense)도 곱한다: defense=1이면 무피해, 음수면 증폭. defense를
// 1로 클램프해 배수가 음수(=피해가 회복으로 뒤집힘)가 되는 일을 막는다.
function hitEnemy(enemy, amount = PLAYER_ATTACK_DAMAGE, isDevour = false) {
  if (enemy.invincible) return; // 무적: 피해 무시(타격감 연출도 생략)
  // 방어막(#5): 충전이 남아 있으면 이번 공격을 흡수한다(HP 무피해). blocks회를 다
  // 까야 본체에 피해가 들어간다. 흡수에도 타격감(히트스톱) + 막힘 플래시는 준다.
  if (enemy.shieldCharges > 0) {
    enemy.shieldCharges -= 1;
    TimeControl.freeze(ATTACK_HIT_STOP);
    parryFlash = 0.1;
    return;
  }
  const groggy = enemy.permaGroggy || enemy.groggyTime > 0;
  // 포식(S 공격): 그로기 상태의 적을 HP와 무관하게 즉시 포식(finisher). 연동(devour-
  // ripple)은 devourEnemy가 group을 보고 처리한다. 그로기가 아니면 아래 일반 피해로.
  if (isDevour && groggy) {
    devourEnemy(enemy);
    TimeControl.freeze(ATTACK_HIT_STOP);
    return;
  }
  const defMult = 1 - Math.min(enemy.defense, 1);
  const dmg = amount * (groggy ? GROGGY_DAMAGE_MULT : 1) * defMult;
  enemy.hp -= dmg;
  TimeControl.freeze(ATTACK_HIT_STOP); // 적중 타격감(시간 정지)
  // 평타/일반 공격으로 HP가 0이 되면 그냥 사망한다(포식은 위 전용 입력으로만 일어난다).
  if (enemy.hp <= 0) enemy.alive = false;
}

// 방어막 시스템(#5, 데이터 주도 ai.shield{cooldown,blocks}). 쿨마다 공격 blocks회를
// 막는 막을 친다. 막은 '시간'으로 안 사라지고 흡수로만 깨진다(hitEnemy). 지속 중엔
// 원거리 쿨이 절반(projectiles.js가 shieldCharges를 본다). 쿨이 끝나도 막이 남아
// 있으면 시전을 미루고(대기), 막이 깨지면 다음 프레임에 즉시 다시 친다.
// main.js update()에서 매 프레임 호출. 그로기/사망 중엔 시전을 보류한다.
function updateShields(dt) {
  for (const e of enemies) {
    if (!e.alive || !e.ai.shield) continue;
    if (e.shieldCharges == null) e.shieldCharges = 0;
    if (e.shieldCd == null) e.shieldCd = e.ai.shield.cooldown; // 첫 시전까지 풀쿨 대기
    if (e.permaGroggy || e.groggyTime > 0) continue;
    if (e.shieldCd > 0) e.shieldCd -= dt;
    // 쿨이 찼고(≤0) 막이 없을 때만 시전. 막이 있으면 대기(쿨은 ≤0로 유지 → 깨지는 즉시).
    if (e.shieldCd <= 0 && e.shieldCharges <= 0) {
      e.shieldCharges = e.ai.shield.blocks;
      e.shieldCd = e.ai.shield.cooldown;
    }
  }
}

// 포식(devour): 그로기 상태의 적을 마무리하고 3인 연동을 일으킨다.
function devourEnemy(target) {
  target.alive = false;
  applyDevourRipple(target);
}

// 사료스탕스 devour-ripple(wiki §D): 누구를 포식했느냐에 따라 남은 적의 상태가
// 갈린다. group이 없으면(일반 적) 아무 일도 하지 않는다.
function applyDevourRipple(devoured) {
  const group = devoured.group;
  if (!group) return;
  // 비비 포식(2번 인카운터): 다야 방어력을 최저(피해 증폭)로 떨구고, 키디언을
  // 광폭화한다 — 쿨 3배·패링 불가·봉인 불가(projectiles.js가 lineEnraged를 본다).
  // 이미 봉인된 키디언(alive=false)은 group 루프에서 건너뛰므로 다시 살아나지 않는다.
  if (devoured.role === "bibi") {
    for (const e of group) {
      if (!e.alive || e === devoured) continue;
      if (e.role === "daya") e.defense = DAGGER_DEFENSE_MIN;
      if (e.role === "kidian") e.lineEnraged = true;
    }
    return;
  }
  if (devoured.role === "tig") {
    // 티그 포식 → 남은 둘 영구 그로기(가장 쉬운 공략 루트)
    for (const e of group) {
      if (e.alive && e !== devoured) makePermaGroggy(e);
    }
    return;
  }
  if (devoured.role === "benny" || devoured.role === "lupo") {
    const tig = group.find((e) => e.role === "tig");
    if (!tig || !tig.alive) return;
    const minionsDevoured = group.filter(
      (e) => (e.role === "benny" || e.role === "lupo") && !e.alive
    ).length;
    tig.berserk = true; // 베니/루포가 포식당하면 티그는 폭주
    if (minionsDevoured >= 2) {
      // 베니+루포 둘 다 포식 → 티그 무적 폭주 + 자기 체력 자가 감소
      tig.invincible = true;
      tig.selfDrain = TIG_SELF_DRAIN;
    } else {
      // 하나만 포식 → 남은 부하 하나는 그로기
      for (const e of group) {
        if (e.alive && (e.role === "benny" || e.role === "lupo")) {
          enterGroggy(e);
        }
      }
    }
  }
}

// ---- 비비 단검 → 다야 방어력 깎기 (wiki: 비비 단검 패링/포식 연동) ----
// 두 진입점(① 비비 단검 패링, ② 떨군 단검을 공격)이 '같은 효과'로 합류하는 funnel.
// 지금은 ②(떨군 단검 = 공격판정 없는 hittable)만 구현 — 비비(투척자)는 이후 단계.
// ①(투사체 패링)이 붙으면 같은 redirectDaggerToDaya()를 호출하면 된다.
const DAGGER_DEFENSE_DROP = 0.15; // 단검 한 번이 깎는 다야 방어력
const DAGGER_DEFENSE_MIN = -5; // 단검으로 내려갈 수 있는 하한. 음수라 '증폭'까지 깎임:
//   defense -5 → hitEnemy의 (1-defense)=6배 피해. 다야를 끝까지 깎으면 평타가 크게 들어간다.
const DAGGER_W = 14; // 떨군 단검 박스 크기(렌더/피격 공용)
const DAGGER_H = 24;

// 떨군 단검: 공격판정이 없는(플레이어를 때리지 않는) 정적 표적. 플레이어 공격이
// 닿으면 redirectDaggerToDaya()를 일으키고 소멸한다. role/ai/hp가 없어 적이 아니므로
// enemies가 아니라 hittables에 둔다(적 로직을 건드리지 않게). footX/footY는 발 기준.
function makeDroppedDagger(footX, footY) {
  return {
    x: footX - DAGGER_W / 2,
    y: footY - DAGGER_H,
    w: DAGGER_W,
    h: DAGGER_H,
    alive: true,
    kind: "droppedDagger",
  };
}

// 공유 효과: 단검 한 자루가 다야를 때려 방어력을 DAGGER_DEFENSE_DROP만큼 깎는다.
// 진입점(패링/떨군 단검 공격)이 무엇이든 이 함수 하나만 통한다(효과 일관성).
// 다야가 없으면(미배치/사망) 아무 일도 하지 않는다.
function redirectDaggerToDaya() {
  const daya = enemies.find((e) => e.alive && e.role === "daya");
  if (!daya) return;
  daya.defense = Math.max(DAGGER_DEFENSE_MIN, daya.defense - DAGGER_DEFENSE_DROP);
  TimeControl.freeze(ATTACK_HIT_STOP); // 적중 타격감
  parryFlash = 0.12; // 효과가 들어간 순간 짧은 플래시(연출)
}

// 적을 영구 그로기로 만든다(진행 중이던 공격 히트박스도 즉시 끈다).
function makePermaGroggy(enemy) {
  enemy.permaGroggy = true;
  enemy.attack = null; // 진행 중이던 공격 즉시 중단
  enemy.parried = false;
  enemy.hitPlayer = false;
}

function resolveParries() {
  const pHb = getAttackHitbox();
  if (!pHb) return; // 플레이어가 공격 중이 아니면 패링 없음
  for (const enemy of enemies) {
    // 이미 패링했거나(parried) 이미 플레이어를 때린(hitPlayer) 공격은 패링 불가.
    // hitPlayer를 빼지 않으면 '맞은 뒤 사후 패링'이 되어, 패링이 예측 입력이 아니라
    // 사후 보정이 된다. 패링은 반드시 맞기 전에 먼저 쳐야 성립한다.
    if (!enemy.alive || enemy.parried || enemy.hitPlayer) continue;
    if (enemy.attack && !enemy.attack.parryable) continue; // 패링 불가 공격은 제외
    const eHb = getEnemyAttackHitbox(enemy);
    if (!eHb) continue; // 적이 공격 중(active)이 아니면 패링 대상 아님
    // 마주봄: 플레이어와 적이 서로 반대 방향을 보고(각자 상대 쪽), 두 공격
    // 히트박스가 겹친다.
    const facingEachOther = player.attackDir === -enemy.attackDir;
    if (facingEachOther && aabbOverlap(pHb, eHb)) {
      enemy.parried = true;
      onParry(enemy);
    }
  }
}

// 패링이 성사됐을 때. 연출 플래시 + 패링 누적. 임계치를 넘으면 그로기 진입.
// 단, 패링한 공격이 '힘겨루기 유발 공격'(triggersStruggle)이면 누적과 무관하게
// 즉시 힘겨루기로 들어간다(베니의 bennyStruggle).
function onParry(enemy) {
  parryFlash = 0.15;
  TimeControl.freeze(PARRY_HIT_STOP); // 패링 성사 타격감(시간 정지)
  // 패링이 성사된 적은 이번 스윙의 body-hit에서 제외한다(패링≠피격). 같은
  // 히트박스 윈도가 끝나기 전엔 attackHits에 남아 resolveAttackHits가 건너뛴다.
  player.attackHits.add(enemy);
  // 힘겨루기 유발 공격을 패링 → 즉시 힘겨루기 진입(누적 그로기 경로와 별개).
  if (enemy.attack && enemy.attack.triggersStruggle) {
    enterPowerStruggle(enemy);
    return;
  }
  // 돌진(kind="dash")을 패링 → 뒤로 못 가고(attack 블록이 parried면 이동 중단)
  // 앞에서 짧게 그로기(공격 차단 그로기). 누적 게이지 경로와 별개의 즉시 스태거다.
  if (enemy.attack && enemy.attack.kind === "dash") {
    enterAttackInterruptGroggy(enemy);
    return;
  }
  // 비비 휘두르기(#1)를 패링 → 발밑에 단검을 떨군다. 떨군 단검을 공격하면
  // redirectDaggerToDaya로 다야 방어력이 깎인다(진입점 B). 그로기 누적과는 별개로
  // 둘 다 일어난다(아래 addGroggyGauge도 그대로 적용 — 비비도 그로기로 넣을 수 있게).
  if (enemy.attack && enemy.attack.dropsDaggerOnParry) {
    hittables.push(makeDroppedDagger(enemy.x + enemy.w / 2, enemy.y + enemy.h));
  }
  // 그 외 공격: 패링으로 그로기 게이지를 그 공격의 가중치만큼 올린다(평타 +1,
  // 루포 블링크 등 +2). 최대치 이상이 되면(오버) addGroggyGauge가 그로기로 넣는다.
  addGroggyGauge(enemy, parryGroggyGain(enemy.attack));
}

// 힘겨루기 진입(power-struggle, wiki §C). 베니의 힘겨루기 유발 공격을 패링하면 호출된다.
// 힘겨루기 상태로 전환하고(게이지/타이머 초기화) 클로즈업 줌인을 건다. 이후 진행은
// updatePowerStruggle이 맡는다(연타로 게이지를 채워 이기거나, 짤딜로 체력이 깎인다).
function enterPowerStruggle(enemy) {
  if (powerStruggle.active) return; // 이미 진행 중이면 중복 진입 방지
  powerStruggle.active = true;
  powerStruggle.enemy = enemy;
  powerStruggle.gauge = POWER_STRUGGLE_GAUGE_START; // 중간에서 시작
  powerStruggle.elapsed = 0;
  powerStruggle.nextDot = POWER_STRUGGLE_DOT_START; // 첫 짤딜 시점
  TimeControl.freeze(POWER_STRUGGLE_HIT_STOP);
  // 클로즈업: 플레이어와 베니의 중간 지점을 중심으로 부드럽게 3.5배 줌인.
  const cx = (player.x + player.w / 2 + enemy.x + enemy.w / 2) / 2;
  const cy = (player.y + player.h / 2 + enemy.y + enemy.h / 2) / 2;
  ZoomControl.request(POWER_STRUGGLE_ZOOM, cx, cy);
}

// 힘겨루기 '승리' 효과: 충격파(화면 흔들림) + group 전원 그로기. 연타로 게이지를
// 가득 채웠을 때 updatePowerStruggle이 호출한다.
function winPowerStruggle(enemy) {
  ScreenShake.shake(SHOCKWAVE_SHAKE_MAG, SHOCKWAVE_SHAKE_TIME); // 충격파
  const group = enemy.group || [enemy];
  for (const e of group) {
    // 영구 그로기/무적 상태는 건드리지 않는다(이미 무방비거나 면역).
    if (e.alive && !e.permaGroggy && !e.invincible) enterGroggy(e);
  }
  enemy.groggyGauge = 0; // 힘겨루기로 소비 — 그로기 게이지 초기화
}

// 힘겨루기 종료(승리/패배/사망 공통): 상태를 끄고 줌을 부드럽게 원복한다.
function endPowerStruggle() {
  powerStruggle.active = false;
  powerStruggle.enemy = null;
  ZoomControl.to(1);
}

// 힘겨루기 패배(게이지 0): 줌 원복 + 피해. (위키: lose → take damage)
function losePowerStruggle() {
  endPowerStruggle();
  for (let i = 0; i < POWER_STRUGGLE_LOSE_DAMAGE && !player.dead; i++) damagePlayer();
}

// 현재 경과 시간에서의 자연 감소율(초당 게이지 감소량). CALM_TIME까지는 BASE로
// 잔잔하고, 그 후 DOUBLE_TIME마다 2배로 매끄럽게(지수 곡선) 가속한다.
function powerStruggleDecayRate(elapsed) {
  if (elapsed <= POWER_STRUGGLE_DECAY_CALM_TIME) return POWER_STRUGGLE_DECAY_BASE;
  const t = elapsed - POWER_STRUGGLE_DECAY_CALM_TIME;
  return POWER_STRUGGLE_DECAY_BASE * Math.pow(2, t / POWER_STRUGGLE_DECAY_DOUBLE_TIME);
}

// 힘겨루기 진행(매 프레임). 연타로 게이지를 올리고, 적이 미는 힘(자연 감소)이
// 시간이 갈수록 가속해 게이지를 내린다. MAX 도달=승리, 0=패배.
function updatePowerStruggle(dt) {
  const ps = powerStruggle;
  ps.elapsed += dt;

  // 연타 입력: attack을 새로 누를 때마다 게이지 +1
  if (Input.justPressed("attack")) ps.gauge += POWER_STRUGGLE_GAUGE_PER_TAP;

  // 승리: MAX 도달 시 즉시(자연 감소 적용 전) 충격파 + 그로기 후 종료.
  // 감소를 먼저 적용하면 MAX를 찍은 같은 프레임에 임계 미달이 되어 승리를 놓친다.
  if (ps.gauge >= POWER_STRUGGLE_GAUGE_MAX) {
    const e = ps.enemy;
    endPowerStruggle();
    if (e && e.alive) winPowerStruggle(e);
    return;
  }

  // 자연 감소(가속 곡선, dt 기반 연속).
  ps.gauge -= powerStruggleDecayRate(ps.elapsed) * dt;

  // 패배: 게이지가 0 이하로 밀리면.
  if (ps.gauge <= 0) {
    ps.gauge = 0;
    losePowerStruggle();
    return;
  }

  // 짤딜(체력 DoT): nextDot 시점마다 체력 1 감소(2초 → 이후 0.5초 간격).
  while (ps.elapsed >= ps.nextDot) {
    damagePlayer();
    ps.nextDot += POWER_STRUGGLE_DOT_INTERVAL;
    if (player.dead) return; // 사망 시 damagePlayer가 힘겨루기를 정리한다
  }
}

// 적을 그로기 상태로 만든다: 진행 중이던 공격 히트박스를 즉시 끄고
// (그로기 동안 공격 금지) GROGGY_TIME 동안 무방비로 둔다.
// 그로기 게이지를 amount만큼 올리고, 최대치 이상이 되면 그로기에 넣는다. 게이지가
// 차는 '모든' 경로(패링, 그리고 앞으로 추가될 드론/덩굴/사슬·약점 타격 누적 등 —
// wiki boss-state-and-encounter-mechanics §B)는 이 함수 하나만 통하게 한다.
//   - 이미 그로기/영구 그로기/무적이면 적립을 무시한다: 그로기 중 게이지가 다시
//     차서 '종료 즉시 재그로기'가 터지는 것을 한 곳에서 구조적으로 막는다(미래에
//     비-패링 소스가 그로기 중에도 들어올 수 있으므로 필요한 가드).
function addGroggyGauge(enemy, amount) {
  if (enemy.groggyTime > 0 || enemy.permaGroggy || enemy.invincible) return;
  enemy.groggyGauge += amount;
  if (enemy.groggyGauge >= GROGGY_GAUGE_MAX) enterGroggy(enemy);
}

// 누적 그로기(게이지 오버). 게이지(groggyGauge)는 여기서 비우지 않는다 — 그로기가
// '끝날 때' updateEnemies가 0으로 드레인한다(그로기 내내 가득 찬 상태로 보이도록).
// 진입이 오버(예: 최대 3에서 4)였어도 종료 시 0으로 비우므로 초과분은 결국 버려진다.
function enterGroggy(enemy) {
  enemy.groggyTime = GROGGY_TIME;
  enemy.groggyDrains = true; // 종료 시 게이지를 0으로 드레인(누적 그로기)
  enemy.attack = null; // 진행 중이던 공격 즉시 중단(히트박스도 사라짐)
  enemy.parried = false;
  enemy.hitPlayer = false;
}

// 공격 차단 그로기(gap-closer 패링): 누적 게이지와 무관한 짧은 스태거. 게이지를
// 건드리지 않으므로(groggyDrains=false) 종료 시에도 누적분이 보존된다. 돌진을
// 패링하면 기동이 끊기고 '앞에서' 잠깐 무방비가 된다(이미 멈춘 자리에서).
function enterAttackInterruptGroggy(enemy) {
  enemy.groggyTime = ATTACK_INTERRUPT_GROGGY_TIME;
  enemy.groggyDrains = false; // 게이지 보존(이 그로기는 게이지와 무관)
  enemy.attack = null; // 진행 중이던 돌진 즉시 중단(히트박스도 사라짐)
  enemy.parried = false;
  enemy.hitPlayer = false;
}

// 적 공격 히트박스가 플레이어와 겹치면 피해를 준다. 한 적의 한 번 휘두름(active
// 윈도)에서 플레이어는 한 번만 맞는다(enemy.hitPlayer). 그 스윙을 패링했다면
// (enemy.parried) 피해 없음 — 패링은 이 함수보다 먼저 처리되므로 이미 표시돼 있다.
// 또한 플레이어가 그 적을 '마주보며 공격(active) 중'이면 패링 자세로 보고 피해를
// 막는다: 패링 히트박스가 정확히 겹쳐 패링이 성사되지 않더라도, 검을 맞대는 동안엔
// 맞지 않는다("패링한 공격은 피해 없음"의 일반화). hitPlayer로 소비하지 않으므로
// 공격을 거두면(active 종료) 다시 맞을 수 있다.
function resolvePlayerHits() {
  if (player.dead) return;
  const playerAttacking = getAttackHitbox() !== null; // 플레이어 공격 active 여부
  for (const enemy of enemies) {
    if (!enemy.alive || enemy.parried || enemy.hitPlayer) continue;
    const eHb = getEnemyAttackHitbox(enemy);
    if (!eHb) continue;
    if (aabbOverlap(eHb, getHurtbox(player))) {
      const atk = enemy.attack;
      // 마주보며 공격 중이면 패링 자세로 보고 피해를 막는다(소비하지 않음). 단 패링
      // 불가 공격(parryable=false, 비비 #2)은 칼을 맞대도 막히지 않는다 — 회피만이 답.
      const blockable = !atk || atk.parryable;
      if (blockable && playerAttacking && player.attackDir === -enemy.attackDir) continue;
      enemy.hitPlayer = true;
      // 공격별 데미지(enemy.attack.damage)가 있으면 그만큼, 없으면 1. 강공격/돌진을
      // 더 아프게 두거나(예: 2), 레이저 부분피격에 소수점을 넣을 수 있다.
      damagePlayer(atk && atk.damage != null ? atk.damage : 1);
      // 패링 불가 강타(비비 #2)에 맞으면 받는 피해 2배 디버프를 건다(타이머 갱신).
      if (atk && atk.appliesVuln) player.vulnTime = VULN_TIME;
    }
  }
}

// 플레이어가 한 대 맞았을 때. amount만큼 HP를 깎고 0 이하면 사망 처리(조작 불가 +
// 초록색). amount는 소수점도 허용(레이저 부분피격 등). 힘겨루기 중(짤딜 등으로)
// 사망하면 힘겨루기를 정리하고 줌을 원복한다.
function damagePlayer(amount = 1) {
  // 받는 피해 2배 디버프(비비 #2)가 걸려 있으면 배수를 곱한다.
  const mult = player.vulnTime > 0 ? VULN_DAMAGE_MULT : 1;
  player.hp -= amount * mult;
  if (player.hp <= 0) {
    player.hp = 0;
    player.dead = true;
    if (powerStruggle.active) endPowerStruggle();
  }
}

