// 테스트 하니스: 게임을 vm 샌드박스에 로드하고(loadGame), 이름 붙은 격리 케이스를
// 등록·검증(suite/test/expect)하는 무의존성 미니 프레임워크.
//   설계 메모: js/*.js의 상태는 전부 top-level `let`이라 vm 전역 객체에 자동 노출되지
//   않는다. 반면 `function` 선언은 자동 노출된다. 그래서 함수는 sandbox에서 바로 쓰고,
//   상태(enemies/projectiles/...)는 게임 끝에 덧붙인 EPILOGUE가 게터로 다리를 놓는다.
//   임의의 게임-스코프 표현식이 필요하면 game.eval("ATTACKS.devour")로 탈출한다.
//   자세한 배경: docs/test-refactor-plan.md
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

// index.html의 로드 순서(검증 대상이기도 하다). scenes.js가 SceneManager를 정의.
const ORDER = ["data", "map", "camera", "input", "sprites", "effects", "combat", "main", "enemy", "render", "projectiles", "scenes"];
const GAME_FILES = ORDER.map((n) => path.join("js", n + ".js"));

function readGameSource(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

// ---- 브라우저 환경 스텁(로직 전용; 렌더 픽셀은 비대상) ----------------------
function makeSandbox() {
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
  const elementStub = new Proxy(
    { style: {}, addEventListener: noop, getContext: () => ctx, classList: { add: noop, remove: noop } },
    { get: (t, p) => (p in t ? t[p] : noop) },
  );
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
  return sandbox;
}

// 게임 스코프에서 실행되어 상태(let)에 게터로 다리를 놓는 에필로그. 함수는 자동
// 노출되므로 적지 않는다. 여기 없는 상수/내부값은 game.eval(...)로 접근한다.
// 새 전역 상태가 늘어 케이스에서 자주 쓰이면 이 목록에만 한 줄 추가한다.
const EPILOGUE = `
globalThis.__api = {
  get stage(){return stage}, set stage(v){stage=v},
  get camera(){return camera}, set camera(v){camera=v},
  get player(){return player}, set player(v){player=v},
  get enemies(){return enemies}, set enemies(v){enemies=v},
  get hittables(){return hittables}, set hittables(v){hittables=v},
  get projectiles(){return projectiles}, set projectiles(v){projectiles=v},
  get lines(){return lines}, set lines(v){lines=v},
  get dayaSpikes(){return dayaSpikes}, set dayaSpikes(v){dayaSpikes=v},
  get dayaRainQueue(){return dayaRainQueue}, set dayaRainQueue(v){dayaRainQueue=v},
  get firePillars(){return firePillars}, set firePillars(v){firePillars=v},
  get gabiaBlasts(){return gabiaBlasts}, set gabiaBlasts(v){gabiaBlasts=v},
  get naiaLasers(){return naiaLasers}, set naiaLasers(v){naiaLasers=v},
  get naiaLaserQueue(){return naiaLaserQueue}, set naiaLaserQueue(v){naiaLaserQueue=v},
  get naiaWave(){return naiaWave}, set naiaWave(v){naiaWave=v},
  eval: (src) => eval(src),
};`;

// 게임 전체를 새 vm 컨텍스트에 로드하고, 게임과 상호작용하는 핸들을 돌려준다.
// 케이스마다 호출해 전역 오염을 원천 차단한다(§4.3). 반환 핸들:
//   game.<함수>(...)   — 게임 함수 직접 호출(startStage/update/makeEnemy/...)
//   game.<상태>        — enemies/projectiles/player/... (EPILOGUE 게터)
//   game.eval("expr")  — 임의의 게임-스코프 표현식(상수·내부값 접근)
//   game.step(n, dt)   — update+render를 n프레임(기본 dt=0.016)
//   game.bossOf(role)  — enemies에서 role로 적 하나 찾기
function loadGame() {
  const sandbox = makeSandbox();
  const combined =
    GAME_FILES.map((f) => "\n//=== " + f + " ===\n" + readGameSource(f)).join("\n") + EPILOGUE;
  vm.runInNewContext(combined, sandbox, { filename: "game.combined.js" });
  const api = sandbox.__api;

  const helpers = {
    eval: (src) => api.eval(src),
    step: (n = 1, dt = 0.016) => { for (let i = 0; i < n; i++) { sandbox.update(dt); sandbox.render(); } },
    update: (n = 1, dt = 0.016) => { for (let i = 0; i < n; i++) sandbox.update(dt); },
    bossOf: (role) => api.enemies.find((e) => e.role === role),
  };

  return new Proxy({}, {
    get(_, p) {
      if (typeof p === "string") {
        if (p in helpers) return helpers[p];
        if (p in api) return api[p]; // 상태 게터
      }
      return sandbox[p]; // 게임 함수/전역
    },
    set(_, p, v) {
      if (typeof p === "string" && p in api) api[p] = v;
      else sandbox[p] = v;
      return true;
    },
  });
}

// ---- 단언 ------------------------------------------------------------------
class AssertionError extends Error {}
function fmt(v) {
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.length + "개]";
  if (v && typeof v === "object") return v.role ? `<${v.role}>` : "{object}";
  return String(v);
}
function expect(actual) {
  return {
    toBe: (e) => { if (actual !== e) throw new AssertionError(`expected ${fmt(e)}, got ${fmt(actual)}`); },
    toEqual: (e) => { if (JSON.stringify(actual) !== JSON.stringify(e)) throw new AssertionError(`expected ${fmt(e)}, got ${fmt(actual)}`); },
    toBeTruthy: () => { if (!actual) throw new AssertionError(`expected truthy, got ${fmt(actual)}`); },
    toBeFalsy: () => { if (actual) throw new AssertionError(`expected falsy, got ${fmt(actual)}`); },
    toBeCloseTo: (e, eps = 1e-6) => { if (Math.abs(actual - e) > eps) throw new AssertionError(`expected ≈${e} (±${eps}), got ${actual}`); },
    toBeLessThan: (e) => { if (!(actual < e)) throw new AssertionError(`expected <${e}, got ${actual}`); },
    toBeGreaterThan: (e) => { if (!(actual > e)) throw new AssertionError(`expected >${e}, got ${actual}`); },
  };
}

// ---- 케이스 등록 -----------------------------------------------------------
// 케이스 파일이 suite("이름", t => t.test("케이스", fn))로 등록하면 REGISTRY에 쌓이고,
// 러너(tools/test.js)가 전부 모아 실행한다.
const REGISTRY = [];
function suite(name, fn) {
  const tests = [];
  fn({
    test: (caseName, caseFn) => tests.push({ name: caseName, fn: caseFn }),
    // 아직 안 채운 검증 항목. 통과도 실패도 아닌 "보류"로 리포트되어, 다음에 채울
    // 목록이 실행만 해도 그대로 보인다(exit code엔 영향 없음).
    todo: (caseName) => tests.push({ name: caseName, todo: true }),
  });
  REGISTRY.push({ name, tests });
}

module.exports = { loadGame, expect, suite, REGISTRY, GAME_FILES, readGameSource, AssertionError };
