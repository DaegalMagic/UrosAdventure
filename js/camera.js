// 우로스의 모험 - 카메라
//
// 스테이지가 화면보다 넓으므로(1.5배), 화면에 보일 영역을 따라다니게 한다.
// 카메라는 월드 좌표에서 "화면 좌상단이 가리키는 위치"(x, y)만 들고 있고,
// 렌더 시 모든 월드 좌표에서 이 값을 빼서 화면 좌표로 변환한다.
//
// 데드존(dead zone): 화면 중앙 영역 안에서는 카메라를 움직이지 않는다.
// 대상이 좌측 경계(기본 25% 지점)보다 왼쪽으로 가면 그제서야 좌로 스크롤,
// 우측 경계(75% 지점)보다 오른쪽으로 가면 우로 스크롤한다. 즉 끝단에
// 가까워져야 카메라가 따라온다. 세로도 동일.
//
// deadZoneRatio = 화면 한쪽 끝에서 경계까지의 비율. 0.25면 가운데 50%가 데드존.

class Camera {
  constructor(viewWidth, viewHeight, deadZoneRatio = 0.25) {
    this.viewWidth = viewWidth;
    this.viewHeight = viewHeight;
    this.deadZoneRatio = deadZoneRatio;
    this.x = 0;
    this.y = 0;
  }

  // 대상(월드 좌표)이 데드존을 벗어났을 때만 그 벗어난 만큼 카메라를 민다.
  follow(targetX, targetY, worldWidth, worldHeight) {
    this.x += this._dead(targetX - this.x, this.viewWidth);
    this.y += this._dead(targetY - this.y, this.viewHeight);
    this.clamp(worldWidth, worldHeight);
  }

  // 화면 좌표 screenPos(= world - camera)가 데드존 밖이면, 경계까지 되돌리는
  // 데 필요한 카메라 이동량을 반환한다. 안쪽이면 0(카메라 정지).
  _dead(screenPos, viewSize) {
    const left = viewSize * this.deadZoneRatio;
    const right = viewSize * (1 - this.deadZoneRatio);
    if (screenPos < left) return screenPos - left; // 음수 → 카메라 좌/상으로
    if (screenPos > right) return screenPos - right; // 양수 → 카메라 우/하로
    return 0;
  }

  clamp(worldWidth, worldHeight) {
    this.x = this._clampAxis(this.x, worldWidth, this.viewWidth);
    this.y = this._clampAxis(this.y, worldHeight, this.viewHeight);
  }

  // 맵(worldSize)이 뷰(viewSize)보다 크면 [0, world-view]로 가둔다(스크롤).
  // 맵이 뷰보다 작으면 카메라를 음수로 고정해 맵을 뷰 가운데에 둔다
  // (world-view < 0 의 절반). 그러면 월드 (0,0)은 화면에서 (view-world)/2 만큼
  // 안쪽으로 들어가 그려지고, 맵 바깥은 여백이 된다.
  _clampAxis(pos, worldSize, viewSize) {
    if (worldSize <= viewSize) {
      return (worldSize - viewSize) / 2; // 음수 → 가운데 정렬 오프셋
    }
    return Math.max(0, Math.min(worldSize - viewSize, pos));
  }
}
