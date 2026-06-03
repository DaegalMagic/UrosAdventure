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
for (const f of fs.readdirSync(casesDir).filter((f) => f.endsWith(".js")).sort()) {
  require(path.join(casesDir, f));
}

let pass = 0;
let fail = 0;
const failures = [];

for (const s of REGISTRY) {
  if (filter && !s.name.includes(filter)) continue;
  console.log("\n■ " + s.name);
  for (const t of s.tests) {
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
console.log(`결과: ${pass} 통과, ${fail} 실패` + (filter ? ` (필터: "${filter}")` : ""));
if (fail) {
  console.log("\n실패 상세:");
  for (const f of failures) console.log(`  • ${f.suite} › ${f.test}\n    ${f.error}`);
  process.exit(1);
}
