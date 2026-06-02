// 우로스의 모험 - 입력(액션 맵) 계층
//
// 게임 로직은 물리 키("x", "ArrowLeft")가 아니라 행동("jump", "left")을 읽는다.
// "어떤 키가 어떤 행동인가"는 아래 bindings 한 곳에서만 정의되므로, 리바인딩은
// 이 표만 바꾸면 된다(wiki player-core-mechanics §1: gameplay reads actions,
// never raw keys).
//
// 제공 API:
//   Input.isDown(action)       - 지금 그 행동이 눌려 있는가
//   Input.justPressed(action)  - 이번 프레임에 막 눌렸는가(엣지)
//   Input.justReleased(action) - 이번 프레임에 막 떼졌는가(엣지)
//   Input.update()             - 매 프레임 끝에서 호출(엣지 계산용 스냅샷 갱신)
//   Input.bind(action, keys)   - 런타임 리바인딩(설정 UI에서 사용 예정)
//
// 키 이름은 KeyboardEvent.key 기준(대소문자 분리되므로 글자 키는 양쪽 등록).

const Input = (() => {
  // 행동 → 그 행동에 묶인 키 목록. 기본값:
  //   방향키 = 이동 / X = 점프 / Z = 대시 / C = 공격·패링.
  //   스킬: Q = 1스킬, W = 2스킬(캐릭터 고유) / A·D = 보물스킬 선택 이동(좌·우) /
  //        S = 선택된 보물스킬 사용(+ 상황에 따라 포식). 1·2스킬과 보물스킬은 별개 계통.
  // (skill1/skill2/skillLeft/skillRight/treasureUse 는 아직 게임 로직 미연결 — 스킬·
  //  보물스킬·포식 시스템이 붙으면 연결한다. 지금은 바인딩과 의도만 준비.)
  const bindings = {
    left: ["ArrowLeft"],
    right: ["ArrowRight"],
    up: ["ArrowUp"],
    down: ["ArrowDown"],
    jump: ["x", "X"],
    dash: ["z", "Z"],
    attack: ["c", "C"],
    skill1: ["q", "Q"], // 1스킬
    skill2: ["w", "W"], // 2스킬
    skillLeft: ["a", "A"], // 보물스킬 선택을 왼쪽으로
    skillRight: ["d", "D"], // 보물스킬 선택을 오른쪽으로
    treasureUse: ["s", "S"], // 선택된 보물스킬 사용 + 포식
    pause: ["Escape"], // 메뉴/일시정지(현재는 스테이지→셀렉트 임시 복귀에 사용)
  };

  const downKeys = new Set(); // 현재 눌린 물리 키
  let curr = new Set(); // 이번 프레임의 "눌린 행동" 스냅샷
  let prev = new Set(); // 지난 프레임의 스냅샷(엣지 계산용)

  // 어떤 키든 게임에 바인딩되어 있으면 브라우저 기본동작(스크롤 등)을 막는다.
  function isBoundKey(key) {
    for (const keysForAction of Object.values(bindings)) {
      if (keysForAction.includes(key)) return true;
    }
    return false;
  }

  window.addEventListener("keydown", (e) => {
    downKeys.add(e.key);
    if (isBoundKey(e.key)) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => downKeys.delete(e.key));
  // 포커스를 잃으면 눌린 키가 "붙어" 있는 것을 방지.
  window.addEventListener("blur", () => downKeys.clear());

  function rawIsDown(action) {
    const ks = bindings[action];
    if (!ks) return false;
    return ks.some((k) => downKeys.has(k));
  }

  // 이번 프레임에 눌려 있는 행동 집합을 새로 계산한다.
  function snapshot() {
    const s = new Set();
    for (const action of Object.keys(bindings)) {
      if (rawIsDown(action)) s.add(action);
    }
    return s;
  }

  // curr 스냅샷은 매 프레임 시작 시 갱신해 두고, isDown/justPressed가 이를 읽는다.
  curr = snapshot();

  return {
    isDown(action) {
      return curr.has(action);
    },
    justPressed(action) {
      return curr.has(action) && !prev.has(action);
    },
    justReleased(action) {
      return !curr.has(action) && prev.has(action);
    },
    // 프레임 경계: 다음 프레임의 엣지 계산을 위해 prev←curr 로 넘기고 curr 재계산.
    update() {
      prev = curr;
      curr = snapshot();
    },
    bind(action, keys) {
      bindings[action] = keys.slice();
    },
    bindings, // 디버그/설정 UI용 노출
  };
})();
