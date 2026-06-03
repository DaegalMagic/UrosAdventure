// 로드 & 무결성 — 보스 로직과 무관한 가장 바깥 토대. (기존 verify-split.js의 [1][3] 이관)
//   - 로드 시뮬레이션: 실제 index.html 로드 순서로 합쳐 실행해 로드 시점 에러 검출.
//   - 함수 중복: 파일 간 같은 함수명 재정의(조용한 섀도잉) 금지.
const { suite, expect, loadGame, GAME_FILES, readGameSource } = require("../harness");

suite("로드 & 무결성", (t) => {
  t.test("전 파일을 로드 순서대로 합쳐도 로드 시점 에러가 없다", () => {
    const game = loadGame(); // 예외 없이 반환되면 통과
    expect(typeof game.startStage).toBe("function");
  });

  t.test("파일 간 중복 함수 정의가 없다(섀도잉 금지)", () => {
    const re = /^function\s+([A-Za-z0-9_]+)\s*\(/gm;
    const names = [];
    for (const f of GAME_FILES) {
      const src = readGameSource(f);
      let m;
      while ((m = re.exec(src))) names.push(m[1]);
    }
    const dups = [...new Set(names.filter((n) => names.filter((x) => x === n).length > 1))];
    if (dups.length) throw new Error("중복 함수: " + dups.join(", "));
    expect(dups.length).toBe(0);
  });
});
