# 우로스의 모험 (Uros Adventure)

순수 JavaScript / CSS / HTML로 만든 웹게임입니다. 빌드 도구 없이 정적 파일만으로 동작하며, GitHub Pages로 배포합니다.

## 구조

```
.
├── index.html              # 진입점
├── css/style.css           # 스타일
├── js/main.js              # 게임 루프 + 조작
└── .github/workflows/      # GitHub Pages 자동 배포
```

## 로컬에서 실행

별도 빌드가 필요 없습니다. 정적 서버로 열기만 하면 됩니다.

```powershell
# Python이 있는 경우
python -m http.server 8000
# 브라우저에서 http://localhost:8000 접속
```

또는 `index.html`을 브라우저로 직접 열어도 됩니다.

## 배포

`main` 브랜치에 push하면 GitHub Actions(`.github/workflows/deploy.yml`)가
GitHub Pages로 자동 배포합니다. 최초 1회는 저장소 **Settings → Pages →
Build and deployment → Source**를 **GitHub Actions**로 설정해야 합니다.

## 조작

- 방향키: 이동
- 화면 클릭/터치: 해당 위치로 이동
