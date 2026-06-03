// [은퇴됨] 이 220줄 통합 driver는 tools/test/(확장형 하니스)로 전부 이관됐다.
// 로드/중복 검사 → cases/_load.js, 스테이지2 보스 스모크 → cases/stage2.js(보스별 named 케이스).
// 기존 호출처(메모리·문서의 `node tools/verify-split.js`) 호환을 위해 tools/test.js를
// 부르는 얇은 래퍼로만 남긴다. 새 검증은 tools/test.js에 케이스를 추가하라.
//   node tools/test.js            전체
//   node tools/test.js stage2     파일/suite명 부분일치 필터
require("./test.js");
