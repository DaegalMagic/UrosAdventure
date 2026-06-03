# 테스트 하니스 리팩터 계획

> 목적: 현재 스테이지2에만 묶여 있는 검증 스크립트를, **공통 로직 + 전 스테이지 + 앞으로 추가될 보스/스테이지**를
> 일관된 틀로 검증하는 구조로 재편한다. 빌드리스·무의존성이라는 이 프로젝트의 철학은 유지한다.

---

## 1. 현황 진단

검증 자산은 [tools/verify-split.js](../tools/verify-split.js) **단 하나**다. 세 가지를 한다:

1. vm 샌드박스(canvas/document/Image/localStorage 스텁)로 [index.html](../index.html) 로드 순서대로 `js/*.js`를 합쳐 실행 → 로드 시점 에러 검출
2. `startStage("스테이지 2")` 후 거대한 driver 문자열로 보스 스펙을 불리언 검증
3. 파일 간 동일 함수명 재정의(섀도잉) 검사

### 한계

| 영역 | 현재 |
|---|---|
| 로드 순서 / 함수 중복 | ✅ |
| 스테이지2 보스(비비/다야/키디언/포식) | ✅ |
| 스테이지1(사료스탕스: 베니/루포/티그) | ❌ 없음 |
| 스테이지3(이프리트/가비아/실라/나이아) | ❌ 없음 |
| 공통 로직(이동/점프/중력/패링/맵 파싱/카메라/AABB) | ❌ 독립 단언 없음 (스테이지2 driver가 간접 실행만) |

구조적 문제:

- **케이스 격리·이름 없음** — 200줄 driver 문자열 하나. 실패하면 "어느 불리언이 false인지" 사람이 눈으로 찾아야 한다. 보스가 늘수록 문자열이 감당 불가.
- **전역 상태 오염 위험** — `enemies`/`projectiles` 등을 블록마다 손으로 비운다. 한 곳을 빠뜨리면 뒤 블록이 연쇄로 깨진다.
- **확장 규약 부재** — 새 보스를 추가할 때 "어디에 어떻게 케이스를 넣어라"가 정의돼 있지 않다.

> 참고: [tools/](../tools/)의 나머지 3개(`gen-uros-sprites.js`, `preview-big.js`, `preview-uros.js`)는 스프라이트 생성·프리뷰 도구이며 테스트가 아니다.

---

## 2. 목표 / 비목표

### 목표
- 공통 로직 + 전 스테이지(1·2·3) + 향후 추가분을 **이름 붙은 격리 케이스**로 검증
- 실패 시 **어느 케이스가 왜 깨졌는지** 즉시 보이는 리포트 (`❌ 다야 반사: expected vy>0, got 0`)
- 새 보스/스테이지 추가 시 **파일 하나만 추가**하면 자동으로 스위트에 편입되는 규약
- 단일 명령(`node tools/test.js`)으로 전체 실행, 실패 시 exit code ≠ 0 (pre-commit/CI 연동 가능)

### 비목표 (의도적으로 안 함)
- ❌ npm / package.json / 번들러 / Jest·Vitest 도입 — 프로덕션 코드의 전역·로드순서 구조를 안 바꾼다
- ❌ 소스에 `import/export` 추가 — vm 샌드박스 로드 방식을 유지(실제 로드 순서까지 검증되는 장점)
- ❌ 브라우저 E2E(픽셀 검증) — 로직 스모크 범위에 집중. 비주얼은 기존 프리뷰 도구가 담당

> 한 줄 요약: **엔진 교체가 아니라, 같은 vm 엔진에 변속기(케이스 분리·이름·자동수집)를 단다.**

---

## 3. 제안 구조

```
tools/
  test.js                  ← 진입점(러너). `node tools/test.js [패턴]`
  test/
    harness.js             ← 샌드박스 로더 + 게임 부트스트랩 + check/assert 미니 프레임워크
    cases/
      _load.js             ← [1][3] 로드/중복 검사 (기존 verify-split의 그 부분 이관)
      common.js            ← 공통 로직: 이동/점프/중력/패링/맵 파싱/카메라/AABB
      stage1.js            ← 사료스탕스: 베니(힘겨루기)/루포/티그
      stage2.js            ← 비비/다야/키디언/포식 (기존 driver를 케이스로 분해 이관)
      stage3.js            ← 이프리트/가비아/실라/나이아
```

- `tools/verify-split.js`는 **이관 완료까지 유지**하다가, 동등 커버리지 확인 후 제거(또는 `node tools/test.js`를 부르는 얇은 래퍼로 남김 → 기존 호출처 호환).
- `cases/` 안의 파일은 러너가 **글롭으로 자동 수집**한다. 새 스테이지 = 파일 추가 = 끝.

---

## 4. 미니 하니스 API

의존성 없이 ~80줄로 구현. `tools/test/harness.js`가 노출할 표면:

### 4.1 샌드박스 부트스트랩
```js
// 게임 전체를 새 vm 컨텍스트에 로드하고, 전역(startStage, update, render,
// makeEnemy, enemies, projectiles ...)에 접근 가능한 핸들을 돌려준다.
const game = loadGame();          // 깨끗한 컨텍스트 1개 생성
game.startStage("스테이지 2");
game.player.hp = 1e9;             // 불사 등 셋업
game.bossOf("daya");              // enemies.find(e => e.role === "daya") 헬퍼
game.step(150);                   // update(0.016)+render() N프레임
```

### 4.2 단언 & 케이스
```js
suite("스테이지2 · 다야", (t) => {
  t.test("부채꼴 3발 incoming", () => {
    const g = loadGame(); g.startStage("스테이지 2");
    const daya = g.bossOf("daya");
    g.fireDayaFan(daya);
    expect(g.projectiles.length).toBe(3);
    expect(g.projectiles.every(p => p.kind === "dayaShot")).toBe(true);
  });

  t.test("패링 시 반사 + 무피해", () => { /* ... */ });
});
```

- `expect(x).toBe(y)` / `.toBeTruthy()` / `.toBeCloseTo(y, eps)` / `.toBeLessThan(y)` — 게임 수치 검증에 필요한 최소 셋.
- 실패하면 **케이스 이름 + 기대/실제**를 모아 마지막에 요약. 통과/실패 카운트로 exit code 결정.

### 4.3 격리 전략 (중요)
- **케이스마다 `loadGame()`으로 새 컨텍스트**를 만드는 것을 기본으로 한다 → 전역 오염 원천 차단. 손으로 `projectiles.length = 0` 하던 보일러플레이트 소멸.
- 게임 코드가 작아(`js/*` 합쳐 ~5천 줄) 매 케이스 재로드 비용은 무시 가능. 만약 느려지면 **스테이지 단위로 컨텍스트 공유 + 케이스 시작 시 `startStage` 재호출**로 완충(2차 최적화, 처음엔 불필요).

---

## 5. 커버리지 로드맵

추가될 기능을 감안해 **공통 로직을 먼저** 두텁게 깐다(보스가 늘어도 안 변하는 토대이기 때문).

### Phase 0 — 골격 (선행)
- `harness.js`(loadGame/step/bossOf + expect/suite) 구현
- `cases/_load.js`에 기존 [1]로드·[3]중복 검사 이관 → 동작 동등 확인
- `tools/test.js` 러너 + 자동 수집

### Phase 1 — 공통 로직 (`cases/common.js`)
보스와 무관하게 모든 스테이지가 의존하는 토대:
- 맵 파싱: `STAGES` 각 행 길이 일치, `loadStage` 표면/발판 좌표
- 물리: 중력·점프(가변 점프 컷)·이중점프·드롭스루(`DROP_THROUGH_TIME`)
- 충돌: `aabbOverlap`, `getHurtbox`/`getAttackHitbox`
- 전투 기본: 평타 히트박스, 패링 판정, `hitEnemy` 데미지/방어력 적용
- 카메라 클램프

### Phase 2 — 스테이지2 이관 (`cases/stage2.js`)
- 기존 driver를 **보스별·스펙별 named 케이스로 분해**. 메모리 스펙([bibi-boss-spec]/[kidian-spec]/[daya-pattern-spec])과 1:1 대응시킨다. 동작 동등성 확인 후 `verify-split.js` 은퇴.

### Phase 3 — 미커버 스테이지 (`cases/stage1.js`, `cases/stage3.js`)
- 스테이지1: 베니 힘겨루기(rangeReplace)/3인 group 연동/층 선호 배치
- 스테이지3: 이프리트(추격)/가비아(카이팅)/실라(포물선 화살·반사 봉인·착탄 잡몹)/나이아(3연발 레이저·파도). 클리어 조건(이프리트+가비아 HP 0).

---

## 6. 확장 가이드 — 새 보스/스테이지를 추가할 때

> "기능이 더 추가될 것"을 감안한 핵심 절차. 이 규약 덕분에 driver를 건드릴 일이 없다.

**새 스테이지 추가 시:**
1. `cases/stageN.js` 파일 생성
2. `suite("스테이지N · <보스>", t => { ... })` 블록 작성, 각 공격 스펙을 `t.test`로
3. 케이스 안에서 `loadGame(); g.startStage("스테이지 N")` 로 시작 — 나머지는 러너가 자동 수집·실행

**기존 보스에 공격 추가 시:**
- 해당 `cases/stageN.js`에 `t.test` 한 줄 추가. 다른 케이스에 영향 없음(격리됨).

**규약 체크리스트:**
- [ ] 케이스 이름은 스펙 문서/메모리 용어와 일치 (실패 시 추적 용이)
- [ ] 새 컨텍스트(`loadGame`)로 시작 — 전역 손수 초기화 금지
- [ ] 새 전역 함수를 검증에 쓰면 `harness`의 노출 목록 갱신 불필요(컨텍스트 전역 그대로 접근)
- [ ] 스펙이 메모리에 있으면 `[[stageN-spec]]` 링크로 상호참조

---

## 7. 실행 & 통합

```bash
node tools/test.js                 # 전체
node tools/test.js stage3          # 패턴 일치 케이스만(파일명/suite명 부분일치)
```

- 실패 케이스가 있으면 exit code 1 → 그대로 pre-commit 훅이나 CI 스텝에 연결 가능.
- [AGENTS.md](../AGENTS.md)의 "no test harness" 문구를 갱신하고, 검증 실행법을 명시.

---

## 8. 리스크 & 대응

| 리스크 | 대응 |
|---|---|
| 이관 중 스테이지2 커버리지 누락 | Phase 2에서 기존 driver와 **병렬 유지**, 새 케이스가 같은 불리언을 전부 재현하는지 대조 후 은퇴 |
| 매 케이스 재로드로 느려짐 | 우선 측정. 문제 시 스테이지 단위 컨텍스트 공유로 완충(§4.3) |
| 샌드박스 스텁이 실제 브라우저와 어긋남 | 스텁은 기존 `verify-split.js` 것을 그대로 계승(이미 검증됨), 로직 전용 — 렌더 픽셀은 비대상 |

---

## 9. 작업 순서 요약

1. **Phase 0** 골격(harness + 러너 + `_load` 이관) — 가장 먼저, 토대
2. **Phase 1** 공통 로직 케이스 — 보스와 무관한 토대 먼저 두텁게
3. **Phase 2** 스테이지2 이관 + driver 은퇴
4. **Phase 3** 스테이지1·3 신규 커버
5. AGENTS.md 갱신, (선택) pre-commit/CI 연결
