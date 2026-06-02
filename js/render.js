// 우로스의 모험 — 렌더(맵·골·적·플레이어·히트박스·텔레그래프·UI 그리기)
// (main.js에서 분리. 전역 스코프 공유 → 분리는 코드 이동 + <script> 추가. 본문은
//  호출 시점 평가라 main.js의 camera·ctx·stage·player·enemies·hittables·getHurtbox·
//  getAttackHitbox·renderProjectiles(projectiles.js)·ScreenShake/applyZoomTransform
//  (effects.js)·drawActorSprite(sprites.js) 등을 call-time에 참조한다. main.js 뒤에 로드.)

// ---- 렌더 ----
function renderStage() {
  const startCol = Math.max(0, Math.floor(camera.x / TILE_SIZE));
  const endCol = Math.min(
    stage.cols - 1,
    Math.floor((camera.x + camera.viewWidth) / TILE_SIZE)
  );
  const startRow = Math.max(0, Math.floor(camera.y / TILE_SIZE));
  const endRow = Math.min(
    stage.rows - 1,
    Math.floor((camera.y + camera.viewHeight) / TILE_SIZE)
  );

  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const tile = stage.tiles[r][c];
      if (!tile.color) continue;
      ctx.fillStyle = tile.color;
      ctx.fillRect(
        c * TILE_SIZE - camera.x,
        r * TILE_SIZE - camera.y,
        TILE_SIZE,
        TILE_SIZE
      );
    }
  }
}

function renderGoal() {
  if (!stage.goal) return;
  ctx.fillStyle = "#ffd166";
  ctx.fillRect(
    stage.goal.x - camera.x - TILE_SIZE / 2,
    stage.goal.y - camera.y - TILE_SIZE,
    TILE_SIZE / 2,
    TILE_SIZE * 2
  );
}

// 적 상태별 색(무방비/위험 상태를 눈으로 구분). 우선순위가 높은 상태부터.
function enemyColor(enemy) {
  if (enemy.invincible) return "#9aa0a6"; // 무적 폭주: 회색(때려도 안 죽음)
  if (enemy.berserk) return "#ff5a3c"; // 폭주: 강렬한 주황빨강
  if (enemy.permaGroggy) return "#b08968"; // 영구 그로기: 흙빛(포식 대기)
  if (enemy.groggyTime > 0) return "#e8c547"; // 그로기: 노란빛
  return "#c8506b"; // 평소: 붉은색
}

// 떨군 단검(hittables): 땅에 꽂힌 작은 단검으로 그린다(공격판정 없음 — 표적일 뿐).
function renderHittables() {
  for (const obj of hittables) {
    if (!obj.alive) continue;
    const dx = obj.x - camera.x;
    const dy = obj.y - camera.y;
    const bladeH = obj.h * 0.6;
    ctx.fillStyle = "#c2ccd6"; // 칼날(강철빛)
    ctx.fillRect(dx + obj.w / 2 - 2, dy, 4, bladeH);
    ctx.fillStyle = "#6b4f3a"; // 가드(가로 막대)
    ctx.fillRect(dx, dy + bladeH, obj.w, 3);
    ctx.fillStyle = "#3a2a1a"; // 손잡이
    ctx.fillRect(dx + obj.w / 2 - 2, dy + bladeH + 3, 4, obj.h - bladeH - 3);
  }
}

function renderEnemies() {
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const edx = enemy.x - camera.x;
    const edy = enemy.y - camera.y;

    // 스프라이트가 있으면 그걸로(폴더명 = role: benny/lupo/tig), 없으면 색 박스 폴백.
    // role이 없는 일반 표적 적은 스프라이트 폴더가 없으니 항상 폴백한다.
    const actor = enemy.role || "_none";
    const drew = drawActorSprite(
      enemy.anim, actor, "enemy", edx, edy, enemy.w, enemy.h, enemy.facing < 0
    );

    if (!drew) {
      ctx.fillStyle = enemyColor(enemy);
      ctx.fillRect(edx, edy, enemy.w, enemy.h);
      // 색 박스일 때만 역할 라벨(스프라이트면 그림으로 구분되니 생략).
      if (enemy.role) {
        ctx.fillStyle = "#0e1117";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const label = { benny: "베니", lupo: "루포", tig: "티그", daya: "다야", bibi: "비비", kidian: "키디언" }[enemy.role];
        if (label) ctx.fillText(label, edx + enemy.w / 2, edy + enemy.h / 2);
      }
    }

    // 다야 방어력 수치를 머리 위에 표시(단검으로 깎이는 걸 눈으로 확인하는 테스트용).
    if (enemy.role === "daya") {
      ctx.fillStyle = "#e6edf3";
      ctx.font = "13px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(`방어력 ${enemy.defense.toFixed(2)}`, edx + enemy.w / 2, edy - 4);
    }

    // 키디언 봉인 진행도(라인 패링 누적 / 봉인 임계)를 머리 위에 표시 — 봉인이 곧
    // 처치이므로 '남은 패링 횟수'를 눈으로 읽게 한다. 광폭화(비비 포식) 중이면 패링·
    // 봉인이 불가하므로 진행도 대신 빨간 '광폭' 경고를 띄운다.
    if (enemy.role === "kidian") {
      ctx.font = "13px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      if (enemy.lineEnraged) {
        ctx.fillStyle = "#ff5a5a";
        ctx.fillText("광폭 (패링 불가)", edx + enemy.w / 2, edy - 4);
      } else {
        const need = enemy.ai.lineShooter.sealParries;
        ctx.fillStyle = "#c77dff";
        ctx.fillText(`봉인 ${enemy.lineParries || 0}/${need}`, edx + enemy.w / 2, edy - 4);
      }
    }

    // 방어막(#5): 충전이 남아 있으면 청록 테두리 + 남은 방어 횟수를 보여준다(공격을
    // 흡수할 때마다 줄어든다). 부서지면(0) 사라진다.
    if (enemy.shieldCharges > 0) {
      ctx.strokeStyle = "rgba(120, 200, 255, 0.9)";
      ctx.lineWidth = 3;
      ctx.strokeRect(edx - 5, edy - 5, enemy.w + 10, enemy.h + 10);
      ctx.fillStyle = "rgba(120, 200, 255, 0.12)";
      ctx.fillRect(edx - 5, edy - 5, enemy.w + 10, enemy.h + 10);
      ctx.fillStyle = "#8fd3ff";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(`방어막 ${enemy.shieldCharges}`, edx + enemy.w / 2, edy - 20);
    }

    // 공격 예고(windup) 텔레그래프: active 직전, 곧 뜰 히트박스를 흐리게 보여준다
    // (플레이어가 패링 타이밍을 읽도록). 힘겨루기 유발 공격은 붉게 강조한다.
    //   단 gap-closer(돌진/블링크)는 제자리 range 박스가 실제 타격(이동 경로/등 뒤
    //   순간이동)과 맞지 않아 지금은 그리지 않는다. 시스템은 남겨두므로, 나중에
    //   '경로/도착 지점' 전용 텔레그래프가 필요하면 여기 종류별 분기를 추가하면 된다.
    const tgSpec = enemy.attack;
    const showTelegraph =
      tgSpec && tgSpec.kind !== "dash" && tgSpec.kind !== "blink";
    if (showTelegraph && isAttackWindup(tgSpec, enemy.attackElapsed)) {
      const tb = makeAttackHitbox(getHurtbox(enemy), enemy.attackDir, tgSpec.range);
      ctx.fillStyle = tgSpec.triggersStruggle
        ? "rgba(255, 80, 80, 0.5)"
        : tgSpec.parryable === false
        ? "rgba(255, 140, 0, 0.5)" // 패링 불가(비비 #2): 주황 경고 = "막지 말고 피해라"
        : "rgba(230, 237, 243, 0.18)";
      ctx.fillRect(tb.x - camera.x, tb.y - camera.y, tb.w, tb.h);
    }

    // 적 공격 히트박스(active, 시각 확인용)
    const eHb = getEnemyAttackHitbox(enemy);
    if (eHb) {
      ctx.fillStyle = "rgba(200, 80, 107, 0.35)";
      ctx.fillRect(eHb.x - camera.x, eHb.y - camera.y, eHb.w, eHb.h);
    }
  }
}

function render() {
  // 캔버스 안에서 맵 바깥이 보이는 경우(맵이 뷰보다 작은 축)를 흰색으로 채운다.
  // 현재는 가로 1500>1000, 세로 600=600이라 캔버스가 맵으로 꽉 차지만,
  // 맵보다 큰 뷰가 되면 이 흰 바탕이 여백으로 드러난다. (캔버스 밖은 css가 흰색)
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ---- 월드 렌더(줌 적용) ----
  // 여기부터 restore까지는 월드 좌표(worldX - camera.x)를 그대로 쓰되, 줌 변환이
  // 걸린 채로 그려진다. 줌 밖(화면 고정) UI는 restore 뒤에 그린다.
  ctx.save();
  ctx.translate(ScreenShake.offsetX, ScreenShake.offsetY); // 충격파 화면 흔들림
  applyZoomTransform();

  // 맵 영역(월드 0,0 ~ widthPx,heightPx)에 어두운 바탕을 깔아 여백과 구분한다.
  ctx.fillStyle = "#0e1117";
  ctx.fillRect(
    0 - camera.x,
    0 - camera.y,
    stage.widthPx,
    stage.heightPx
  );

  renderStage();
  renderGoal();
  renderHittables();
  renderEnemies();
  renderProjectiles(); // 비비 단검(projectiles.js) — 적 위, 플레이어 아래

  // 플레이어 (월드 → 화면). 스프라이트가 있으면 그걸로, 없으면 색 박스 폴백.
  const pdx = player.x - camera.x;
  const pdy = player.y - camera.y;
  const pDrew = drawActorSprite(
    player.anim, "player", "player", pdx, pdy, player.w, player.h, player.facing < 0
  );
  if (!pDrew) {
    ctx.fillStyle = player.dead ? "#4caf50" : "#6cc6ff";
    ctx.fillRect(pdx, pdy, player.w, player.h);
  }

  // 플레이어 공격 히트박스(시각 확인용 — 패링 판정에 쓰는 동일한 박스)
  const hb = getAttackHitbox();
  if (hb) {
    ctx.fillStyle = "rgba(255, 209, 102, 0.35)";
    ctx.fillRect(hb.x - camera.x, hb.y - camera.y, hb.w, hb.h);
  }

  ctx.restore(); // ---- 월드 렌더 끝(줌 변환 해제). 이후는 화면 고정 UI ----

  // 패링 성사 연출: 화면 전체에 잠깐 밝은 플래시
  if (parryFlash > 0) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // 받는 피해 2배 디버프(비비 #2) 표시: 좌상단에 남은 시간을 붉게 알린다.
  if (player.vulnTime > 0) {
    ctx.fillStyle = "#ff6b6b";
    ctx.font = "16px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`받는 피해 2배  ${player.vulnTime.toFixed(1)}s`, 12, 12);
  }

  // 힘겨루기 UI: 상단에 안내 + 연타 게이지 바. 게이지가 가득 차면 승리(연타로 채움,
  // 초당 자연 감소). 화면 고정이라 줌/흔들림 영향을 받지 않는다.
  if (powerStruggle.active) {
    ctx.fillStyle = "#ffd166";
    ctx.font = "40px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("힘겨루기! 연타!", canvas.width / 2, 90);

    const gw = 420, gh = 28;
    const gx = (canvas.width - gw) / 2, gy = 130;
    const ratio = Math.max(0, Math.min(1, powerStruggle.gauge / POWER_STRUGGLE_GAUGE_MAX));
    ctx.fillStyle = "#2a3142"; // 바 배경
    ctx.fillRect(gx, gy, gw, gh);
    ctx.fillStyle = "#ffd166"; // 채워진 게이지
    ctx.fillRect(gx, gy, gw * ratio, gh);
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2;
    ctx.strokeRect(gx, gy, gw, gh);
  }
}
