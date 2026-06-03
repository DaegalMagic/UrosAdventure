// 우로스의 모험 - 타일맵 정의 및 파서
//
// 맵은 "한 글자 = 한 타일"인 ASCII 문자열 배열로 저장한다.
// 코드에서 눈으로 보고 바로 편집할 수 있고(빌드 도구 없음), 격자 기반이라
// 충돌·렌더링이 단순하다. 스테이지가 늘어나면 각 항목을 별도 데이터로
// 분리하기도 쉽다.
//
// 타일 크기는 20px 고정. 맵은 가로 50 x 세로 30 타일 = 1000 x 600px.
// 이 맵은 canvas 정 가운데에 그려지고, 맵 바깥 여백은 흰색으로 둔다(main.js).

const TILE_SIZE = 20;

// 4층 구조의 '표면 y'(발이 닿는 면). 인덱스 0=맨 위(4층) … 3=바닥(1층).
// 세로 선호 추격 AI(enemy-ai-and-locomotion)가 발 y ↔ 층 인덱스를 오갈 때 쓴다.
// 스테이지마다 층 간격이 다를 수 있어 stage.floorSurfaces로 분리한다(parseStage가 부여).
// floorOf/floorSurfaceY는 호출 시점의 전역 stage.floorSurfaces를 읽는다(런타임 전용 헬퍼).
//   - 기본(사료스탕스/스테이지2): 한 층 간격 80px = 4타일.
//   - 스테이지3: 한 층 간격 140px = 7타일(2단점프로 2층 도달). makeStage3 참조.
const DEFAULT_FLOOR_SURFACES_Y = [260, 340, 420, 500];
const STAGE3_FLOOR_SURFACES_Y = [80, 220, 360, 500];

// 현재 활성 스테이지의 층 표면 배열. stage가 아직 없거나 floorSurfaces가 없으면 기본값.
function activeFloorSurfaces() {
  return (typeof stage !== "undefined" && stage && stage.floorSurfaces) || DEFAULT_FLOOR_SURFACES_Y;
}

// 발 y(박스 하단)에 가장 가까운 층 인덱스(0~3)를 돌려준다.
function floorOf(footY) {
  const surfaces = activeFloorSurfaces();
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < surfaces.length; i++) {
    const d = Math.abs(footY - surfaces[i]);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

// 층 인덱스(0~3)의 표면 y. 범위를 벗어나면 가장 가까운 끝으로 clamp.
function floorSurfaceY(index) {
  const surfaces = activeFloorSurfaces();
  const i = Math.max(0, Math.min(index, surfaces.length - 1));
  return surfaces[i];
}

// 한 글자(문자)가 어떤 타일인지 정의한다.
// solid: 충돌 대상인지(다음 단계에서 사용). color: 렌더 색.
// spawn/goal 같은 마커는 타일이 아니라 위치 정보로만 쓰이므로 비어 있는 칸으로 취급한다.
// oneWay: 위에서 떨어질 때만 막히는 원웨이 플랫폼(점프로 뚫고 올라가고,
//   아래+점프로 뚫고 내려갈 수 있음). 땅(#)은 oneWay=false라 사방이 막힌다.
const TILES = {
  ".": { name: "empty", solid: false, oneWay: false, color: null },
  "#": { name: "ground", solid: true, oneWay: false, color: "#3a4256" },
  "=": { name: "platform", solid: true, oneWay: true, color: "#566180" },
  "^": { name: "spike", solid: false, oneWay: false, color: "#c8506b" }, // 충돌 처리는 이후 단계
};

// 위치 마커: 타일 격자에는 빈 칸으로 들어가고, 파싱 시 좌표만 따로 뽑는다.
const MARKERS = {
  P: "spawn",
  G: "goal",
};

// 스테이지 데이터. 각 행의 길이는 같아야 한다(파서에서 검증).
// 맵은 가로 75 x 세로 30 타일 = 1500 x 600px (TILE_SIZE 20 기준).
// canvas(1000x600)보다 가로로 넓어 가로 스크롤이 일어난다.
//
// 사료스탕스는 4층 구조다(세로 선호 추격 AI용, wiki enemy-ai-and-locomotion).
// 한 층 간격 = 80px = 4타일 → 점프 수치(최소 91px/최대 150px)로 "최소 점프 한 층↑,
// 최대 점프로도 2층은 ✗"가 성립한다. 표면(발 닿는 면) y와 타일 행:
//   4층(맨 위) y=260 row13 / 3층 y=340 row17 / 2층 y=420 row21 / 1층 바닥 y=500 row25.
// 1층(바닥)은 낭떠러지 없이 꽉 찬 #(적이 빠지지 않게). 2~4층은 원웨이 발판(=)을
// 끊긴 구간으로 깔아 점프/드롭스루로 층을 오간다. 플레이어 스폰 P는 2층.
const STAGES = {
  사료스탕스: [
    "...........................................................................", // 0
    "...........................................................................", // 1
    "...........................................................................", // 2
    "...........................................................................", // 3
    "...........................................................................", // 4
    "...........................................................................", // 5
    "...........................................................................", // 6
    "...........................................................................", // 7
    "...........................................................................", // 8
    "...........................................................................", // 9
    "...........................................................................", // 10
    "...........................................................................", // 11
    "...........................................................................", // 12
    "......==============............==============............=================", // 13 (4층 표면 y260)
    "...........................................................................", // 14
    "...........................................................................", // 15
    "...........................................................................", // 16
    "===========........==============........==============........============", // 17 (3층 표면 y340)
    "...........................................................................", // 18
    "............P..............................................................", // 19 (2층 발판 위 스폰)
    "...........................................................................", // 20
    "..........=============........=============........=============..........", // 21 (2층 표면 y420)
    "...........................................................................", // 22
    "...........................................................................", // 23
    "...........................................................................", // 24
    "###########################################################################", // 25 (1층 바닥 표면 y500)
    "###########################################################################", // 26
    "###########################################################################", // 27
    "###########################################################################", // 28
    "###########################################################################", // 29
  ],
};

// 더미 스테이지 생성기(스테이지 셀렉트 동작 확인용 임시 맵). 평평한 바닥 +
// 양 끝 spawn(P)/goal(G) + 위쪽 발판 한 줄. 실제 맵은 이후 단계에서 교체한다.
function makeFlatStage(cols, rows, platformCol) {
  const empty = ".".repeat(cols);
  const grid = [];
  for (let r = 0; r < rows; r++) {
    if (r === rows - 1) {
      grid.push("#".repeat(cols)); // 바닥
    } else if (r === rows - 2) {
      const arr = empty.split(""); // spawn 왼쪽, goal 오른쪽
      arr[1] = "P";
      arr[cols - 2] = "G";
      grid.push(arr.join(""));
    } else if (r === rows - 7) {
      const arr = empty.split(""); // 가운데 위쪽 발판
      for (let i = 0; i < 6 && platformCol + i < cols; i++) arr[platformCol + i] = "=";
      grid.push(arr.join(""));
    } else {
      grid.push(empty);
    }
  }
  return grid;
}

// 스테이지 2(다야/비비/키디언). 사료스탕스와 같은 4층 구조(표면 y/행을 공유하므로
// 기본 층 좌표 DEFAULT_FLOOR_SURFACES_Y를 그대로 쓴다)지만, 메인 발판이 불규칙하게 잦게 끊겨 있고
// 층과 층 '사이'(반층: row23/19/15)에도 발판이 드문드문 있다 — 세로 이동이 더
// 들쭉날쭉해진다. 1층(바닥)은 사료스탕스처럼 꽉 찬 #(다야가 맨 오른쪽에 앉는다).
//   메인 층 표면 행: 4층 row13(y260) / 3층 row17(y340) / 2층 row21(y420) / 1층 row25(y500).
//   반층 발판 행: row15(3·4층 사이) / row19(2·3층 사이) / row23(1·2층 사이).
// 발판은 (행, 시작열, 길이) 목록으로 찍어 길이 75를 자동으로 맞춘다(손으로 세지 않게).
function makeDayaStage() {
  const COLS = 75;
  const ROWS = 30;
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill("."));
  const put = (r, c, len, ch = "=") => {
    for (let i = 0; i < len && c + i < COLS; i++) grid[r][c + i] = ch;
  };
  // 1층 바닥: 꽉 찬 #(적이 빠지지 않게). row25~29.
  for (let r = 25; r < ROWS; r++) for (let c = 0; c < COLS; c++) grid[r][c] = "#";
  // 메인 4층·3층·2층 원웨이 발판(=): 불규칙한 길이/간격으로 잦게 끊는다.
  put(13, 5, 6); put(13, 16, 4); put(13, 27, 8); put(13, 43, 5); put(13, 58, 11); // 4층
  put(17, 2, 7); put(17, 13, 5); put(17, 26, 9); put(17, 41, 4); put(17, 54, 13); // 3층
  put(21, 7, 5); put(21, 18, 8); put(21, 33, 4); put(21, 45, 7); put(21, 61, 9); // 2층
  // 반층 발판(드문드문): 끊긴 메인 층을 잇는 디딤돌.
  put(15, 11, 3); put(15, 37, 3); put(15, 52, 3); // 3·4층 사이
  put(19, 23, 3); put(19, 50, 3); // 2·3층 사이
  put(23, 14, 3); put(23, 40, 3); put(23, 66, 3); // 1·2층 사이
  // 플레이어 스폰: 왼쪽 2층 발판 위(사료스탕스와 동일하게 P는 표면보다 살짝 위).
  grid[19][9] = "P";
  return grid.map((row) => row.join(""));
}

// 스테이지 3(실라/나이아/이프리트/가비아, 보상=불칼). 사료스탕스/스테이지2와 다른 전용
// 4층 맵 — 각 층이 맵 가로 전체를 꽉 채운다(좌우 공백 없음). 층 간격 140px = 7타일이라
// 2단점프(최대 312.5px)로 2층(280px)을 한 번에 넘는다(여유 약 32px). 점프 수치는
// 전역 공용이라 안 건드린다 — 층 간격만 넓혀 동일 물리로 "2단점프=2층"을 만든다.
//   층 표면 행/ y(= STAGE3_FLOOR_SURFACES_Y): 4층 row4(y80) / 3층 row11(y220) /
//   2층 row18(y360) / 1층 바닥 row25(y500). (표면 y = row*20)
// 1층(바닥)은 꽉 찬 #(적이 빠지지 않게, row25~29). 2~4층은 원웨이 발판(=)으로 가로 전체.
// 가비아 HP 연동 동적 붕괴(이후 단계)가 이 꽉 찬 층을 칸 단위로 무너뜨린다.
// 플레이어 스폰 P는 1층 왼쪽(바닥 바로 위).
function makeStage3() {
  const COLS = 75;
  const ROWS = 30;
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill("."));
  // 1층 바닥: 꽉 찬 #(row25~29).
  for (let r = 25; r < ROWS; r++) for (let c = 0; c < COLS; c++) grid[r][c] = "#";
  // 2~4층: 가로 전체를 채운 원웨이 발판(=).
  for (const r of [18, 11, 4]) for (let c = 0; c < COLS; c++) grid[r][c] = "=";
  // 플레이어 스폰: 1층 왼쪽(바닥 바로 위 칸).
  grid[24][3] = "P";
  return grid.map((row) => row.join(""));
}

// 2~7번 더미 맵(스테이지 2·3만 실제 맵). 너비를 조금씩 달리해 시각적으로 구분되게 한다.
STAGES["스테이지 2"] = makeDayaStage();
STAGES["스테이지 3"] = makeStage3();
STAGES["스테이지 4"] = makeFlatStage(60, 30, 26);
STAGES["스테이지 5"] = makeFlatStage(64, 30, 28);
STAGES["스테이지 6"] = makeFlatStage(58, 30, 22);
STAGES["스테이지 7"] = makeFlatStage(62, 30, 30);

// 1번 고정 스테이지: 타이틀 [시작]으로 진입한다(셀렉트에는 나오지 않음). 실제 맵.
const FIRST_STAGE = "사료스탕스";

// 스테이지 셀렉트에 표시되는 2~7번(6개). 각 스테이지는 보물 하나를 준다(1:1).
// 위3·아래3으로 배치된다. id는 STAGES의 키와 같아야 한다. (2~7은 현재 더미 맵)
// treasure는 클리어 시 얻는 보물 — 6개를 다 모으면 셀렉트 가운데에 최종 버튼이
// 생겨 11→8→9→10으로 진행한다(그 부분은 보물/클리어 시스템이 붙은 뒤 추가).
// 보물↔스테이지 매핑(설계의 미정 항목을 확정): 벨리타/프리클의 밧줄·지팡이 중
// 지팡이를 2번(다야/비비/키디언)으로 옮겨 6스테이지에 6보물을 1:1로 맞췄다.
const SELECT_STAGES = [
  { id: "스테이지 2", label: "스테이지 2", treasure: "지팡이" }, // 다야/비비/키디언
  { id: "스테이지 3", label: "스테이지 3", treasure: "불칼" }, // 실라/나이아/이프리트/가비아
  { id: "스테이지 4", label: "스테이지 4", treasure: "수의" }, // 림/셰이디
  { id: "스테이지 5", label: "스테이지 5", treasure: "새총" }, // M.E.O.W
  { id: "스테이지 6", label: "스테이지 6", treasure: "밧줄" }, // 벨리타/프리클
  { id: "스테이지 7", label: "스테이지 7", treasure: "왕관" }, // 에르핀/네르/죠안
];

// 이 스테이지가 스테이지 셀렉트로 돌아갈 수 있는 스테이지인가(=셀렉트에서 진입하는
// 2~7번). 1번(사료스탕스)과 엔드게임 스테이지는 셀렉트 경로가 아니라 false.
function isSelectStage(id) {
  return SELECT_STAGES.some((s) => s.id === id);
}

// 엔드게임 진행 순서(보물 6개 수집 후 가운데 버튼 → 이 순서: 11→8→9→10).
// 아직 실제 맵이 없어 휴면 상태다(이 id들은 STAGES에 없음 — 엔드게임 맵을 만들 때 채운다).
const ENDGAME_ORDER = ["이드 시온", "죠안 단독", "디아나", "엘드르"];

// 엔드게임 스테이지에서 승리 후 갈 '다음' 스테이지 id. 없으면 null(이동 버튼 no-op).
//   - 이드 시온(11)→죠안 단독(8)→디아나(9)→엘드르(10) 순으로 진행.
//   - 엘드르(10, 마지막 보스): 요청대로 이동 버튼은 만들되 동작 안 함 → null
//     (자연스럽게 ENDGAME_ORDER의 마지막이라 다음이 없음.)
// (엔드게임 스테이지가 아니면 null을 반환하므로 호출부에서 셀렉트 경로와 구분해 쓴다.)
function endgameNext(id) {
  const i = ENDGAME_ORDER.indexOf(id);
  if (i < 0) return null;
  return ENDGAME_ORDER[i + 1] || null;
}

// ASCII 행 배열을 게임이 쓰기 좋은 구조로 변환한다.
// 반환: { cols, rows, widthPx, heightPx, tiles[r][c], spawn{x,y}, goal{x,y} }
//   - tiles[r][c] 는 TILES 정의 객체
//   - spawn/goal 은 타일 중심의 픽셀 좌표(없으면 null)
function parseStage(rows, floorSurfaces) {
  if (!rows || rows.length === 0) {
    throw new Error("스테이지 데이터가 비어 있습니다.");
  }

  const numRows = rows.length;
  const numCols = rows[0].length;
  const tiles = [];
  let spawn = null;
  let goal = null;

  for (let r = 0; r < numRows; r++) {
    const line = rows[r];
    if (line.length !== numCols) {
      throw new Error(
        `스테이지 ${r}번째 행 길이(${line.length})가 첫 행(${numCols})과 다릅니다.`
      );
    }

    const rowTiles = [];
    for (let c = 0; c < numCols; c++) {
      const ch = line[c];

      // 위치 마커는 좌표만 기록하고 빈 칸 타일로 둔다.
      if (MARKERS[ch]) {
        const pos = {
          x: c * TILE_SIZE + TILE_SIZE / 2,
          y: r * TILE_SIZE + TILE_SIZE / 2,
        };
        if (MARKERS[ch] === "spawn") spawn = pos;
        else if (MARKERS[ch] === "goal") goal = pos;
        rowTiles.push(TILES["."]);
        continue;
      }

      const tile = TILES[ch];
      if (!tile) {
        throw new Error(`알 수 없는 타일 문자 '${ch}' (행 ${r}, 열 ${c})`);
      }
      rowTiles.push(tile);
    }
    tiles.push(rowTiles);
  }

  return {
    cols: numCols,
    rows: numRows,
    widthPx: numCols * TILE_SIZE,
    heightPx: numRows * TILE_SIZE,
    tiles,
    spawn,
    goal,
    // 이 스테이지의 층 표면 y 배열(세로 추격 AI·가시 등 층 헬퍼가 참조). 안 주면 기본값.
    floorSurfaces: floorSurfaces || DEFAULT_FLOOR_SURFACES_Y,
  };
}

// 이름으로 스테이지를 파싱해 반환한다. 스테이지3만 전용 층 좌표(간격 140px)를 쓰고
// 나머지는 기본(간격 80px) — 기존 스테이지1/2 동작은 그대로 유지된다.
function loadStage(name) {
  const rows = STAGES[name];
  if (!rows) throw new Error(`존재하지 않는 스테이지: ${name}`);
  const floorSurfaces = name === "스테이지 3" ? STAGE3_FLOOR_SURFACES_Y : DEFAULT_FLOOR_SURFACES_Y;
  return parseStage(rows, floorSurfaces);
}

// 격자 좌표(col, row)의 타일 객체를 반환한다. 스테이지 밖은 가상의 땅 타일로
// 본다(벽 밖으로 빠지지 않게).
const OUT_OF_BOUNDS_TILE = { name: "oob", solid: true, oneWay: false, color: null };
function tileAt(stage, col, row) {
  if (col < 0 || col >= stage.cols || row < 0 || row >= stage.rows) {
    return OUT_OF_BOUNDS_TILE;
  }
  return stage.tiles[row][col];
}

// (col, row)가 solid인지. 스테이지 밖은 solid. 충돌 처리에서 사용.
function isSolidAt(stage, col, row) {
  return tileAt(stage, col, row).solid;
}
