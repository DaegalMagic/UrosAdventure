// 리팩터 검증: 로드 시뮬레이션 + 함수 무결성. 실행: node tools/verify-split.js
const fs = require("fs");
const vm = require("vm");
const cp = require("child_process");

// index.html 로드 순서(검증 대상). scenes.js는 SceneManager 정의.
const order = ["data", "map", "camera", "input", "sprites", "effects", "combat", "main", "projectiles", "scenes"]
  .map((n) => "js/" + n + ".js");

// 1) 합쳐서 로드 시뮬레이션 ----------------------------------------------------
const noop = () => {};
const ctx = new Proxy({}, {
  get: (t, p) => (p === "measureText" ? () => ({ width: 0 }) : (p in t ? t[p] : noop)),
  set: (t, p, v) => { t[p] = v; return true; },
});
const canvas = {
  width: 1000, height: 600, style: {},
  getContext: () => ctx, addEventListener: noop,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 600 }),
};
const elementStub = new Proxy({ style: {}, addEventListener: noop, getContext: () => ctx, classList: { add: noop, remove: noop } }, { get: (t, p) => (p in t ? t[p] : noop) });
const documentStub = {
  getElementById: (id) => (id === "game" ? canvas : elementStub),
  querySelector: () => elementStub, createElement: () => canvas,
  addEventListener: noop, body: elementStub,
};
class ImageStub { constructor() { this.addEventListener = noop; } set src(_) {} get src() { return ""; } }
const sandbox = {
  console, Math, Date, JSON, Object, Array, Set, Map, performance: { now: () => 0 },
  requestAnimationFrame: noop, cancelAnimationFrame: noop, setTimeout: noop, clearTimeout: noop,
  document: documentStub, Image: ImageStub,
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.addEventListener = noop;

// 로드 후, 스테이지 2를 띄우고 투사체 전 경로를 강제로 태운다(파일 간 호출 그래프 실증).
const driver = `
try {
  startStage("스테이지 2");
  player.hp = 1e9; // 스모크 동안 불사(가만히 맞고 죽으면 update가 early-return해 경로가 멈춤)
  const bibi = enemies.find((e) => e.role === "bibi");
  // #3 4연(시차) + #4 큰 단검을 강제 발사하고 ~2.5초 돌린다(이동/플레이어피격/소멸/렌더).
  fireBigDagger(bibi);
  scheduleVolley(bibi);
  for (let i = 0; i < 150; i++) { update(0.016); render(); }
  // 큰 단검 상태기계: stopped→폭발(8파편) 경로.
  const bigA = makeProjectile(player.x + 220, player.y, -120, 0, { w: BIG_DAGGER_W, h: BIG_DAGGER_H, kind: "big", damage: 1, parryable: true });
  bigA.state = "stopped"; bigA.fuse = 0.05; projectiles.push(bigA);
  for (let i = 0; i < 12; i++) { update(0.016); render(); }
  // 큰 단검: 패링 2회(flying→stopped→returning)→다야 도달→방어력 깎기. 도달을 확실히
  // 보려고 다야 근처에서 출발시킨다(returning은 다야로 호밍).
  const daya = enemies.find((e) => e.role === "daya");
  const bigB = makeProjectile(daya.x - 80, daya.y + 10, 120, 0, { w: BIG_DAGGER_W, h: BIG_DAGGER_H, kind: "big", damage: 1, parryable: true });
  projectiles.push(bigB);
  parryBigDagger(bigB); parryBigDagger(bigB);
  const dayaDefBefore = daya.defense;
  for (let i = 0; i < 60; i++) { update(0.016); render(); }
  const dayaDefAfter = enemies.find((e) => e.role === "daya").defense;
  // #5 방어막: 흡수 2회 후 깨짐(HP 보존), 3번째는 HP 감소. 그 뒤 쿨 0으로 재시전.
  const hpBefore = bibi.hp;
  bibi.shieldCharges = 2;
  hitEnemy(bibi); hitEnemy(bibi); // 2회 흡수
  const chargesAfter2 = bibi.shieldCharges, hpAfter2 = bibi.hp;
  hitEnemy(bibi); // 막 깨진 뒤 → HP 감소
  const shieldOk = chargesAfter2 === 0 && hpAfter2 === hpBefore && bibi.hp < hpBefore;
  bibi.shieldCd = 0; bibi.shieldCharges = 0; updateShields(0.016); // 쿨 만료 + 막 없음 → 재시전
  const recast = bibi.shieldCharges;
  // 포식(S): 히트박스 3배(가로 300·세로 180) + 그로기 적을 HP 무관 즉시 포식.
  player.attack = ATTACKS.devour; player.attackElapsed = 0.31; player.attackDir = 1;
  const dhb = getAttackHitbox();
  const devourBoxOk = !!dhb && dhb.w === 300 && dhb.h === 180;
  player.attack = null;
  const tgt = enemies.find((e) => e.role === "bibi");
  tgt.groggyTime = 5; tgt.hp = 99; tgt.shieldCharges = 0;
  hitEnemy(tgt, 0.01, true); // 포식 공격 → 즉시 사망(HP 남아도)
  const devourKilled = !tgt.alive;
  // 포식 윈드업 잠금 경로 실행(크래시 없음 확인): 포식을 직접 걸고 끝까지 진행.
  player.attack = ATTACKS.devour; player.attackElapsed = 0; player.attackHits.clear();
  for (let i = 0; i < 40; i++) { update(0.016); render(); } // ~0.64s > 전체 0.55s → 종료
  const devourLockRan = player.attack === null;
  // 키디언 직선 공격: 발사(telegraph)→발사(firing)에서 플레이어 피격, 그리고 패링
  // 5회 → 봉인(alive=false). 다른 적은 죽여 키디언만 남기고 클리어 조건도 확인한다.
  const kid = enemies.find((e) => e.role === "kidian");
  lines.length = 0;
  spawnLine(kid); // 발사 경로(telegraph로 진입)
  const lineFired = lines.length === 1 && lines[0].state === "telegraph";
  // 가로/세로 라인을 각각 firing으로 직접 띄워(플레이어 피격박스 정중앙 관통) 두 축
  // 모두에서 피격이 일어나는지 결정적으로 본다(불사라 죽진 않음).
  const phb = getHurtbox(player);
  let lineHit = true;
  for (const ax of ["h", "v"]) {
    lines.length = 0;
    const pos = ax === "h" ? phb.y + phb.h / 2 : phb.x + phb.w / 2;
    lines.push({ axis: ax, pos, state: "firing", t: 0, shooter: kid, hitPlayer: false, alive: true });
    const hp0 = player.hp;
    for (let i = 0; i < 12; i++) { update(0.016); render(); }
    if (!(player.hp < hp0)) lineHit = false;
  }
  // 비비 포식 → 키디언 광폭화: 다야 방어력 최저 + 라인 패링 불가(=봉인 불가) + 쿨 3배.
  kid.alive = true; kid.lineParries = 0; kid.lineEnraged = false; lines.length = 0;
  const bibi2 = enemies.find((e) => e.role === "bibi");
  applyDevourRipple(bibi2); // 비비를 포식했다고 가정(ripple만 호출)
  const enr = enemies.find((e) => e.role === "kidian");
  const dayaMin = enemies.find((e) => e.role === "daya").defense === DAGGER_DEFENSE_MIN;
  const enraged = enr.lineEnraged === true;
  // 광폭화 패링 차단: 라인 띄우고 플레이어 공격을 겹쳐도 패링되지 않아야 한다.
  spawnLine(enr);
  player.attack = ATTACKS.playerSlash; player.attackElapsed = 0.05; player.attackDir = 1; player.attackHits.clear();
  updateLines(0.02);
  const enrageNoParry = enr.lineParries === 0 && lines.length === 1;
  player.attack = null; lines.length = 0;
  // 광폭화 쿨 3배: cdMin(5) 기준, 1초 dt면 enrage는 3을 깎는다.
  enr.lineCd = 5; updateLineShooters(1.0);
  const fastCd = Math.abs(enr.lineCd - 2) < 1e-6; // 5 - 1*3 = 2
  // 패링 봉인: (광폭 해제 상태로) 라인을 직접 5번 패링 → 봉인(=처치).
  enr.lineEnraged = false;
  for (let i = 0; i < 5; i++) { spawnLine(kid); parryLine(lines[lines.length - 1]); }
  const kidSealed = !kid.alive && kid.lineParries >= kid.ai.lineShooter.sealParries;
  // 봉인된 키디언은 비비 재포식 ripple에도 살아나지 않는다(부활 금지).
  applyDevourRipple(bibi2);
  const sealStaysDead = !kid.alive;
  globalThis.__smoke = "OK (적 " + enemies.length + ", 잔여 투사체 " + projectiles.length +
    ", 다야 방어력 " + dayaDefBefore.toFixed(2) + "→" + dayaDefAfter.toFixed(2) +
    ", 방어막 흡수=" + shieldOk + " 재시전=" + recast +
    ", 포식범위3배=" + devourBoxOk + " 포식처치=" + devourKilled + " 윈드업경로=" + devourLockRan +
    ", 키디언 라인발사=" + lineFired + " 라인피격=" + lineHit + " 봉인=" + kidSealed +
    ", 광폭화=" + enraged + "(다야최저=" + dayaMin + " 패링불가=" + enrageNoParry + " 쿨3배=" + fastCd + ") 봉인유지=" + sealStaysDead + ")";
} catch (e) { globalThis.__smoke = "FAIL: " + e.message + "\\n" + (e.stack || ""); }
`;
const combined = order.map((f) => "\n//=== " + f + " ===\n" + fs.readFileSync(f, "utf8")).join("\n") + driver;
try {
  vm.runInNewContext(combined, sandbox, { filename: "combined.js" });
  console.log("[1] 로드 시뮬레이션: OK (로드 시점 오류 없음)");
} catch (e) {
  console.error("[1] 로드 실패:", e.message, "\n", e.stack);
  process.exit(1);
}
console.log("[2] 스테이지2 10프레임 스모크:", sandbox.__smoke);
if (!sandbox.__smoke || sandbox.__smoke.startsWith("FAIL")) process.exit(1);

// 3) 함수 중복(파일 간 같은 함수 두 번 정의 → 조용한 섀도잉) 검사.
const fnNames = (src) => {
  const set = [];
  const re = /^function\s+([A-Za-z0-9_]+)\s*\(/gm;
  let m;
  while ((m = re.exec(src))) set.push(m[1]);
  return set;
};
const allNew = order.map((f) => fnNames(fs.readFileSync(f, "utf8")));
const flat = allNew.flat();
const dup = [...new Set(flat.filter((n) => flat.filter((x) => x === n).length > 1))];
console.log("[3] 새 파일 총 함수:", flat.length, "| 중복:", dup.length ? dup.join(",") : "없음");
if (dup.length) process.exit(1);
console.log("검증 통과.");
