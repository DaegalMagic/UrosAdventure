// 우로스의 모험 - 씬(화면) 계층
//
// 게임은 한 번에 하나의 "씬"만 활성화된다: Title(시작화면) / StageSelect(스테이지
// 선택) / Stage(전투, main.js의 StageScene). 게임 루프(main.js)는 현재 씬에만
// update/render를 위임하고, Input·TimeControl 같은 전역 서비스는 씬 바깥에 둔다.
//
// 일시정지·게임오버·클리어 같은 모달은 별도 씬이 아니라 그 씬 내부의 오버레이로
// 둘 예정(전투 위에 덧그리기). 여기서는 최상위 씬 세 개만 다룬다.
//
// canvas/ctx/FIRST_STAGE/SELECT_STAGES/STAGES/Camera/Input 등은 먼저 로드된
// 스크립트(map.js, camera.js, input.js, main.js)의 전역을 사용한다.

// ---- 씬 매니저 ----
// 씬은 { enter(params)?, update(dt)?, render()? } 형태의 객체면 된다.
const SceneManager = {
  current: null,
  change(scene, params) {
    this.current = scene;
    if (scene.enter) scene.enter(params);
  },
  update(dt) {
    if (this.current && this.current.update) this.current.update(dt);
  },
  render() {
    if (this.current && this.current.render) this.current.render();
  },
};

// ---- 진행도(메모리 기반) ----
// 어떤 스테이지를 클리어했는지 기록. 지금은 새로고침하면 초기화된다(영속화는 이후).
// 클리어 판정(③)이 붙으면 그쪽에서 Progress.markCleared(id)를 호출한다.
const Progress = (() => {
  const cleared = new Set();
  return {
    markCleared(id) {
      cleared.add(id);
    },
    isCleared(id) {
      return cleared.has(id);
    },
  };
})();

// ---- 포인터(마우스) ----
// 캔버스가 CSS로 확대/축소되어 있어도 내부 좌표(canvas.width 기준)로 변환해 둔다.
const Pointer = (() => {
  let x = 0;
  let y = 0;
  let clicked = false;
  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    x = (e.clientX - r.left) * (canvas.width / r.width);
    y = (e.clientY - r.top) * (canvas.height / r.height);
  }
  canvas.addEventListener("mousemove", toCanvas);
  canvas.addEventListener("mousedown", (e) => {
    toCanvas(e);
    clicked = true;
  });
  return {
    get x() {
      return x;
    },
    get y() {
      return y;
    },
    get clicked() {
      return clicked;
    },
    // 루프 끝에서 호출: 이번 프레임의 클릭을 소비 처리한다.
    endFrame() {
      clicked = false;
    },
  };
})();

// ---- 버튼/메뉴 공용 헬퍼 ----
function pointInRect(px, py, rect) {
  return (
    px >= rect.x &&
    px <= rect.x + rect.w &&
    py >= rect.y &&
    py <= rect.y + rect.h
  );
}

function drawButton(b, focused) {
  ctx.fillStyle = focused ? "#6cc6ff" : "#2a3142";
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = "#6cc6ff";
  ctx.lineWidth = 2;
  ctx.strokeRect(b.x, b.y, b.w, b.h);
  ctx.fillStyle = focused ? "#0e1117" : "#e6edf3";
  ctx.font = "20px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
}

function clearScreen() {
  ctx.fillStyle = "#0e1117";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// 메뉴 입력(마우스 + 키보드 공용). scene.buttons / scene.focus / scene.cols 를 다룬다.
//   마우스: 버튼 위에 올리면 focus 이동, 클릭하면 그 버튼 활성화.
//   키보드: 방향키로 focus 이동(cols 기준 격자), jump(X)로 활성화.
function handleMenuInput(scene) {
  const btns = scene.buttons;
  if (!btns || btns.length === 0) return;
  const cols = scene.cols || 1;

  // 마우스 hover → focus
  for (let i = 0; i < btns.length; i++) {
    if (pointInRect(Pointer.x, Pointer.y, btns[i])) {
      scene.focus = i;
      break;
    }
  }
  // 마우스 클릭 → 커서 아래 버튼 활성화
  if (Pointer.clicked) {
    for (const b of btns) {
      if (pointInRect(Pointer.x, Pointer.y, b)) {
        b.onActivate();
        return;
      }
    }
  }
  // 키보드 네비게이션
  if (Input.justPressed("left")) scene.focus = (scene.focus - 1 + btns.length) % btns.length;
  if (Input.justPressed("right")) scene.focus = (scene.focus + 1) % btns.length;
  if (Input.justPressed("up")) scene.focus = (scene.focus - cols + btns.length) % btns.length;
  if (Input.justPressed("down")) scene.focus = (scene.focus + cols) % btns.length;
  if (Input.justPressed("jump")) btns[scene.focus].onActivate();
}

// ---- 타이틀 씬 ----
// 위에 제목, 아래 [시작] 버튼. 시작을 누르면 진행도에 따라 분기한다:
//   1번 스테이지(사료스탕스)를 아직 클리어 안 했으면 → 바로 그 스테이지로,
//   클리어했으면 → 스테이지 셀렉트로.
const TitleScene = {
  buttons: [],
  focus: 0,
  cols: 1,
  enter() {
    const bw = 200;
    const bh = 60;
    this.buttons = [
      {
        label: "시작",
        x: (canvas.width - bw) / 2,
        y: 360,
        w: bw,
        h: bh,
        onActivate() {
          if (Progress.isCleared(FIRST_STAGE)) {
            SceneManager.change(StageSelectScene);
          } else {
            SceneManager.change(StageScene, { name: FIRST_STAGE });
          }
        },
      },
    ];
    this.focus = 0;
  },
  update() {
    handleMenuInput(this);
  },
  render() {
    clearScreen();
    ctx.fillStyle = "#e6edf3";
    ctx.font = "52px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("우로스의 대모험", canvas.width / 2, 200);
    for (let i = 0; i < this.buttons.length; i++) {
      drawButton(this.buttons[i], i === this.focus);
    }
  },
};

// ---- 스테이지 셀렉트 씬 ----
// 위 3개 / 아래 3개, 총 6개 버튼(2~7번). 각 버튼은 SELECT_STAGES의 스테이지로 이동한다.
// (보물 6개를 다 모으면 가운데에 최종 버튼이 생기는 규칙은 이후 단계에서 추가.)
const StageSelectScene = {
  buttons: [],
  focus: 0,
  cols: 3,
  enter() {
    const cols = 3;
    const rows = 2;
    const bw = 180;
    const bh = 90;
    const gapX = 30;
    const gapY = 40;
    const totalW = cols * bw + (cols - 1) * gapX;
    const totalH = rows * bh + (rows - 1) * gapY;
    const startX = (canvas.width - totalW) / 2;
    const startY = (canvas.height - totalH) / 2 + 30;

    this.buttons = [];
    for (let i = 0; i < SELECT_STAGES.length && i < cols * rows; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const stageId = SELECT_STAGES[i].id;
      this.buttons.push({
        label: SELECT_STAGES[i].label,
        x: startX + c * (bw + gapX),
        y: startY + r * (bh + gapY),
        w: bw,
        h: bh,
        onActivate() {
          SceneManager.change(StageScene, { name: stageId });
        },
      });
    }
    this.focus = 0;
  },
  update() {
    handleMenuInput(this);
  },
  render() {
    clearScreen();
    ctx.fillStyle = "#e6edf3";
    ctx.font = "32px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("스테이지 선택", canvas.width / 2, 70);
    for (let i = 0; i < this.buttons.length; i++) {
      drawButton(this.buttons[i], i === this.focus);
    }
  },
};

// 시작 씬: 타이틀. (main.js의 loop는 이 시점 이후 첫 프레임부터 current 씬을 돌린다.)
SceneManager.change(TitleScene);
