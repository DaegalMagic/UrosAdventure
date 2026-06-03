// 우로스의 모험 - 게임 부트스트랩
//
// 현재 단계: 플랫포머 물리. 중력 + 좌우 이동 + AABB 타일 충돌 +
// 가변 점프(hold 시간으로 높이 조절) + 더블 점프.
// map.js(STAGES/loadStage/isSolidAt, TILE_SIZE)와 camera.js(Camera)를
// index.html에서 먼저 로드한다.
//
// 입력은 action map(js/input.js의 Input)을 통해 행동 단위로 읽는다. 키 코드는
// 절대 직접 읽지 않는다(리바인딩은 Input.bindings의 문제). 기본값: 방향키=이동,
// X=점프. (대시 Z / 공격 C / 특수 A·S·D·F 는 바인딩만 있고 로직 미연결.)

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// 스테이지/카메라/플레이어/적은 스테이지 씬에 진입할 때 startStage()가 구성한다.
// (타이틀·셀렉트 화면에서는 비어 있어도 되도록 지연 초기화한다.)
let stage = null;
let camera = null;

// ---- 물리 상수 (픽셀/초 기준) ----
const GRAVITY = 1800; // 중력 가속도
const MOVE_SPEED = 200; // 좌우 이동 속도
const MAX_FALL = 900; // 최대 낙하 속도(종단속도)

// 가변 점프: 떼는 시점에 따라 높이가 달라진다.
//   hold ≥ JUMP_HOLD_MAX → 최대 높이 / hold ≤ JUMP_HOLD_MIN → 최소 높이.
// 점프는 "처음에 최대 점프 속도로 솟구치되, 버튼을 빨리 떼면 상승 속도를 깎는"
// 방식으로 구현(대부분의 플랫포머가 쓰는 변조 방식). cut 계수로 잘라낸다.
//
// 층(floor) 설계 기준(한 층 = 80px): 최소 점프로 한 층은 올라가고(min ≥ 80),
// 최대 점프로도 두 층(160px)은 못 올라가야 한다(max < 160). 목표 도달 높이는
// 최소 90px / 최대 150px. 높이 H = JUMP_SPEED²/(2·GRAVITY) 이므로:
//   JUMP_SPEED = √(2·GRAVITY·150) ≈ 735,  JUMP_CUT_MULT = √(90/150) ≈ 0.775.
// (실제 도달 높이는 dt 이산화로 이론값보다 약간 낮아 측정으로 보정한 값이다.)
const JUMP_SPEED = 750; // 최대 점프 초기 상승 속도(→ 최대 높이 ≈ 150px)
const JUMP_HOLD_MIN = 0.1; // 이하로 떼면 최소 점프
const JUMP_HOLD_MAX = 0.3; // 이상 누르면 최대 점프(더 안 높아짐)
const JUMP_CUT_MULT = 0.785; // 최소 점프 시 남기는 상승 속도 비율(→ 최소 높이 ≈ 90px)
const MAX_AIR_JUMPS = 1; // 공중 추가 점프 횟수(더블 점프 → 1)

// 대시: 0.1초 동안 평소 1초치 이동 거리(MOVE_SPEED*1초 = 200px)를 간다.
// → 대시 속도 = MOVE_SPEED * (1 / DASH_TIME) = 평소의 10배. 거리 = 속도*시간 = 200px.
const DASH_TIME = 0.1; // 대시 지속 시간(초)
const DASH_SPEED = (MOVE_SPEED * 1) / DASH_TIME; // 2000px/s

// (공격 정의/적 AI 표 → js/data.js 로 분리)
// 그로기(groggy): 패링하면 적의 '그로기 게이지'가 차고, 최대치를 넘으면(오버) 적이
// 일정 시간 무방비 상태가 된다. 게이지는 패링 1회당 그 공격의 가중치만큼 오른다
// (평타 +1, 루포 블링크 등 +2). (wiki player-core-mechanics §5 /
// boss-state-and-encounter-mechanics §B / enemy-ai-and-locomotion §E)
//   - GROGGY_GAUGE_MAX: wiki에 수치 미지정 → 임의로 3 가정(상수로 조정 가능).
//     게이지가 이 값 '이상'이 되면 그로기 진입. 오버분은 버리고 0으로 초기화한다
//     (예: 최대 3에서 +2로 4가 되면 그로기 + 게이지 0; −최대로 1 남기지 않는다).
//   - GROGGY_TIME: 그로기 지속 시간. 요구사항대로 5초.
// 그로기 동안 적은 공격하지 않고(주기/히트박스 정지), 끝나면 평소로 복귀한다.
const GROGGY_GAUGE_MAX = 3; // 그로기 게이지가 이 값 이상이면 그로기 진입(가정)
const GROGGY_TIME = 5; // 그로기 지속 시간(초)

// 사료스탕스(1번 보스, 베니/루포/티그 3인 동시전)의 3인 연동 상수.
// 연동 규칙은 wiki boss-state-and-encounter-mechanics §D(devour-ripple)에서 옴:
//   - 티그 포식 → 남은 둘 영구 그로기
//   - 베니/루포 포식 → 티그 폭주(+ 남은 하나 그로기)
//   - 베니+루포 둘 다 포식 → 티그 무적 폭주 + 자기 체력 자가 감소
// 폭주는 공격 주기를 줄여 더 자주 휘두르게 한다(수치는 임의, 조정 가능).
const BERSERK_INTERVAL_MULT = 0.5; // 폭주 시 공격 주기 배율(작을수록 빠름)
const TIG_SELF_DRAIN = 0.5; // 무적 폭주 티그가 초당 잃는 체력(HP/초)

// 히트스톱: 타격/패링이 닿는 순간 게임을 짧게 정지(시간 배율 0)해 타격감을 준다.
// 시간 제어 서비스(TimeControl, wiki §6)의 freeze 사례이며, 렌더는 계속 돌아
// 멈춘 장면이 그대로 보인다. 패링은 메인 메커닉이라 평타보다 살짝 길게 준다.
const PARRY_HIT_STOP = 0.07; // 패링 성사 시 정지(초) ≈ 4프레임
const ATTACK_HIT_STOP = 0.05; // 평타 적중 시 정지(초) ≈ 3프레임
const POWER_STRUGGLE_HIT_STOP = 0.12; // 힘겨루기 승리(충격파) 시 정지 — 메인 연출이라 길게
const POWER_STRUGGLE_ZOOM = 3.5; // 힘겨루기 진입 시 줌 배율(클로즈업 연출)

// 플레이어 체력: 적 공격에 맞으면 그 공격의 데미지만큼 깎이고, 0 이하면 사망한다.
// HP·데미지는 정수가 아니어도 된다(레이저 부분피격 등 소수점 데미지 대비).
// 사망 처리는 지금은 "조작 불가 + 초록색"까지만(리스폰/리셋은 이후 단계).
const PLAYER_MAX_HP = 5;

// ---- 전투 밸런싱 (wiki: 정석 처치 ~2분 목표) ----
// 플레이어 평타 1회 데미지. 평타 DPS ≈ 2.4(active 0.15 + recovery 0.25 = 0.4초/타).
// 보스 HP는 이 DPS와 "정석 처치 ~2분" 목표로 역산했다. 실전 가동률(회피·이동·그로기
// 대기) ~55% + 그로기 구간 섞임 → 실효 DPS ≈ 1.4 → 120초에 ≈ 180 HP.
//   - 단독 보스(BOSS_HP_SOLO): 220 → 시뮬상 정석 ~120초(2분).
//   - 3인 동시전 각자(BOSS_HP_TRIO): 80 (셋 합 240이지만 포식 연동으로 실제 처치는
//     더 빠름 — 총 HP는 '정답 순서를 모를 때'의 페널티 역할).
const PLAYER_ATTACK_DAMAGE = 1;
const BOSS_HP_SOLO = 220; // 단독 보스 기본 HP(정석 ~2분)
const BOSS_HP_TRIO = 80; // 사료스탕스 3인 각자 HP
// 그로기(누적/영구) 중인 적이 받는 데미지 배수. "패링→그로기→몰아치기"가 평타
// 난타보다 이득이 되게 만드는 핵심 수치(패링 게임의 정답 루트 보상).
const GROGGY_DAMAGE_MULT = 1.5;

// ---- 캐릭터 박스 크기 ----
// 이동(충돌) 박스: 타일/벽/바닥과의 충돌·점프에 쓰는 물리 박스. 엔티티 위치
// (x, y, w, h)는 항상 이 박스를 가리킨다. 트릭컬식 SD 비율(3:4)에 맞춰 45x60
// (화면 세로의 약 10% ≈ 세로 3타일). 타일 크기와는 독립이다.
const PLAYER_W = 45;
const PLAYER_H = 60;
const ENEMY_W = 45;
const ENEMY_H = 60;

// 피격(hurtbox) 박스: 상대 공격에 '맞는' 판정에만 쓰는 박스. 이동 박스와 분리해
// 두어, 조작감(이동 박스)과 피격 판정(이 박스)을 따로 튜닝할 수 있다. getHurtbox()가
// 이동 박스 기준 '가로 중앙 + 하단(발) 정렬'로 파생한다. 지금은 이동 박스와 같은
// 45x60이지만, 아래 값만 바꾸면 즉시 이동 박스와 독립적으로 조정된다.
const PLAYER_HURT_W = 45;
const PLAYER_HURT_H = 60;
const ENEMY_HURT_W = 45;
const ENEMY_HURT_H = 60;

// 플레이어는 startStage()에서 매 스테이지마다 새로 만든다(spawn 위치 반영).
let player = null;
function makePlayer(stage) {
  // 가로: 스폰 타일 중심에 박스 중심을 맞추되, 박스가 맵 밖으로 나가지 않게
  // clamp한다(스폰이 맵 가장자리여도 안전). 세로: 발(박스 하단)을 스폰 타일의
  // 바닥에 맞춰, 캐릭터 크기를 바꿔도 곧바로 바닥에 서도록 한다.
  const spawnX = stage.spawn ? stage.spawn.x : canvas.width / 2;
  const spawnBottom = stage.spawn
    ? stage.spawn.y + TILE_SIZE / 2
    : canvas.height / 2 + PLAYER_H / 2;
  let x = spawnX - PLAYER_W / 2;
  x = Math.max(0, Math.min(x, stage.widthPx - PLAYER_W));
  return {
    x,
    y: spawnBottom - PLAYER_H,
    w: PLAYER_W,
    h: PLAYER_H,
    // 피격 박스 크기(이동 박스와 별개). getHurtbox가 이 값으로 파생한다.
    hurt: { w: PLAYER_HURT_W, h: PLAYER_HURT_H },
    vx: 0,
    vy: 0,
    onGround: false,
    onOneWay: false, // 지금 발 딛고 선 게 원웨이 발판인가(드롭스루 가능 여부)
    facing: 1, // 1 = 오른쪽, -1 = 왼쪽
    // 점프 상태(물리만. "막 눌렸나"는 Input.justPressed가 담당)
    jumpTime: 0, // 이번 점프에서 키를 누른 누적 시간
    airJumps: 0, // 이번 공중 체류에서 쓴 추가 점프 수
    jumpCutApplied: false, // 이번 점프에서 cut(상승 깎기)을 이미 적용했는가
    dropThrough: 0, // >0이면 그 시간(초)만큼 원웨이 발판을 무시(드롭스루)
    dashTime: 0, // >0이면 대시 중. 남은 대시 시간(초)
    dashDir: 1, // 이번 대시의 진행 방향(1/-1)
    attack: null, // 현재 진행 중인 공격 spec(ATTACKS의 항목). null이면 비공격
    attackElapsed: 0, // 현재 공격 시작부터 경과 시간(초). phase 판정에 쓰임
    attackDir: 1, // 이번 공격의 방향(1/-1) — 발동 시점의 facing 고정
    attackHits: new Set(), // 이번 공격(히트박스 1회)에서 이미 맞춘 적들(중복 타격 방지)
    hp: PLAYER_MAX_HP, // 남은 체력. 0이면 사망
    vulnTime: 0, // >0이면 받는 피해 2배 디버프 중(비비 #2). 남은 시간(초)
    staggerTime: 0, // >0이면 경직 중(조작 불가). 가비아 무적 대상을 때리면 걸린다
    dead: false, // true면 사망 상태(조작 불가 + 초록색 렌더)
    anim: makeAnimator(), // 스프라이트 애니메이션 재생 상태(에셋 없으면 폴백)
  };
}

// 적: CHASE→ATTACK→RECOVER 상태 기계로 플레이어를 추격하다 사거리 안에서 공격한다
// (updateEnemies). facing은 매 프레임 플레이어 쪽으로 갱신한다(마주봄 판정 + 추격 방향).
// parried는 "이번 적 공격을 이미 패링했는가"(적 공격 1회당 패링 1번 규칙).
// 인자는 '발(박스 하단 중앙)' 기준 좌표 — 크기를 바꿔도 같은 발 위치에 서도록.
// role/group은 사료스탕스 3인 연동(devour-ripple)용: role은 누구인지("benny"/
// "lupo"/"tig"), group은 같은 인카운터의 적 배열(자기 포함)로 startStage가 연결한다.
// 일반 표적 적은 role=null, group=null이라 연동 로직을 타지 않는다.
// AI(이동·공격 선택)는 role로 ENEMY_AI 표에서 가져온다(aiFor). 적은 CHASE→ATTACK→
// RECOVER 상태 기계로 움직인다(updateEnemies).
// size: 몸/피격 박스 크기 오버라이드(없으면 기본 적 크기). 다야처럼 키가 다른 보스를
// 위한 자리 — { w, h, hurtW, hurtH } 중 준 값만 덮어쓴다(발 위치는 이 크기로 역산).
function makeEnemy(footX, footY, role = null, hp = BOSS_HP_SOLO, defense = 0, size = {}) {
  const ai = aiFor(role);
  const w = size.w != null ? size.w : ENEMY_W;
  const h = size.h != null ? size.h : ENEMY_H;
  const hurtW = size.hurtW != null ? size.hurtW : ENEMY_HURT_W;
  const hurtH = size.hurtH != null ? size.hurtH : ENEMY_HURT_H;
  return {
    x: footX - w / 2,
    y: footY - h,
    w,
    h,
    // 피격 박스 크기(이동 박스와 별개). getHurtbox가 이 값으로 파생한다.
    hurt: { w: hurtW, h: hurtH },
    hp, // 최대 체력(데이터). 0 이하면 사망/포식
    maxHp: hp, // 초기 체력 보존(체력바 비율 등에 쓸 수 있게)
    // 방어력: 받는 피해에 (1 - defense) 배수를 건다(hitEnemy). 범위는 1 ~ -무한대.
    //   - 1  → 배수 0   = 무피해(다야의 '극단적으로 단단함' 표현 가능)
    //   - 0  → 배수 1   = 평소 피해(기본값)
    //   - 음수 → 배수 >1 = 받는 피해 증폭(비비 단검 패링으로 다야 방어력을 깎는 연동)
    // 동적으로 바뀐다(포식·패링 연동). selfDrain 같은 '공격이 아닌' 피해엔 적용 안 함.
    defense, // 받는 피해 배수를 정하는 값(클램프 상한 1)
    alive: true,
    facing: -1, // 1=오른쪽, -1=왼쪽. 매 프레임 플레이어 쪽으로 갱신됨
    // 세로 물리(중력/착지). x는 chaseStep/dash가 직접 옮기고, y만 applyEnemyPhysics가
    // 플레이어와 같은 충돌 시스템(resolveAxis)으로 처리한다. dropThrough/onOneWay/
    // airJumps는 원웨이 발판 착지·드롭스루에 쓰인다(플레이어와 공용 필드).
    vy: 0, // 세로 속도(px/s). 점프 시 음수, 중력으로 증가
    onGround: false, // 이번 프레임 바닥/발판에 닿아 있는가
    onOneWay: false, // 원웨이 발판 위에 서 있는가
    airJumps: 0, // 공중 점프 사용 횟수(착지 시 0으로)
    dropThrough: 0, // >0이면 원웨이 발판을 통과해 내려가는 중(초)
    ai, // 이 적의 AI 설정(chaseSpeed/attackRangeX/basic/special)
    state: "chase", // FSM 상태: "chase"(추격) | "attack"(공격 중) | "recover"(후딜)
    recoverTime: 0, // RECOVER 상태에서 다시 추격하기까지 남은 시간(초)
    approaching: false, // 세로 추격: 근접 모드인가(true면 플레이어 층으로 강제 맞춤)
    vertTimer: 0, // 층 이동(점프/드롭) 시도까지 남은 시간(초). 0이면 이번에 시도
    specialCooldown: 0, // 스페셜 재사용까지 남은 시간(0이면 사용 가능). >0이면 대기
    attack: null, // 현재 진행 중인 공격 spec(ATTACKS의 항목). null이면 비공격
    attackElapsed: 0, // 현재 공격 시작부터 경과 시간(초). phase 판정에 쓰임
    attackDir: -1, // 이번 공격의 방향(발동 시 facing 고정)
    dashDir: 1, // 돌진(kind="dash") 진행 방향(발동 시 facing 고정)
    dashSpeed: 0, // 이번 돌진 속도(px/s). 발동 시 '등 뒤 거리÷active'로 역산
    blinkPending: false, // 블링크(kind="blink") 예약: windup 종료 시 등 뒤로 텔레포트
    parried: false, // 이번 공격(active 윈도)에서 이미 패링당했는가
    hitPlayer: false, // 이번 공격 윈도에서 이미 플레이어를 때렸는가(스윙당 1회 피해)
    groggyGauge: 0, // 그로기 게이지(패링으로 적립, 최대치 오버 시 그로기 + 0 초기화)
    groggyTime: 0, // >0이면 그로기 중. 남은 그로기 시간(초)
    groggyDrains: true, // 그로기 종료 시 게이지 드레인 여부(누적=true, 공격차단=false)
    // ---- 사료스탕스 3인 연동 상태 ----
    role, // "benny" | "lupo" | "tig" | null(일반 표적)
    group: null, // 같은 인카운터의 적 배열(자기 포함). startStage가 연결
    berserk: false, // 폭주: 공격 주기가 빨라진다(아군 포식/사망 트리거)
    invincible: false, // 무적: 피해를 받지 않는다(무적 폭주 변형)
    selfDrain: 0, // >0이면 초당 이 값만큼 스스로 체력이 깎인다(무적 폭주)
    permaGroggy: false, // 영구 그로기: 타이머 없이 계속 무방비(공격 안 함)
    floating: false, // 화면 밖 모서리 저격수(스테이지3 실라/나이아): 중력·충돌 면제
    anim: makeAnimator(), // 스프라이트 애니메이션 재생 상태(에셋 없으면 폴백)
  };
}
let enemies = []; // startStage()에서 스테이지별로 채운다
let hittables = []; // 적이 아닌 피격 가능 오브젝트(떨군 단검 등). startStage()에서 채운다

// 스테이지(전투) 씬 진입 시: 맵·카메라·플레이어·적을 새로 구성한다. 같은 스테이지를
// 다시 들어와도 깨끗한 초기 상태가 되도록 모두 새로 만든다(리스폰/재시작도 이걸 쓴다).
function startStage(name) {
  stage = loadStage(name);
  camera = new Camera(canvas.width, canvas.height);
  player = makePlayer(stage);
  hittables = []; // 기본은 비움(스테이지 2 분기에서 떨군 단검을 채운다)
  resetProjectiles(); // 투사체/시차 발사 대기열 초기화(projectiles.js)
  // 사료스탕스(1번)는 베니/루포/티그 3인 동시전이라 셋을 가운데 땅 위에 세우고
  // 서로를 group으로 묶어 연동(포식/힘겨루기)이 형제들에게 전파되게 한다.
  // 그 외 스테이지는 아직 임시 표적 적 하나(보스 로직은 스테이지별로 이후 추가).
  if (name === FIRST_STAGE) {
    // 베니/루포/티그. 각자의 AI(평타·스페셜)는 role로 ENEMY_AI에서 가져온다.
    // 베니는 힘겨루기 쿨이 차면 평타 대신 힘겨루기 공격을 쓴다(rangeReplace).
    // 4층 맵 초기 배치(발 y = 층 표면): 베니 1층(500), 티그 2층(420), 루포 3층(340).
    // 각 적의 선호 층(베니 아래·티그 같음·루포 위)을 초기 위치로도 반영한다(세로
    // 선호 추격 AI는 STEP4에서 — 지금은 배치만). x는 해당 층 발판 위로 잡는다.
    const benny = makeEnemy(700, 500, "benny", BOSS_HP_TRIO); // 1층 바닥(어디든 OK)
    const tig = makeEnemy(720, 420, "tig", BOSS_HP_TRIO); // 2층 발판(col31~43) 위
    const lupo = makeEnemy(900, 340, "lupo", BOSS_HP_TRIO); // 3층 발판(col41~54) 위
    enemies = [benny, lupo, tig];
    for (const e of enemies) e.group = enemies; // 서로(자기 포함)를 참조
  } else if (name === "스테이지 2") {
    // 다야/비비/키디언(2번). 지금은 다야 단독 배치 — 방어력·크기·정지형 확인용.
    // 비비/키디언은 이후 단계에서 추가한다(group 연동도 그때 연결).
    // 다야: 맨 오른쪽 1층 바닥(발 y=500)에 근엄하게 앉는다. 키는 플레이어의 1.3배
    // (가로도 비례), 방어력 0.99(거의 무피해 탱커). x는 맵 오른쪽 끝 근처.
    const dayaH = Math.round(PLAYER_H * 1.3); // 78
    const dayaW = Math.round(PLAYER_W * 1.3); // 59
    const dayaX = stage.widthPx - dayaW / 2 - 40; // 오른쪽 끝에서 약간 안쪽
    // 체력은 티그(3인 HP)의 3배. 방어력 0.99라 깎기 전엔 사실상 불사 — 단검으로
    // 방어력을 내린 뒤에야 이 체력이 의미를 갖는다.
    const daya = makeEnemy(dayaX, 500, "daya", BOSS_HP_TRIO * 3, 0.99, {
      w: dayaW,
      h: dayaH,
      hurtW: dayaW,
      hurtH: dayaH,
    });
    // 비비: 돌아다니며 근접 시 휘두르는 교란자(1층 중앙쯤에서 시작). 다야와 group으로
    // 묶어 이후 포식 연동(비비 포식 → 다야 방어력 최저)을 붙일 수 있게 한다.
    const bibi = makeEnemy(700, 500, "bibi", BOSS_HP_TRIO);
    // 키디언: 추격·근접 없이 제자리에서 가로/세로 직선 공격을 쏘는 슈터(projectiles.js
    // lineShooter). 라인은 발동 시점의 '플레이어 위치'를 관통하므로 키디언의 자리 자체는
    // 시각적 출처일 뿐 — 안 떨어지게 1층 바닥(꽉 찬 발판) 왼쪽 끝에 세운다(다야와 대치).
    // HP가 없어 defense=1로 평타를 무효화한다(라인 패링 5회 봉인 = 처치). hp는 형식상 큰값.
    const kidian = makeEnemy(140, 500, "kidian", BOSS_HP_TRIO * 99, 1);
    enemies = [daya, bibi, kidian];
    for (const e of enemies) e.group = enemies;
    // 떨군 단검은 이제 비비가 패링당할 때 생성한다(onParry, dropsDaggerOnParry).
    // 초기에는 비워 둔다(hittables는 위에서 이미 []).
  } else if (name === "스테이지 3") {
    // 스테이지3(실라/나이아/이프리트/가비아, 보상=불칼). 이프리트(1단계)·가비아(2단계)는
    // 실제 AI가 붙었고, 실라·나이아는 아직 정지형 더미(3·4단계에서 붙인다).
    // 클리어 조건 = 이프리트 + 가비아 HP 0. 실라·나이아는 봉인만 될 뿐 죽지 않는다.
    //   - 이프리트(추격형)/가비아(카이팅형): HP 80(BOSS_HP_TRIO). 1층 바닥(발 y=500) 오른쪽에 나란히.
    //   - 실라/나이아: 화면 밖 위 모서리 저격수(왼쪽/오른쪽). floating으로 떠 있어
    //     중력·충돌을 받지 않고, HP가 없어(defense=1로 평타 무효) 봉인으로만 무력화된다.
    const ifrit = makeEnemy(900, 500, "ifrit", BOSS_HP_TRIO);
    const gabia = makeEnemy(1100, 500, "gabia", BOSS_HP_TRIO);
    const sila = makeEnemy(-60, 40, "sila", BOSS_HP_TRIO * 99, 1); // 왼쪽 위 화면 밖
    const naia = makeEnemy(stage.widthPx + 60, 40, "naia", BOSS_HP_TRIO * 99, 1); // 오른쪽 위
    sila.floating = true;
    naia.floating = true;
    enemies = [ifrit, gabia, sila, naia];
    for (const e of enemies) e.group = enemies; // 서로(자기 포함) 참조(이후 연동용)
  } else if (name === "스테이지 4") {
    // 스테이지4(림/셰이디 2인 동시전, 보상=수의). 0단계(맵+뼈대)에선 둘 다 AI 없는
    // 정지형 더미(stationary)다 — 림(추격/강타)·셰이디(도주/순간이동)·아공간 연동은
    // 이후 단계에서 붙인다. 클리어 조건 = 림 + 셰이디 HP 0(아공간 연동 단계에서 연결).
    // HP는 산정값 우선 100(BOSS_HP_TRIO 80과 SOLO 220 사이, 2인+아공간 복귀 보정). 1층 바닥에 배치.
    const STAGE4_HP = 100;
    const rim = makeEnemy(900, 500, "rim", STAGE4_HP); // 림: 1층 바닥 왼쪽-중앙
    const shady = makeEnemy(1100, 500, "shady", STAGE4_HP); // 셰이디: 1층 바닥 오른쪽
    enemies = [rim, shady];
    for (const e of enemies) e.group = enemies; // 서로(자기 포함) 참조(아공간 연동용)
  } else {
    enemies = [makeEnemy(510, 580)]; // 임시: 표적 적 하나(발 기준 좌표)
  }
  parryFlash = 0; // 직전 스테이지의 연출 잔재 제거
  powerStruggle = { active: false, enemy: null, gauge: 0, elapsed: 0, nextDot: 0 }; // 힘겨루기 상태 초기화
  ZoomControl.snap(1); // 줌 즉시 원복(직전 연출 잔재 제거)
  ScreenShake.snap(); // 화면 흔들림 잔재 제거
}

// 두 AABB({x,y,w,h})가 겹치는가.
function aabbOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

// 드롭스루 발동 시, 원웨이를 무시할 시간. 한 타일을 확실히 통과할 만큼 짧게.
const DROP_THROUGH_TIME = 0.18;

// ---- 입력 ----
// 키 리스너/스냅샷은 모두 js/input.js의 Input이 담당한다. 여기서는 행동만 읽는다.

// 새 점프를 시작한다(지상 점프 또는 공중 추가 점프). entity는 플레이어/적 공용.
// jumpTime/jumpCutApplied는 플레이어의 가변 점프용 필드 — 적은 안 써도 무방하다.
function startJump(entity = player) {
  entity.vy = -JUMP_SPEED;
  entity.jumpTime = 0;
  entity.jumpCutApplied = false;
}

// 엔티티의 피격판정 박스(box={x,y,w,h})와 공격 range로 히트박스(월드 AABB)를 만든다.
//   가로: box.w를 포함해 dir 방향으로 총 range.w. 오른쪽이면 [x,x+W], 왼쪽이면 [x+w-W,x+w].
//   세로: range.h(null이면 box.h 그대로). range.offsetY만큼 box 윗변에서 아래로 옮긴다.
// 플레이어와 적이 같은 히트박스 모델을 공유한다(패링은 이 둘의 겹침으로 판정).
function makeAttackHitbox(box, dir, range) {
  const w = range.w;
  const h = range.h != null ? range.h : box.h;
  const x = dir > 0 ? box.x : box.x + box.w - w;
  const y = box.y + (range.offsetY || 0);
  return { x, y, w, h };
}

// 공격 spec의 전체 길이(windup+active+recovery).
function attackDuration(spec) {
  return spec.windup + spec.active + spec.recovery;
}

// 이 공격을 패링했을 때 그로기 게이지가 오르는 양. spec.parryWeight가 없으면 1.
function parryGroggyGain(spec) {
  return spec.parryWeight != null ? spec.parryWeight : 1;
}

// 경과 시간(elapsed)이 active 구간 안인가 — 이때만 타격 히트박스가 뜬다.
function isAttackActive(spec, elapsed) {
  return elapsed >= spec.windup && elapsed < spec.windup + spec.active;
}

// 경과 시간이 windup(예고) 구간 안인가 — 타격 전, 텔레그래프를 보여줄 구간.
function isAttackWindup(spec, elapsed) {
  return elapsed < spec.windup;
}

// 엔티티의 피격(hurtbox) AABB(월드 좌표). 이동 박스({x,y,w,h})에 대해 '가로 중앙 +
// 하단(발) 정렬'로 파생한다. entity.hurt가 없으면 이동 박스를 그대로 피격 박스로
// 쓴다(하위 호환). 지금은 hurt 크기를 이동 박스와 같게 두지만, hurt.w/h만 바꾸면
// 피격 판정 크기를 이동 박스와 독립적으로 조정할 수 있다(머리 위로 솟은 SD 비율
// 등). 공격 히트박스의 세로/가로 기준도 이 박스를 따른다.
function getHurtbox(entity) {
  const h = entity.hurt;
  if (!h) return { x: entity.x, y: entity.y, w: entity.w, h: entity.h };
  return {
    x: entity.x + (entity.w - h.w) / 2,
    y: entity.y + (entity.h - h.h),
    w: h.w,
    h: h.h,
  };
}

// 현재 플레이어 공격 히트박스. active 구간이 아니면(공격 안 함/windup/recovery) null.
function getAttackHitbox() {
  const a = player.attack;
  if (!a || !isAttackActive(a, player.attackElapsed)) return null;
  return makeAttackHitbox(getHurtbox(player), player.attackDir, a.range);
}

// 현재 적 공격 히트박스. active 구간이 아니면 null. 세로/가로 기준은 피격 박스.
//   - 일반 공격: 발동 방향으로 뻗는 range 히트박스(제자리 휘두르기).
//   - 돌진(kind="dash"): 돌진 이동 그 자체가 타격이므로 '적 몸통(피격박스)'을
//     히트박스로 쓴다. 적이 active 동안 이동하면 히트박스도 같이 이동한다.
function getEnemyAttackHitbox(enemy) {
  const a = enemy.attack;
  if (!a || !isAttackActive(a, enemy.attackElapsed)) return null;
  if (a.kind === "dash") return getHurtbox(enemy); // 돌진 = 몸통 히트박스
  return makeAttackHitbox(getHurtbox(enemy), enemy.attackDir, a.range);
}

// 패링 검출(wiki player-core-mechanics §5):
//   플레이어 공격 히트박스 ∩ 적 공격 히트박스 + 서로 마주봄 → 패링 성사.
//   적 공격 1회당 1번만(enemy.parried). 그로기/히트스톱은 이후 단계.
let parryFlash = 0; // 패링 연출용: >0인 동안 화면에 플래시

// 힘겨루기 상태(전역). active면 힘겨루기 진행 중(연타 미니게임).
//   gauge: 현재 게이지(연타로 +1, 자연 감소로 내려감). MAX 도달=승리, 0=패배.
//   elapsed: 진입 후 경과 시간(초). 자연 감소 가속 곡선 + 짤딜 타이밍의 기준.
//   nextDot: 다음 짤딜(체력 -1)이 터질 시점(초). 첫 발생 후 INTERVAL씩 밀린다.
let powerStruggle = { active: false, enemy: null, gauge: 0, elapsed: 0, nextDot: 0 };

// 힘겨루기 미니게임 수치(줄다리기). 게이지는 GAUGE_START에서 시작해 연타로 오르고
// 자연 감소로 내려간다. MAX에 닿으면 승리, 0이면 패배.
const POWER_STRUGGLE_GAUGE_START = 5; // 진입 시 게이지(중간에서 시작)
const POWER_STRUGGLE_GAUGE_MAX = 10; // 이 값에 닿으면 승리
const POWER_STRUGGLE_GAUGE_PER_TAP = 1; // 연타 1회당 게이지 증가
// 자연 감소(= 적이 미는 힘): CALM_TIME(2초)까지는 BASE로 잔잔하다가, 그 후
// DOUBLE_TIME(0.5초)마다 2배로 매끄럽게(계단이 아니라 지수 곡선) 가속한다.
//   rate(t) = BASE * 2^((t - CALM_TIME) / DOUBLE_TIME)   (t > CALM_TIME)
// 시간을 끌수록 미는 힘이 폭증하므로 초반에 결판내야 한다.
const POWER_STRUGGLE_DECAY_BASE = 1; // 잔잔 구간 초당 감소
const POWER_STRUGGLE_DECAY_CALM_TIME = 2; // 잔잔 유지 시간(초)
const POWER_STRUGGLE_DECAY_DOUBLE_TIME = 0.5; // 감소율이 2배 되는 주기(초)
const POWER_STRUGGLE_LOSE_DAMAGE = 1; // 패배 시 입는 피해(체력)
// 짤딜(DoT): 게이지(공방)와 별개의 시간 압박. 진입 후 DOT_START부터 DOT_INTERVAL마다
// 체력이 1씩 깎인다 — 끌수록 체력이 닳으니 빨리 결판내야 한다.
const POWER_STRUGGLE_DOT_START = 2; // 첫 짤딜 시점(초)
const POWER_STRUGGLE_DOT_INTERVAL = 0.5; // 이후 짤딜 간격(초)

// 충격파(힘겨루기 승리) 연출 = 화면 흔들림.
const SHOCKWAVE_SHAKE_MAG = 12; // 흔들림 강도(px)
const SHOCKWAVE_SHAKE_TIME = 0.4; // 흔들림 지속(초)

// (시간/줌/흔들림 서비스 → js/effects.js 로 분리)
// (패링/힘겨루기/플레이어 피해 → js/combat.js 로 분리)
// (적 AI/이동: 추격·세로 층 추격·CHASE→ATTACK→RECOVER FSM·돌진/블링크 → js/enemy.js 로 분리)
// (렌더: 맵·골·적·플레이어·히트박스·텔레그래프·UI → js/render.js 로 분리)
function update(dt) {
  // --- 사망: 조작 불가 ---
  // 입력(이동/대시/공격/점프)을 일절 받지 않는다. 다만 바닥에 안착하도록 중력·충돌은
  // 적용하고, 세계가 멈추지 않도록 적 갱신은 계속 돌린다. (리스폰/리셋은 이후 단계)
  if (player.dead) {
    player.vx = 0;
    player.vy += GRAVITY * dt;
    if (player.vy > MAX_FALL) player.vy = MAX_FALL;
    moveAndCollide(player, dt);
    updateEnemies(dt);
    updateProjectiles(dt); // 사망 후에도 단검은 계속 난다(내부가 !player.dead로 가드 → 통과)
    updateAnimations(dt); // 사망 애니 + 적 애니 계속 진행
    if (parryFlash > 0) parryFlash -= dt;
    return;
  }

  // --- 힘겨루기: 진행 중이면 연타 미니게임만 처리하고 일반 게임플레이는 멈춘다 ---
  if (powerStruggle.active) {
    updatePowerStruggle(dt);
    if (parryFlash > 0) parryFlash -= dt;
    return;
  }

  // 받는 피해 2배 디버프(비비 #2) 타이머 감소.
  if (player.vulnTime > 0) player.vulnTime = Math.max(0, player.vulnTime - dt);
  // 경직(가비아 무적 대상 가격) 타이머 감소.
  if (player.staggerTime > 0) player.staggerTime = Math.max(0, player.staggerTime - dt);

  // 포식 윈드업(0.3초) 동안 행동 불가: 이동·대시·점프·드롭스루·새 공격 입력을 막는다.
  // 가비아 무적을 때려 경직 중일 때도 똑같이 모든 입력을 막는다(경직).
  // (공격 파이프라인 진행과 중력·충돌 물리는 계속 — 아래에서 입력만 게이트한다.)
  const actionLocked =
    (player.attack === ATTACKS.devour && player.attackElapsed < ATTACKS.devour.windup) ||
    player.staggerTime > 0;

  // --- 좌우 이동 ---
  let dir = 0;
  if (!actionLocked) {
    if (Input.isDown("left")) dir -= 1;
    if (Input.isDown("right")) dir += 1;
  }
  player.vx = dir * MOVE_SPEED;
  if (dir !== 0) player.facing = dir;

  // --- 대시 ---
  // 새로 누르면(엣지) 바라보는 방향으로 대시 시작. 대시 중에는 좌우 입력을
  // 무시하고 vx를 대시 속도로 강제한다. (재발동은 대시가 끝난 뒤에만.)
  if (!actionLocked && Input.justPressed("dash") && player.dashTime <= 0) {
    player.dashTime = DASH_TIME;
    player.dashDir = player.facing;
  }
  if (!actionLocked && player.dashTime > 0) {
    // 이번 프레임에 실제로 대시할 시간(마지막 프레임은 남은 시간만큼만)을 dt로
    // 환산해 vx를 정한다. 이렇게 하면 dt가 들쭉날쭉해도 총 이동거리가 정확히
    // DASH_SPEED * DASH_TIME = 200px가 된다(이동은 moveAndCollide의 vx*dt).
    const dashStep = Math.min(dt, player.dashTime);
    player.vx = (player.dashDir * DASH_SPEED * dashStep) / dt;
    player.dashTime -= dt;
  }

  // --- 검 공격 ---
  // 새로 누르면(엣지) 바라보는 방향으로 공격을 시작한다. 공격은 windup→active→
  // recovery로 전개되고(active 구간에만 히트박스가 뜸), 재발동은 공격이 완전히
  // 끝난 뒤에만. 방향은 발동 시점의 facing으로 고정한다.
  if (!actionLocked && Input.justPressed("attack") && !player.attack) {
    player.attack = ATTACKS.playerSlash;
    player.attackElapsed = 0;
    player.attackDir = player.facing;
    player.attackHits.clear(); // 새 공격 시작 → 맞춘 적 기록 초기화
  }
  // 포식(S): 평타와 같은 공격 파이프라인을 쓰되 devour 스펙(넓은 범위·0.3초 예고·
  // 그로기 적 즉시 포식)을 단다. (S는 이후 '선택된 보물스킬 사용'도 겸한다 — 보물
  // 시스템이 붙으면 여기서 보물스킬 발동과 분기한다.)
  if (!actionLocked && Input.justPressed("treasureUse") && !player.attack) {
    player.attack = ATTACKS.devour;
    player.attackElapsed = 0;
    player.attackDir = player.facing;
    player.attackHits.clear();
    player.dashTime = 0; // 대시 중 포식 시작 시 대시 취소(윈드업 잠금 후 재개 방지)
  }
  if (player.attack) {
    player.attackElapsed += dt;
    if (player.attackElapsed >= attackDuration(player.attack)) {
      player.attack = null; // recovery까지 끝 → 공격 종료(재발동 가능)
    }
    // body-hit 처리는 적 갱신/패링 검출 뒤로 미룬다(아래 참고): 같은 스윙에서
    // 패링이 먼저 성사되면 그 적은 body-hit에서 제외되어야 하기 때문.
  }

  // --- 점프 입력 처리 (드롭스루 / 가변 점프 / 더블 점프) ---
  const holdingJump = Input.isDown("jump");
  const jumpPressed = Input.justPressed("jump"); // 엣지 검출은 Input이 담당
  const holdingDown = Input.isDown("down");

  if (jumpPressed && !actionLocked) {
    if (player.onGround && holdingDown) {
      // 아래 + 점프 = 드롭스루 시도. 원웨이 발판 위에서만 실제로 뚫고 내려가고,
      // 맨바닥/땅 위에서는 아무 일도 안 한다(일반 점프도 발동하지 않음).
      if (player.onOneWay) {
        player.dropThrough = DROP_THROUGH_TIME;
        player.onGround = false;
      }
    } else if (player.onGround) {
      startJump();
      player.airJumps = 0;
    } else if (player.airJumps < MAX_AIR_JUMPS) {
      startJump();
      player.airJumps++;
    }
  }

  // 드롭스루 타이머 감소
  if (player.dropThrough > 0) player.dropThrough -= dt;

  // 상승 중 누른 시간을 적산하다가, 키를 떼거나 최소 보장시간을 넘기면
  // 그 시점까지의 hold로 점프 높이를 확정(짧게 떼면 상승 속도를 깎는다).
  if (player.vy < 0 && !player.jumpCutApplied) {
    if (holdingJump) {
      player.jumpTime += dt;
      // 최대 hold를 넘기면 더는 깎을 일이 없으니 확정.
      if (player.jumpTime >= JUMP_HOLD_MAX) player.jumpCutApplied = true;
    } else {
      // 키를 뗀 순간: hold 시간으로 최소~최대 사이를 보간해 상승 속도를 줄인다.
      const t = player.jumpTime;
      let keep; // 남길 상승 속도 비율
      if (t <= JUMP_HOLD_MIN) keep = JUMP_CUT_MULT;
      else if (t >= JUMP_HOLD_MAX) keep = 1;
      else {
        const f = (t - JUMP_HOLD_MIN) / (JUMP_HOLD_MAX - JUMP_HOLD_MIN);
        keep = JUMP_CUT_MULT + (1 - JUMP_CUT_MULT) * f;
      }
      player.vy *= keep;
      player.jumpCutApplied = true;
    }
  }

  // --- 중력 ---
  player.vy += GRAVITY * dt;
  if (player.vy > MAX_FALL) player.vy = MAX_FALL;

  // --- 이동 + 충돌 (축 분리 해결) ---
  moveAndCollide(player, dt);

  // --- 적 갱신 → 패링 검출 → body-hit 처리 ---
  // 적 facing/공격을 먼저 갱신한 뒤, 플레이어·적 공격 히트박스가 모두 활성인
  // 이 시점에 패링을 검출한다. 패링이 body-hit보다 먼저 처리되므로, 같은 스윙에
  // 패링이 성사된 적은 (onParry에서 attackHits에 등록되어) body-hit에서 제외된다
  // → "같은 스윙에 패링 + HP감소 동시 발생" 버그가 사라진다.
  updateEnemies(dt);
  resolveParries();
  resolveAttackHits(); // active 구간이 아니면 내부에서 즉시 반환(가드)
  resolvePlayerHits(); // 적 공격 히트박스가 플레이어를 때리면 피해(패링한 스윙은 제외)
  updateShields(dt); // 비비 방어막(#5) 쿨/시전 관리(combat.js)
  updateProjectiles(dt); // 비비 단검(#3/#4) 발사·이동·패링·폭발(projectiles.js)

  updateAnimations(dt); // 플레이어/적 애니메이션 상태 결정 + 프레임 진행

  if (parryFlash > 0) parryFlash -= dt;
}

// 매 프레임 플레이어/적의 애니메이션 상태를 게임 상태에서 결정하고 시간을 진행한다.
// 에셋이 없으면 렌더가 폴백하므로, 이 갱신은 PNG 유무와 무관하게 항상 돌려도 된다.
function updateAnimations(dt) {
  setAnimState(player.anim, playerAnimState(player), playerAnimDuration(player));
  advanceAnim(player.anim, dt);
  for (const e of enemies) {
    if (!e.alive) continue;
    setAnimState(e.anim, enemyAnimState(e), enemyAnimDuration(e));
    advanceAnim(e.anim, dt);
  }
}

// 플레이어의 현재 애니메이션 상태 키(우선순위: 사망 > 공격 > 대시 > 공중 > 이동 > 대기).
function playerAnimState(p) {
  if (p.dead) return "dead";
  if (p.attack) return "attack";
  if (p.dashTime > 0) return "dash";
  if (!p.onGround) return "jump";
  if (p.vx !== 0) return "walk";
  return "idle";
}
// 공격 애니는 timed 모드라 전체 길이(windup+active+recovery)를 넘겨 phase에 맞춘다.
function playerAnimDuration(p) {
  return p.attack ? attackDuration(p.attack) : 0;
}

// 적의 현재 애니메이션 상태 키(우선순위: 그로기 > 공격(스페셜/평타) > 이동 > 대기).
function enemyAnimState(e) {
  if (e.permaGroggy || e.groggyTime > 0) return "groggy";
  if (e.attack) {
    // 스페셜(돌진/블링크/힘겨루기 유발)은 별도 애니, 평타는 attack.
    const k = e.attack.kind;
    if (k === "dash" || k === "blink" || e.attack.triggersStruggle) return "special";
    return "attack";
  }
  if (e.state === "chase") return "walk";
  return "idle";
}
function enemyAnimDuration(e) {
  return e.attack ? attackDuration(e.attack) : 0;
}

// x축, y축을 따로 이동시키고 각각 충돌을 해결한다(동시 처리 시 코너 끼임 방지).
// entity는 {x,y,w,h,vx,vy,...} 형태면 된다(플레이어/적 공용). 원웨이 드롭스루
// (dropThrough)·공중 점프 리셋(airJumps)·onOneWay 같은 필드는 있으면 쓰이고
// 없으면 무시되므로, 그 필드가 없는 적도 안전하게 통과한다.
function moveAndCollide(entity, dt) {
  // 이번 프레임 이동 전의 발 위치(원웨이는 '윗면을 넘어 내려올 때만' 막으려고 사용).
  const prevBottom = entity.y + entity.h;

  // X축
  entity.x += entity.vx * dt;
  resolveAxis(entity, "x", prevBottom);

  // Y축
  entity.y += entity.vy * dt;
  entity.onGround = false;
  entity.onOneWay = false;
  resolveAxis(entity, "y", prevBottom);
}

// entity AABB가 겹치는 solid 타일을 찾아, 해당 축으로 밀어낸다.
// prevBottom: 이동 전 발 y좌표(원웨이 착지 판정용).
//
// 이동 방향(dir)을 루프 전에 한 번 고정해서 분기에 쓴다. 분기 안에서 vx/vy를
// 0으로 만들면, 한 프레임에 여러 타일과 겹칠 때(예: 대시처럼 빠른 이동) 두 번째
// 타일부터 방향 판정이 깨져 벽을 파고드는 버그가 생긴다. 그래서 속도 0은
// 플래그로 모았다가 루프가 끝난 뒤 한 번만 적용한다.
function resolveAxis(entity, axis, prevBottom) {
  const top = entity.y;
  const bottom = entity.y + entity.h;
  const left = entity.x;
  const right = entity.x + entity.w;

  const c0 = Math.floor(left / TILE_SIZE);
  const c1 = Math.floor((right - 0.0001) / TILE_SIZE);
  const r0 = Math.floor(top / TILE_SIZE);
  const r1 = Math.floor((bottom - 0.0001) / TILE_SIZE);

  const dir = axis === "x" ? Math.sign(entity.vx) : Math.sign(entity.vy);
  if (dir === 0) return; // 그 축으로 움직이지 않으면 보정할 것 없음
  let hit = false;

  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const tile = tileAt(stage, c, r);
      if (!tile.solid) continue;
      const tileLeft = c * TILE_SIZE;
      const tileTop = r * TILE_SIZE;

      if (tile.oneWay) {
        // 원웨이: x축 충돌 없음(옆/아래로 통과). y축은 '아래로 내려오며,
        // 직전 발이 타일 윗면 위에 있었을 때'만 착지. 드롭스루 중이면 무시.
        if (axis !== "y") continue;
        if (entity.dropThrough > 0) continue;
        if (dir < 0) continue; // 위로 올라가는 중 → 통과
        if (prevBottom > tileTop + 0.0001) continue; // 이미 윗면 아래 → 통과
        entity.y = tileTop - entity.h; // 윗면에 착지
        entity.onGround = true;
        entity.onOneWay = true;
        entity.airJumps = 0;
        hit = true;
        continue;
      }

      // 일반 solid(땅/벽): 사방 막힘. 한 프레임에 여러 타일과 겹치면 가장
      // 제약이 강한(가장 바깥쪽) 위치로 보정한다(min/max).
      if (axis === "x") {
        if (dir > 0) entity.x = Math.min(entity.x, tileLeft - entity.w); // 오른쪽 벽
        else entity.x = Math.max(entity.x, tileLeft + TILE_SIZE); // 왼쪽 벽
      } else {
        if (dir > 0) {
          entity.y = Math.min(entity.y, tileTop - entity.h); // 바닥 착지
          entity.onGround = true;
          entity.airJumps = 0;
        } else {
          entity.y = Math.max(entity.y, tileTop + TILE_SIZE); // 천장
        }
      }
      hit = true;
    }
  }

  // 막혔으면 그 축 속도를 0으로(루프 밖에서 한 번만).
  if (hit) {
    if (axis === "x") entity.vx = 0;
    else entity.vy = 0;
  }
}

// (렌더 함수들(renderStage/renderEnemies/render 등) → js/render.js 로 분리)

// --- 스테이지(전투) 씬 ---
// 지금까지의 게임플레이 전체가 이 씬이다. enter에서 해당 스테이지를 새로 구성하고,
// update/render는 기존 함수에 위임한다. 카메라 추적도 여기서 한다(스테이지 전용).
// 클리어/사망 후 전환(③)과 일시정지 오버레이는 이후 단계. 지금은 임시로 pause(Esc)
// 입력 시 스테이지 셀렉트로 돌아간다(승패 전환 전까지 스테이지를 빠져나갈 수단).
const StageScene = {
  currentStage: null, // 지금 스테이지 이름(재도전/셀렉트 가능 여부 판정에 사용)
  gameOver: false, // 사망 오버레이 표시 중인가
  won: false, // 승리 오버레이 표시 중인가
  buttons: [], // 게임오버/승리 버튼(handleMenuInput이 다룸)
  focus: 0,
  cols: 1,
  enter(params) {
    this.currentStage = params && params.name ? params.name : FIRST_STAGE;
    this.gameOver = false;
    this.won = false;
    startStage(this.currentStage);
  },
  update(dt) {
    update(dt);
    if (player.dead) {
      // 사망: 게임오버 오버레이. 버튼은 한 번만 구성하고 마우스+키보드로 조작.
      if (!this.gameOver) this.buildGameOver();
      handleMenuInput(this);
      return;
    }
    // 승리: 기본 조건 = 살아있는 적이 하나도 없을 때(적이 있던 스테이지에 한해).
    //   스테이지3만 예외 — 실라/나이아(불사 저격수)와 화살 잡몹이 enemies에 남아 전멸
    //   판정이 절대 성립하지 않으므로, '이프리트+가비아 둘 다 사망'으로 클리어를 판정한다.
    if (!this.won && enemies.length > 0) {
      const cleared =
        this.currentStage === "스테이지 3"
          ? !enemies.some((e) => (e.role === "ifrit" || e.role === "gabia") && e.alive)
          : enemies.every((e) => !e.alive);
      if (cleared) this.buildWin();
    }
    if (this.won) {
      handleMenuInput(this);
      return;
    }
    camera.follow(
      player.x + player.w / 2,
      player.y + player.h / 2,
      stage.widthPx,
      stage.heightPx
    );
    if (Input.justPressed("pause")) SceneManager.change(StageSelectScene);
  },
  // 사망 버튼 구성: 재도전은 항상, '스테이지 이동'은 셀렉트로 갈 수 있는
  // 스테이지(2~7번, isSelectStage)에서만. 그 외(1번/엔드게임)는 재도전만.
  buildGameOver() {
    this.gameOver = true;
    this.focus = 0;
    const stageId = this.currentStage;
    const items = [
      { label: "재도전", action: () => { startStage(stageId); this.gameOver = false; } },
    ];
    if (isSelectStage(stageId)) {
      items.push({ label: "스테이지 이동", action: () => SceneManager.change(StageSelectScene) });
    }
    const bw = 220;
    const bh = 60;
    const gap = 30;
    const totalW = items.length * bw + (items.length - 1) * gap;
    const startX = (canvas.width - totalW) / 2;
    const y = 330;
    this.buttons = items.map((it, i) => ({
      label: it.label,
      x: startX + i * (bw + gap),
      y,
      w: bw,
      h: bh,
      onActivate: it.action,
    }));
    this.cols = this.buttons.length; // 가로 한 줄
  },
  // 승리 버튼 구성: '이동' 하나만. 1~7번(사료스탕스 + 셀렉트 2~7) → 스테이지 셀렉트,
  // 엔드게임 → endgameNext의 다음 스테이지(없으면 = 엘드르 등은 동작 없음). 승리 시
  // 현재 스테이지를 클리어로 기록한다(진행도).
  buildWin() {
    this.won = true;
    this.focus = 0;
    Progress.markCleared(this.currentStage);
    const stageId = this.currentStage;
    let action;
    if (stageId === FIRST_STAGE || isSelectStage(stageId)) {
      action = () => SceneManager.change(StageSelectScene);
    } else {
      const next = endgameNext(stageId);
      action = next
        ? () => { this.currentStage = next; this.won = false; startStage(next); }
        : () => {}; // 다음이 없는 엔드게임(엘드르 등): 버튼은 있으나 동작 없음
    }
    const bw = 220;
    const bh = 60;
    this.buttons = [
      { label: "이동", x: (canvas.width - bw) / 2, y: 330, w: bw, h: bh, onActivate: action },
    ];
    this.cols = 1;
  },
  render() {
    render();
    if (player.dead && this.gameOver) this.drawOverlay("사망");
    else if (this.won) this.drawOverlay("승리");
  },
  // 게임오버/승리 공용 오버레이: 화면을 어둡게 깔고 제목 + 버튼을 그린다.
  drawOverlay(title) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#e6edf3";
    ctx.font = "48px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(title, canvas.width / 2, 210);
    for (let i = 0; i < this.buttons.length; i++) {
      drawButton(this.buttons[i], i === this.focus);
    }
  },
};

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  Input.update(); // 프레임 시작: 입력 스냅샷 갱신(justPressed 엣지 계산 기준)
  // 시간 제어: 타이머는 실시간 dt로 진행하고, 게임 로직에는 배율을 곱한 dt를 준다.
  // 모든 update 로직이 이 scaledDt를 소비하므로 정지/감속/가속이 일괄 반영된다.
  TimeControl.advance(dt);
  ZoomControl.advance(dt); // 줌 보간은 실시간 dt로(히트스톱 중에도 부드럽게 진행)
  ScreenShake.advance(dt); // 화면 흔들림도 실시간 dt로 잦아든다
  const scaledDt = dt * TimeControl.scale;
  // scaledDt가 0이면(정지) update를 건너뛴다 — 멈춘 장면을 렌더만 한다. dt=0으로
  // update를 돌리면 대시 거리 보정의 0 나눗셈 등이 깨질 수 있어 가드도 겸한다.
  if (scaledDt > 0) SceneManager.update(scaledDt);
  SceneManager.render();
  Pointer.endFrame(); // 이번 프레임의 클릭 소비 후 리셋
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
