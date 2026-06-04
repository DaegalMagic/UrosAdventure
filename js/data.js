// 우로스의 모험 — 데이터(공격 정의 ATTACKS + 적 AI 표 ENEMY_AI + AI/디버프 상수)
// (main.js에서 분리. 빌드/모듈 시스템이 없어 전역 스코프를 공유하므로 분리는
//  코드 이동 + index.html <script> 추가가 전부다. 로드 시점에 평가되는 ENEMY_AI가 같은 파일 안 상수만 참조 → 자기완결. 가장 먼저 로드.)

// ---- 공격 정의(spec) ----
// 한 번의 공격이 어떻게 전개되는지를 데이터로 둔다. 캐릭터/공격마다 사전모션과
// 범위가 다르므로, 상수 한 세트 대신 spec 객체로 분리한다(보스가 늘어도 표만
// 추가하면 된다 — wiki boss-attack-pattern-taxonomy의 Shared Attack Attributes).
//   phase 시간(초): windup(예고동작) → active(타격판정 ON) → recovery(후딜).
//     active 구간에만 히트박스가 뜬다. windup이 패링 타이밍 윈도를 만든다.
//   range: active 동안의 히트박스. w=가로(캐릭터 폭 포함, 바라보는 방향으로 뻗음),
//     h=세로(null이면 피격판정 높이 그대로), offsetY=피격판정 윗변 기준 세로 오프셋.
//   parryable: 플레이어가 패링할 수 있는 공격인가(패링 불가 공격을 위한 자리).
//   parryWeight: 이 공격을 패링했을 때 적의 그로기 게이지가 오르는 양(없으면 1).
//     평타는 1, 루포 블링크처럼 "그로기 2배"인 공격은 2. 게이지가 GROGGY_GAUGE_MAX
//     이상이 되면 그로기(enterGroggy). 임의 배수를 한 필드로 표현한다.
const ATTACKS = {
  // 플레이어 검: 즉발 단타(windup 0)라 반응이 즉각적이다. recovery(후딜)로 연타
  // 속도를 제한해 평타 DPS를 낮춘다 — 전체 0.4초/타(active 0.15 + recovery 0.25),
  // DPS ≈ 2.5. 그래야 보스 HP를 작게(하트/그로기 횟수로 읽히게) 둘 수 있다.
  playerSlash: {
    windup: 0,
    active: 0.15,
    recovery: 0.25,
    range: { w: 100, h: null, offsetY: 0 },
    parryable: true,
  },
  // 포식(S키): 그로기 적을 마무리하는 플레이어 액션. 범위는 평타의 가로 3배(100→300)·
  // 세로 3배(피격높이 60→180, offsetY -60으로 세로 중앙 정렬). 0.3초 예고 후 짧은 타격.
  //   active 0.05초 ≈ "한 프레임": 가변 dt(최대 0.05)에서도 한 프레임은 반드시 active를
  //   잡도록 한 최소값이고, attackHits가 스윙당 1회로 막아 사실상 순간 일격이 된다.
  //   damage 0.01: 그로기 적을 만나면 즉시 포식(HP 무관, combat.js), 아니면 피해 미미.
  devour: {
    windup: 0.3,
    active: 0.05,
    recovery: 0.2,
    range: { w: 300, h: 180, offsetY: -60 },
    damage: 0.01,
    devour: true,
  },
  // 사료스탕스 루포/티그 기본 휘두르기: 0.25초 예고 후 타격. windup이 패링 타이밍을 만든다.
  enemySwing: {
    windup: 0.25,
    active: 0.1,
    recovery: 0.3,
    range: { w: 100, h: null, offsetY: 0 },
    parryable: true,
  },
  // 베니 일반 휘두르기: 패링하면 일반 패링(누적 → 임계 시 그로기).
  bennySlash: {
    windup: 0.25,
    active: 0.1,
    recovery: 0.3,
    range: { w: 100, h: null, offsetY: 0 },
    parryable: true,
  },
  // 베니 힘겨루기 유발 공격: 더 길게 예고(0.4)하고 범위도 크다. 이 공격을 패링하면
  // 누적과 무관하게 즉시 힘겨루기로 들어간다(triggersStruggle 표식을 onParry가 본다).
  bennyStruggle: {
    windup: 0.4,
    active: 0.12,
    recovery: 0.35,
    range: { w: 120, h: null, offsetY: 0 },
    parryable: true,
    triggersStruggle: true,
  },
  // 티그 돌진(gap-closer, wiki enemy-ai-and-locomotion §D): 준비동작(windup) 후
  // active 동안 '플레이어 등 뒤'로 빠르게 돌진한다. 제자리 휘두르기와 달리 돌진
  // 이동 그 자체가 타격 판정이다(kind="dash" → active 동안 적 몸통이 히트박스).
  //   돌진 속도는 발동 시점에 '등 뒤 목표점까지 거리 ÷ active'로 역산한다(고정값이
  //   아님 — updateEnemies가 enemy.dashSpeed에 저장). 그래서 spec엔 속도가 없다.
  //   parry 시: 뒤로 못 가고 앞에서 멈춰 0.5초 그로기(onParry가 kind=dash를 본다).
  tigDash: {
    windup: 0.35, // 예고(패링 타이밍을 만든다)
    active: 0.18, // 돌진(타격) 지속
    recovery: 0.3,
    range: { w: 100, h: null, offsetY: 0 }, // 폴백용(kind=dash는 몸통 히트박스를 쓴다)
    parryable: true,
    kind: "dash",
  },
  // 루포 블링크(gap-closer, wiki enemy-ai-and-locomotion §D): 준비동작(windup) 후
  // '플레이어 등 뒤'로 순간이동하고 즉시 공격한다. 돌진과 달리 이동이 아니라
  // 텔레포트라, windup이 끝나는 순간 위치를 옮기고(kind="blink") 그 자리에서 일반
  // 공격 히트박스를 띄운다(active). 시전은 즉시(블링크 직후 바로 active)지만 전조는
  // 있다 — 전조는 블링크 '전'의 windup이다.
  //   parryWeight 2: 이 공격을 패링하면 그로기 게이지가 2 오른다("그로기 2배").
  lupoBlink: {
    windup: 0.4, // 블링크 전 예고(패링 타이밍 + 위치 이동 신호)
    active: 0.12, // 블링크 직후 즉시 타격
    recovery: 0.35,
    range: { w: 100, h: null, offsetY: 0 },
    parryable: true,
    kind: "blink",
    parryWeight: 2, // 패링 시 그로기 게이지 2배
  },
  // 비비 기본 휘두르기(#1): 패링하면 발밑에 단검을 떨군다(dropsDaggerOnParry를
  // onParry가 본다). 떨군 단검을 공격하면 redirectDaggerToDaya로 다야 방어력이 깎인다.
  bibiSwing: {
    windup: 0.25,
    active: 0.1,
    recovery: 0.3,
    range: { w: 100, h: null, offsetY: 0 },
    parryable: true,
    dropsDaggerOnParry: true,
  },
  // 비비 패링 불가 강타(#2): 패링이 안 되니 회피해야 한다(그래서 windup을 길게 줘
  // 전조를 충분히 보여준다). 맞으면 appliesVuln → 일정 시간 받는 피해 2배(디버프).
  bibiUnparryable: {
    windup: 0.5,
    active: 0.12,
    recovery: 0.4,
    range: { w: 100, h: null, offsetY: 0 },
    parryable: false,
    appliesVuln: true,
  },
  // 림(스테이지4) 평타: 0.5초 시전 후 타격. 범위 세로=캐릭터 동일(h null)·가로 3배
  // (ENEMY_HURT_W 45×3 = 135). dmg 1(기본). 일반 패링 가능.
  rimSwing: {
    windup: 0.5,
    active: 0.1,
    recovery: 0.3,
    range: { w: 135, h: null, offsetY: 0 },
    parryable: true,
  },
  // 림 광역 강타(패턴②): 1.2초 기 모으기(긴 windup=telegraph) → 평타 범위의 가로 5배·
  // 세로 5배(135×5=675, 60×5=300; offsetY -120으로 세로 중앙 정렬 → 점프로 못 피함).
  // 발동 방향으로만 뻗어 '림 뒤쪽은 비피격'(makeAttackHitbox가 facing 방향으로 뻗음).
  // dmg 2. 패링 가능하지만 parryStun: 패링 성공 시 플레이어가 0.3초 행동불가(패링 리스크).
  rimAoe: {
    windup: 1.2,
    active: 0.3,
    recovery: 0.5,
    range: { w: 675, h: 300, offsetY: -120 },
    parryable: true,
    damage: 2,
    parryStun: 0.3,
  },
  // 셰이디(스테이지4) 접근 평타: 루포 블링크와 같은 구조(kind="blink") — windup 동안
  // 차원문 전조를 보이다가 windup 종료 시 '플레이어 등 뒤'로 순간이동해 즉시 타격한다
  // (blinkBehindPlayer 재활용). dmg 1(기본), 일반 패링 가능(parryWeight 기본 1).
  shadyBlink: {
    windup: 0.4,
    active: 0.12,
    recovery: 0.3,
    range: { w: 100, h: null, offsetY: 0 },
    parryable: true,
    kind: "blink",
  },
};

// ---- 적 AI(이동·결정) 상수 (wiki enemy-ai-and-locomotion) ----
// 적은 CHASE(추격)→ATTACK(제자리 공격)→RECOVER(후딜 정지)→CHASE 의 상태 기계로
// 움직인다. CHASE에서 플레이어를 향해 가다가, 사거리 안에 들면 멈춰서 공격하고,
// 공격이 끝나면 RECOVER_TIME만큼 쉰 뒤 다시 추격한다.
const ENEMY_CHASE_SPEED = 120; // 추격 이동 속도(px/s). 플레이어 MOVE_SPEED=200보다 느림
const ENEMY_ATTACK_RANGE_X = 85; // 공격 발동 가로 사거리(중심간 거리, px). 튜닝값
const BIBI_CHASE_SPEED = 84; // 비비 추격 속도: 사료스탕스(120)보다 느림(0.7배)

// 비비 패링 불가 강타(#2)에 맞으면 거는 디버프: 일정 시간 받는 피해가 배가된다.
const VULN_TIME = 10; // 디버프 지속(초)
const VULN_DAMAGE_MULT = 2; // 지속 중 플레이어가 받는 피해 배수
const ENEMY_RECOVER_TIME = 0.5; // 공격이 끝난 뒤 다시 추격하기까지의 정지 시간(초)

// gap-closer(돌진/블링크) 패링 시 공격 차단 그로기 시간(초). 누적 그로기(5초)와
// 별개의 짧은 스태거 — 패링당하면 기동이 끊기고 앞에서 잠깐 무방비가 된다.
const ATTACK_INTERRUPT_GROGGY_TIME = 0.5;
// 티그 돌진이 노리는 '플레이어 등 뒤' 착지점의 가로 여유(px). 플레이어를 지나쳐
// 이만큼 더 간 곳을 목표로 삼는다(등 뒤로 파고드는 느낌).
const TIG_DASH_BEHIND_GAP = 60;

// ---- 세로(층) 선호 추격 상수 (wiki enemy-ai-and-locomotion) ----
// 적은 평소엔 자기 '선호 층'(루포 위/티그 같음/베니 아래)에 머물며 추격하다가,
// 플레이어에게 가로로 근접하면 반드시 플레이어 층으로 맞춘다(공격하려고).
//   근접 판정은 떨림 방지를 위해 진입/이탈 거리를 다르게 둔다(히스테리시스):
//   APPROACH_ENTER 안에 들면 '근접', APPROACH_EXIT 밖으로 나가야 '근접' 해제.
const VERT_APPROACH_ENTER_X = 140; // 이 가로거리 안 → 근접(플레이어 층으로 강제 맞춤)
const VERT_APPROACH_EXIT_X = 220; // 이 밖으로 나가야 근접 해제(선호 층으로 복귀)
// 선호 층으로 가는 층 이동(점프/드롭)은 매 프레임이 아니라 주기적으로 '시도'한다.
// 시도 간격마다 chance 확률로만 실행 → 선호도를 '부지런함'으로 표현(우왕좌왕 방지).
const VERT_DECIDE_INTERVAL = 0.6; // 층 이동 시도 간격(초)
const VERT_MOVE_CHANCE = 0.7; // 시도 시 실제로 점프/드롭할 확률(근접 시엔 항상 1)

// 적 종류별 AI 설정(데이터 기반). 같은 FSM에 이 표만 바꿔 끼운다.
//   chaseSpeed/attackRangeX: 이동 속도와 공격 가로 사거리.
//   basic: 사거리 안에서 쓰는 기본 공격 키(ATTACKS).
//   special: 스페셜(없으면 null).
//     kind="rangeReplace": 사거리 안에서 쓰는 평타를 쿨다운이 찼을 때 이 공격으로
//       교체(베니 힘겨루기 유발 공격).
//     kind="dash": gap-closer. CHASE 중 쿨이 차면(+조건) 거리와 무관하게 발동해
//       돌진으로 거리를 좁힌다(티그). needSameRow면 같은 가로줄일 때만 발동.
//     kind="blink": gap-closer. 쿨이 차면 발동해 windup 후 플레이어 등 뒤로
//       순간이동하고 즉시 공격한다(루포).
//     cooldown: 스페셜 재사용 대기(초).
//   floorPref: 원거리(비근접) 시 선호하는 층 오프셋. 층 인덱스는 0=위라서
//     -1=플레이어보다 한 층 위(루포), 0=같은 층(티그), +1=한 층 아래(베니).
// 아공간(스테이지4 공통, 림/셰이디): HP가 enterThreshold(5%) 이하로 떨어지면 죽지 않고
// 아공간으로 피신했다가 dwellTime초 뒤 returnHp(30%)로 회복해 복귀한다. 상대가 살아 있을
// 때만 작동(둘 다 생존 = 즉사 불가). 한쪽이 처치되면 생존자는 봉인되어 정상 처치된다.
// 상대가 아공간 체류 중 죽으면 즉시 복귀하되 회복은 체류시간에 비례(park-and-kill 방지).
// 메커니즘 SSOT: 메모리 stage4-rim-shady-spec.md "공통 — 아공간".
const SUBSPACE = { enterThreshold: 0.05, returnHp: 0.3, dwellTime: 4 };
const ENEMY_AI = {
  default: { chaseSpeed: ENEMY_CHASE_SPEED, attackRangeX: ENEMY_ATTACK_RANGE_X, basic: "enemySwing", special: null, floorPref: 0 },
  benny: { chaseSpeed: ENEMY_CHASE_SPEED, attackRangeX: ENEMY_ATTACK_RANGE_X, basic: "bennySlash", special: { kind: "rangeReplace", attack: "bennyStruggle", cooldown: 6 }, floorPref: 1 },
  lupo: { chaseSpeed: ENEMY_CHASE_SPEED, attackRangeX: ENEMY_ATTACK_RANGE_X, basic: "enemySwing", special: { kind: "blink", attack: "lupoBlink", cooldown: 5 }, floorPref: -1 },
  tig: { chaseSpeed: ENEMY_CHASE_SPEED, attackRangeX: ENEMY_ATTACK_RANGE_X, basic: "enemySwing", special: { kind: "dash", attack: "tigDash", cooldown: 5, needSameRow: true }, floorPref: 0 },
  // 다야(2번 보스, 앵커): 맨 오른쪽 1층에 근엄하게 앉은 정지형 탱커. 추격·근접은
  // 하지 않고(stationary) 받기만 하지만, 제자리에서 patterns(projectiles.js의
  // dayaPatterns)로 원거리 견제를 한다. 극단적으로 단단함은 방어력(0.99)으로 표현하고
  // (makeEnemy defense 인자), 비비 단검 패링/비비 포식으로 그 방어력이 깎인다.
  // patterns: cooldown초마다 3패턴 중 하나를 굴려 발동한다(직전과 같은 패턴은 연속 금지).
  //   P1 부채꼴(fan): 발동 시점의 플레이어를 정조준한 1발 + 위아래 ±fanSpread(rad)로
  //     벌어진 2발(총 fanCount발)을 shotSpeed로 쏜다. 맞으면 shotDamage. 패링하면
  //     '플레이어가 보는 방향(facing)'으로 수평 반사(reflectSpeed)되며, 반사체가 비비를
  //     맞히면 reflectDamage(=3), 다야/키디언을 맞히면 피격 연출만(노데미지)·소멸.
  //   P2 가시(spike): 발동 순간 플레이어 발밑 바닥에 위험표시 → spikeTelegraph초 뒤
  //     그 자리에서 가시가 spikeRise초에 걸쳐 솟아 spikeActive초간 머문다(spikeDamage).
  //     패링 불가 — 회피 전용(긴 예고가 회피 시간).
  //   P3 비(rain): 맵 가로를 rainSlot(px)으로 나눈 칸 중 랜덤으로 rainCount개를
  //     rainInterval초마다 1~2개씩 화면 위에서 떨군다(rainSpeed). 맞으면 rainDamage,
  //     패링하면 그냥 부서진다(반사 없음).
  daya: {
    chaseSpeed: 0, attackRangeX: 0, basic: null, special: null, floorPref: 0, stationary: true,
    patterns: {
      cooldown: 10,
      fanCount: 3, fanSpread: 0.32, shotSpeed: 300, shotDamage: 1, reflectSpeed: 420, reflectDamage: 3,
      spikeTelegraph: 2.0, spikeRise: 0.15, spikeActive: 0.5, spikeDamage: 1,
      rainCount: 20, rainSlot: 150, rainInterval: 0.1, rainSpeed: 300, rainDamage: 1,
    },
  },
  // 비비(2번, 교란자): 다야보다 느리게 돌아다니며 근접 시 휘두른다. 층 선호 0(티그와
  // 동일 추격경로). altBasic = 근접 공격 시 chance 확률로 basic 대신 쓰는 대체 공격
  // — 비비는 1/4로 패링 불가 강타(#2). 방어막(#5)은 이후 단계.
  // ranged: 원거리 단검(projectiles.js). cooldown 초마다 발동, bigChance로 큰 단검(#4)
  // 인지 4연(#3)인지 굴린다(#2 근접 굴림과 독립). 방어막 켜지면 이 쿨이 절반이 된다.
  // shield(#5): cooldown마다 blocks회 막는 방어막(combat.js updateShields/hitEnemy).
  bibi: { chaseSpeed: BIBI_CHASE_SPEED, attackRangeX: ENEMY_ATTACK_RANGE_X, basic: "bibiSwing", altBasic: { attack: "bibiUnparryable", chance: 0.25 }, special: null, floorPref: 0, ranged: { cooldown: 7, bigChance: 0.25 }, shield: { cooldown: 10, blocks: 2 } },
  // 키디언(2번, 직선 슈터): 추격·근접을 하지 않고(stationary) 제자리에서 가로/세로
  // 직선 공격을 쏜다(projectiles.js의 lineShooter). cdMin~cdMax초 랜덤 쿨마다 가로/
  // 세로를 랜덤으로 골라, 발동 시점의 '플레이어 위치'를 관통하는 라인을 telegraph초
  // 동안 예고(ease-out-cubic 페이드인)한 뒤 fire초 동안 매우 빠르게 발사한다(데미지
  // damage). 예고 동안 패링 가능 — 패링 1회당 다음 발사 쿨이 parryCdBonus초 늘고,
  // sealParries회 패링하면 영구 봉인된다. 키디언은 HP가 없어(defense=1로 평타 무효)
  // 이 봉인이 곧 '처치'다(봉인 시 alive=false → 클리어 조건에 편입).
  // 광폭화(비비 포식 시 lineEnraged=true): 발사 쿨이 enrageCdMult배 빨라지고, 라인이
  // 패링 불가가 되며(=봉인 불가) 빨갛게 바뀐다 — combat.js applyDevourRipple가 건다.
  kidian: { chaseSpeed: 0, attackRangeX: 0, basic: null, special: null, floorPref: 0, stationary: true, lineShooter: { cdMin: 5, cdMax: 7, damage: 2, telegraph: 1.0, fire: 0.15, parryCdBonus: 10, sealParries: 5, enrageCdMult: 3 } },
  // 스테이지5(M.E.O.W 솔로전, 보상=새총). 0단계(맵+뼈대) 시점엔 AI 없는 정지형
  // placeholder다 — 4층 높이 거대 보스의 좌우 이동·본체 패턴(전체공격/지진/전방/미사일)·
  // 그로기15·드론 연동은 이후 단계에서 붙인다. SSOT: 메모리 stage5-meow-spec.md.
  meow: { chaseSpeed: 0, attackRangeX: 0, basic: null, special: null, floorPref: 0, stationary: true },
  // ---- 스테이지3(실라/나이아/이프리트/가비아) ----
  // 0단계(맵+뼈대) 시점엔 넷 다 정지형 placeholder였다. 1단계에서 이프리트만 실제
  // 행동을 붙인다(가비아·실라·나이아는 아직 정지형 더미 — 이후 단계).
  // 이프리트(1번 보스, 근접 핵심): 티그와 동일하게 추격(floorPref 0)한다. 일반 CHASE
  // (chaseStep+세로추격+사거리 평타)는 그대로 쓰고, enemy.js의 updateIfritPatterns가
  // 그 위에 '거리 분기'를 얹는다 — 플레이어와 중심 직선거리가 patternDist 이상이면
  // 두 패턴(점프슬램/불기둥) 중 랜덤으로 하나를 cooldown초 쿨로 발동하고, 미만이면
  // 일반 평타(enemySwing)를 낸다. 패턴 수치는 ifrit 하위 객체에 모은다.
  //   slam(점프슬램): slamJumpSpeed로 플레이어 방향 포물선 점프(2단점프 높이≈312px).
  //     공중 내내 패링 가능 — 패링 성공 시 변신 없이 뒤로 pushbackDist를 pushbackTime에
  //     걸쳐 밀리고, 실패(착지)하면 거대 불꽃으로 변신한다(가로·세로 transformScale배,
  //     transformTime초 무적, 겹치면 transformTickInterval초당 transformTickDmg).
  //     변신 해제 직후부터 cooldown초 쿨이 시작된다.
  //   pillar(불기둥): 발동 순간 플레이어 발밑에 위험표시(pillarTelegraph초) → 즉발.
  //     폭=캐릭터폭·높이=캐릭터2배, 패링 불가(회피 전용), 데미지 pillarDamage.
  ifrit: {
    chaseSpeed: ENEMY_CHASE_SPEED, attackRangeX: ENEMY_ATTACK_RANGE_X, basic: "enemySwing", special: null, floorPref: 0,
    ifrit: {
      patternDist: 200, cooldown: 5,
      slamJumpSpeed: 1060, // √(2·GRAVITY·312.5) — 2단점프 높이의 상승 속도
      pushbackDist: 20, pushbackTime: 0.1,
      transformScale: 3, transformTime: 3, transformTickDmg: 0.1, transformTickInterval: 0.1,
      slamDamage: 1, // 미패링 몸통 접촉 피해(슬램 1회)
      pillarTelegraph: 1.5, pillarActive: 0.3, pillarDamage: 1,
    },
  },
  // 가비아(1번 보스, 카이팅 슈터): 추격 대신 거리 유지(카이팅) — enemy.js updateGabia가
  // 전담한다(일반 CHASE 미사용, stationary 아님). 플레이어가 kiteNear 안으로 오면 물러나고,
  // kiteFar 밖이면 거리를 좁힌다(그 사이는 가로 정지). moveSpeed로 가로 이동하고 세로는
  // 플레이어 층을 대략 따라간다(updateVerticalChase 재활용). stoneCdMin~Max초마다 돌을
  // 던지고(projectiles.js fireGabiaStone — 패링 시 '각도 반사'), shieldCycle초마다 공유
  // 방어막/무적을 시전한다(projectiles.js updateGabiaShared). collapseThresholds HP에 도달할
  // 때마다 맵이 단계적으로 무너진다(map.js collapseStage3Floors).
  //   공유 방어막: 이프리트+가비아 동시에 시간제(shieldDuration초) 방어력 버프(+shieldDefenseBuff).
  //     방어막 유지 중 피격된 쪽은 해제 explodeDelay초 뒤 자기중심 폭발(가로·세로 explodeScale배,
  //     dmg explodeDamage, 패링 불가). 매 3번째 시전은 방어막 대신 무적(HP 적은 쪽 하나,
  //     invincDuration초; 때리면 플레이어 invincStagger초 경직 + 무적 즉시 해제).
  gabia: {
    chaseSpeed: 90, attackRangeX: 0, basic: null, special: null, floorPref: 0,
    gabia: {
      kiteNear: 250, kiteFar: 400, moveSpeed: 90,
      stoneCdMin: 2, stoneCdMax: 4, stoneSpeed: 300, stoneDamage: 1,
      shieldCycle: 10, shieldDuration: 2, shieldDefenseBuff: 0.8,
      explodeDelay: 0.5, explodeScale: 1.4, explodeDamage: 1,
      invincDuration: 1.5, invincStagger: 0.5,
      collapseThresholds: [64, 48, 32, 16],
    },
  },
  // 실라(왼쪽 위 모서리 저격수, 화면 밖). 추격·근접 없이(stationary) 제자리에서
  // 포물선 화살을 쏜다(projectiles.js updateSila). floating이라 중력·충돌 면제.
  //   화살: arrowCdMin~Max초 랜덤 쿨마다 1발. 시작점은 맵 상단 밖(x 랜덤·y<0), 발사각은
  //     +y축(아래) 0° 기준 ±arrowSpreadDeg° 랜덤이고, 매 프레임 arrowGravity로 vy가 늘어
  //     포물선을 그린다(전역 GRAVITY와 분리 — 튜닝용). 데미지 arrowDamage, 패링 가능.
  //   패링 반사: 속도 arrowSpeed×reflectSpeedMult(2배)로 '살아있는 저격수 모서리'를 향해
  //     호밍한다 — 나이아 생존(!naia.sealed) 시 오른쪽 위 나이아, 나이아 봉인 후엔 왼쪽 위
  //     실라. 반사 화살이 그 모서리 보스 hurtbox에 닿으면 sealHits++ — 각 보스 sealHits회
  //     누적 시 봉인(나이아 4 → 발사·파도 중지, 실라 4[누적 8] → 화살 발사 중지).
  //   화살 바닥 착탄: 미패링 화살이 층 표면(stage.floorSurfaces)에 닿으면 층별 mobFloorChance
  //     확률로 소멸 + 잡몹 생성(role "silaMob", HP mobHp). 잡몹은 플레이어와 가로 mobNearX px
  //     이내 근접 시 mobExplodeSize×mobExplodeSize 폭발(dmg mobExplodeDamage, 패링 불가).
  //     폭발 전에 플레이어가 때리면(평타 2 > mobHp) 그냥 소멸한다(폭발 안 함).
  sila: {
    chaseSpeed: 0, attackRangeX: 0, basic: null, special: null, floorPref: 0, stationary: true,
    sila: {
      arrowCdMin: 5, arrowCdMax: 8, arrowSpeed: 340, arrowGravity: 700, arrowSpreadDeg: 65,
      arrowDamage: 1, reflectSpeedMult: 2, sealHits: 4,
      mobFloorChance: 0.25, mobHp: 0.5, mobNearX: 20, mobExplodeSize: 100, mobExplodeDamage: 1,
    },
  },
  // 실라 화살 잡몹(런타임 생성): 정지형 — 추격·공격 안 하고 제자리에서 근접 폭발만 한다
  // (폭발 로직은 projectiles.js updateSilaMobs). 평타 한 대(2 > HP 0.5)에 죽는다.
  silaMob: { chaseSpeed: 0, attackRangeX: 0, basic: null, special: null, floorPref: 0, stationary: true },
  // 나이아(오른쪽 위 모서리 저격수, 화면 밖). 추격·근접 없이(stationary) 제자리에서
  // 물줄기 레이저와 파도를 쏜다(projectiles.js updateNaia). floating이라 중력·충돌 면제.
  //   레이저: 한 번 발동에 laserVolley발을 laserVolleyGap초 간격으로 발사한다. 앞의
  //     발들은 시작점이 맵의 위/왼/오른쪽 변 중 랜덤한 한 점이고, 조준점은 플레이어
  //     중심 ±(aimSpreadX, aimSpreadY) 범위의 랜덤 점이다(빗나갈 수 있음). 마지막 한
  //     발만 슈터(오른쪽 위 모서리)에서 발사 시점 플레이어를 정조준한다. 각 발은
  //     laserTelegraph초 예고(패링 불가·회피 전용) → laserActive초 발사(두께 laserThick
  //     px 띠가 ON). 쿨 laserCd초(발동=볼리 전체), 데미지 laserDamage. 판정은 AABB가
  //     아니라 '점-선분 거리 ≤ laserThick/2'(회전된 띠라서). 레이저가 이프리트에 닿으면
  //     피해(bossHit), 가비아에 닿으면 회복(bossHit) — 대상별 1회.
  //   파도: 매 waveEvery번째 공격은 레이저 대신 파도. 카메라 왼쪽 주의표시 waveWarnTime초
  //     → 왼→오 진행(속도 = 플레이어 이동×waveSpeedMult), 가로 = 맵 가로×waveWidthMult.
  //     waveTickInterval초당 waveDamage 다단히트. 최상층(floor 0) 발판 위에서만 회피.
  //     쿨은 파도가 맵에서 완전히 사라진 뒤에야 시작(주의표시~파도 존재 동안 쿨 정지).
  //   sealed면 발사·파도 모두 중지(봉인 카운터는 실라 단계에서 연결).
  naia: {
    chaseSpeed: 0, attackRangeX: 0, basic: null, special: null, floorPref: 0, stationary: true,
    naia: {
      laserTelegraph: 1.2, laserActive: 1.2, laserCd: 12, laserDamage: 2, laserThick: 40,
      laserVolley: 3, laserVolleyGap: 0.2, aimSpreadX: 350, aimSpreadY: 200, bossHit: 2,
      waveEvery: 3, waveWarnTime: 2, waveSpeedMult: 1.2, waveWidthMult: 3, waveDamage: 1, waveTickInterval: 1.0,
    },
  },
  // ---- 스테이지4(림/셰이디 2인 동시전, 보상=수의) ----
  // 림(추격/강타형): 플레이어 0.8배(160px/s)로 티그식 같은 층 추격(floorPref 0). 일반
  // CHASE(추격+사거리 평타 rimSwing)를 그대로 쓰고, enemy.js updateRimPatterns가 그 위에
  // 쿨 7초 패턴(둘 중 랜덤)을 얹는다.
  //   ① 내려찍기(slam): telegraph초 기 모으기 → 바닥 강타. 강타 순간 '점프하지 않고
  //      지면에 있는'(player.onGround) 플레이어에게 slamDamage + slamStun초 행동불가.
  //      점프로 회피(공중이면 안 맞음). 패링 불가 — 전용 phase로 처리(enemy.attack 미사용).
  //   ② 광역 강타(aoe): 일반 공격 rimAoe(windup 1.2=기 모으기)로 위임 — telegraph·판정·
  //      패링이 전부 기존 파이프라인을 탄다. dmg 2, 림 전방으로만 뻗어 뒤쪽 비피격,
  //      패링 시 플레이어 0.3초 행동불가(rimAoe.parryStun).
  rim: {
    chaseSpeed: 160, attackRangeX: ENEMY_ATTACK_RANGE_X, basic: "rimSwing", special: null, floorPref: 0,
    rim: { cooldown: 7, telegraph: 1.2, slamActive: 0.3, slamDamage: 1, slamStun: 2 },
    subspace: SUBSPACE, // 5%↓ → 아공간 피신(둘 다 생존 중일 때만). enemy.js updateSubspace
  },
  // 셰이디(도주/순간이동형): 일반 CHASE를 쓰지 않고 enemy.js updateShady가 전담한다
  // (추격이 아니라 '도주' — stationary 아님). 플레이어 반대로 fleeSpeed로 달아나며
  // jumpInterval마다 jumpChance로 최대 점프하고, 맵 끝/approachDist 이상 벌어지면
  // 차원문으로 등 뒤 순간이동 평타(shadyBlink)를 친다. gateCooldown초마다 '차원문 난사'
  // 패턴(updateShadyBarrage)을 발동한다.
  //   차원문 난사: gateCount개의 차원문을 플레이어 전/후방 콘(gateConeDeg=±70°, 상·하
  //     40° 쐐기는 자연 제외)·gateDist(60px)에 차례로 연다. 차원문 자체는 '피격 안 되는
  //     순수 이펙트'(히트박스 없음) — gateOpen초 텔레그래프 후, 차원문에서 '검격(공격)'이
  //     생성 시점 플레이어 자리(targetX/Y)를 향해 나온다(gateStrike초 동안 그 회랑이
  //     판정). 검격을 마주 베면 패링(미패링·회랑 안이면 gateDamage), 회랑 밖으로 비키면
  //     회피. 검격 → 즉시 차원문 숨김 → gateGap초 뒤 다음. 누적 gateParryCancel(3)회
  //     패링 시 패턴 즉시 취소 + groggyTime초 그로기(전역 게이지와 무관: groggyDrains=
  //     false). gateCount회 완주 시 맵 최상단에서 거대 무기 낙하(가로 weaponWScale배·
  //     세로 weaponHScale배, 가속도 GRAVITY, dmg weaponDamage, 패링 불가 —
  //     projectiles.js spawnShadyWeapon). 취소되면 낙하 없음.
  shady: {
    chaseSpeed: 0, attackRangeX: ENEMY_ATTACK_RANGE_X, basic: null, special: null, floorPref: 0,
    shady: {
      fleeSpeed: 300, jumpInterval: 0.373, jumpChance: 0.1, approachDist: 500,
      gateCooldown: 13, gateCount: 6, gateOpen: 0.3, gateStrike: 0.15, gateGap: 0.2,
      gateDist: 60, gateConeDeg: 70, gateStrikeHalf: 24,
      gateDamage: 1, gateParryCancel: 3, groggyTime: 3,
      weaponWScale: 5, weaponHScale: 7, weaponDamage: 2,
    },
    subspace: SUBSPACE, // 5%↓ → 아공간 피신(둘 다 생존 중일 때만). enemy.js updateSubspace
  },
};
function aiFor(role) {
  return ENEMY_AI[role] || ENEMY_AI.default;
}

