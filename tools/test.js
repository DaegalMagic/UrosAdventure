// 테스트 러너. 실행:
//   node tools/test.js            전체
//   node tools/test.js stage3     suite 이름에 "stage3"가 들어간 것만
//
// tools/test/cases/*.js를 모두 로드(각자 suite()로 등록)한 뒤, 등록된 케이스를
// 순서대로 돌린다. 실패가 하나라도 있으면 exit code 1 (pre-commit/CI 연동용).
const fs = require("fs");
const path = require("path");
const { REGISTRY } = require("./test/harness");

const filter = process.argv[2] || "";
const casesDir = path.join(__dirname, "test", "cases");

// 케이스 파일 로드(이름순 — _load.js가 먼저). require 시점에 suite()가 REGISTRY를 채운다.
// 파일 경계마다 REGISTRY 증가분에 출처 파일명을 태깅해, 필터가 suite명뿐 아니라
// 파일명(예: "stage2")으로도 잡히게 한다(suite명은 한글 "스테이지2"라 영문 안 잡힘).
for (const f of fs.readdirSync(casesDir).filter((f) => f.endsWith(".js")).sort()) {
  const before = REGISTRY.length;
  require(path.join(casesDir, f));
  for (let i = before; i < REGISTRY.length; i++) REGISTRY[i].file = f;
}

let pass = 0;
let fail = 0;
let todo = 0;
const failures = [];

for (const s of REGISTRY) {
  if (filter && !s.name.includes(filter) && !(s.file || "").includes(filter)) continue;
  console.log("\n■ " + s.name);
  for (const t of s.tests) {
    if (t.todo) {
      todo++;
      console.log("  ◦ " + t.name + "  (보류)");
      continue;
    }
    try {
      t.fn();
      pass++;
      console.log("  ✅ " + t.name);
    } catch (e) {
      fail++;
      const msg = e && e.message ? e.message : String(e);
      console.log("  ❌ " + t.name + " — " + msg);
      failures.push({ suite: s.name, test: t.name, error: msg, stack: e && e.stack });
    }
  }
}

console.log("\n" + "─".repeat(48));
console.log(`결과: ${pass} 통과, ${fail} 실패, ${todo} 보류` + (filter ? ` (필터: "${filter}")` : ""));
if (fail) {
  console.log("\n실패 상세:");
  for (const f of failures) console.log(`  • ${f.suite} › ${f.test}\n    ${f.error}`);
  process.exit(1);
}
