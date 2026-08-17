(function(){
  const TRACK_H = 170;
  const CUT_TOP = 0;
  const CUT_BOTTOM = TRACK_H;
  const MAX_LIVES = 5;

  let round = 1;
  let cutY = CUT_TOP;
  let cutDir = 1;
  let cutSpeed = 80;

  let bobPhase = 0;
  let bobAmp = 10;
  let bobFreq = 0.6;

  let score = 0;
  let lives = MAX_LIVES;
  let locked = false;
  let gameOver = false;
  let lastTime = null;

  const track = document.getElementById('track');
  const stage = document.querySelector('.stage');
  const cutline = document.getElementById('cutline');

  const fingerEls = { A: document.getElementById('fingerA'), B: document.getElementById('fingerB') };
  const ctxs = {
    A: document.getElementById('canvasA').getContext('2d'),
    B: document.getElementById('canvasB').getContext('2d'),
  };
  let activeSide = 'A';

  // 가로 위치는 항상 고정 — finger-container가 420% 폭이라, 이 값만큼 당겨야 손톱이
  // 트랙 안에 보임(이미지 상 손톱이 가로 73~76% 지점에 있는 것과 대응). 라운드 전환은
  // 세로(Y)축으로 하되, 나가는 손/들어오는 손 둘 다 화면 "아래"를 씀 — 잘린 손이
  // 아래로 사라지고, 새 손이 그 아래에서 다시 올라오는 구조.
  const POS_X = '-75.6%';
  const POS_CENTER_Y = '0px';
  const POS_BELOW_Y = '115vh';

  function setPos(side, yPos, bobPx){
    fingerEls[side].style.transform = `translate(${POS_X}, calc(${yPos} + ${bobPx}px))`;
  }

  const CROP_X = 0, CROP_Y = 0, CROP_W = 2459.07, CROP_H = 3894;
  const NAIL_TOP_SVG = 8, NAIL_BOTTOM_SVG = 550;

  // 손톱의 실제 끝~끝 범위를 손으로 맞춘 숫자가 아니라, 실제로 .finger-container가
  // 화면에 렌더링된 높이에서 직접 계산 — width%를 바꿔도 항상 자동으로 맞음.
  // TOP = 손톱 끝(진짜 그림 상 위치), BOTTOM = 손톱 끝(너무 깊음 경계).
  const fingerHeightPx = fingerEls.A.getBoundingClientRect().height;
  const TOP = fingerHeightPx * (NAIL_TOP_SVG / CROP_H);
  const BOTTOM = fingerHeightPx * (NAIL_BOTTOM_SVG / CROP_H);

  // 판정 등급을 이 구간(TOP~BOTTOM) 안에서 0~1 비율로 나눔 — 숫자 하나로 직관적으로
  // 조절됨. TOO_LONG_RATIO를 올리면 "너무 김" 구간이 넓어지고, 내리면 좁아짐.
  // TOO_LONG_RATIO ~ PERFECT_RATIO 사이는 전부 GOOD.
  const TOO_LONG_RATIO = 0.60;
  const PERFECT_RATIO = 0.92;

  // 트랙 좌표(px)를 커트라인이랑 완전히 같은 기준으로 SVG y좌표로 직접 변환.
  // ratio를 거치는 간접 계산이 아니라 TOP/BOTTOM을 만들 때 쓴 것과 동일한 변환이라,
  // 커트라인이 있는 위치 = 실제로 잘리는 위치가 항상 보장됨.
  function svgYFromTrackPx(px){
    return px * CROP_H / fingerHeightPx;
  }

  const nailImg = new Image();
  let imgReady = false;
  nailImg.onload = () => {
    imgReady = true;
    drawNail(ctxs.A, NAIL_TOP_SVG);
    drawNail(ctxs.B, NAIL_TOP_SVG);
  };
  nailImg.src = 'images/nail.svg';

  // PERFECT 판정 전용 손톱 그림 — 실제로 잘려나간 모양을 직접 그린 에셋.
  // 원본(nail.svg, 높이 3894)보다 짧게 잘려서 새로 내보낸 파일이라, 아래쪽(손 몸통) 기준으로
  // 맞추면 원본과 같은 위치에 겹쳐진다고 함 — 그래서 CROP_H 기준 바닥 정렬로 그림.
  const CUT_SVG_W = 2455.99, CUT_SVG_H = 3445.53;
  const CUT_Y_OFFSET = CROP_H - CUT_SVG_H;
  const nailCutImg = new Image();
  let cutImgReady = false;
  nailCutImg.onload = () => { cutImgReady = true; };
  nailCutImg.src = 'images/nail-cut.svg';

  function drawPerfectNail(targetCtx){
    if(!cutImgReady) return false;
    targetCtx.clearRect(0, 0, CROP_W, CROP_H);
    targetCtx.drawImage(nailCutImg, 0, 0, CUT_SVG_W, CUT_SVG_H,
      (CROP_W - CUT_SVG_W) / 2, CUT_Y_OFFSET, CUT_SVG_W, CUT_SVG_H);
    return true;
  }

  function drawNail(targetCtx, cutBoundaryY){
    if(!imgReady) return;
    targetCtx.clearRect(0, 0, CROP_W, CROP_H);
    targetCtx.drawImage(nailImg, CROP_X, CROP_Y, CROP_W, CROP_H, 0, 0, CROP_W, CROP_H);
    targetCtx.save();
    targetCtx.globalCompositeOperation = 'destination-out';
    targetCtx.fillRect(0, 0, CROP_W, Math.max(0, cutBoundaryY - CROP_Y));
    targetCtx.restore();
  }

  // 잘려나가는 조각 — Matter.js로 실제 낙하/충돌하며 쌓이는 버전.
  const { Engine, World, Bodies, Body, Sleeping } = Matter;
  const MAX_PIECES = 20; // 오래 플레이해도 바디 수가 무한정 안 늘어나게 캡
  const DEBUG_COLLISION = false; // 개발용: 실제 충돌 박스를 빨간 테두리로 표시. 켜려면 true로.
  const COLLISION_SHRINK = 1; // 충돌 박스를 그림 크기 대비 0.3% 축소

  const engine = Engine.create({ enableSleeping: true });
  const world = engine.world;
  const activePieces = []; // { el, body, w, h }

  let wallFloor, wallLeft, wallRight;
  function buildWalls(){
    if(wallFloor) World.remove(world, [wallFloor, wallLeft, wallRight]);
    const w = window.innerWidth, h = window.innerHeight, t = 100;
    wallFloor = Bodies.rectangle(w/2, h + t/2, w + t*2, t, { isStatic:true });
    wallLeft  = Bodies.rectangle(-t/2, h/2, t, h*2, { isStatic:true });
    wallRight = Bodies.rectangle(w + t/2, h/2, t, h*2, { isStatic:true });
    World.add(world, [wallFloor, wallLeft, wallRight]);
  }
  buildWalls();
  window.addEventListener('resize', buildWalls);

  function clearPieces(){
    for(const p of activePieces){
      World.remove(world, p.body);
      p.el.remove();
      if(p.debugEl) p.debugEl.remove();
    }
    activePieces.length = 0;
  }

  // OUCH(관절까지 잘림) 났을 때 이미 쌓인 조각 더미에 충격을 줘서 흔들리게 함.
  function shakePile(){
    for(const p of activePieces){
      Sleeping.set(p.body, false);
      Body.setVelocity(p.body, {
        x: p.body.velocity.x + (Math.random() - 0.5) * 10,
        y: p.body.velocity.y - (2 + Math.random() * 4),
      });
      Body.setAngularVelocity(p.body, p.body.angularVelocity + (Math.random() - 0.5) * 0.5);
    }
  }

  // 손톱은 CROP_W(2459px) 전체 폭 중 일부(y=8일 때 69px ~ y=550일 때 363px)만 차지함.
  // 원래는 getImageData로 불투명 픽셀 경계를 런타임에 스캔했는데, file://로 열면 SVG를
  // 캔버스에 그린 뒤 픽셀을 읽으려 할 때 "tainted canvas" SecurityError가 나서 게임이
  // 멈춰버림(http://에서는 안 남 — origin 판정이 프로토콜마다 다름). 그래서 images/nail.svg를
  // 미리 스캔해 y별 좌우 경계(0~h 누적 min/max)를 표로 박아두고 선형보간만 함 — 픽셀
  // 읽기 자체를 안 하니 file://에서도 항상 안전하게 동작. 에셋(nail.svg)이 바뀌면 재측정 필요.
  const NAIL_X_BOUNDS = [
    [0, 1781, 1813], [20, 1748, 1863], [40, 1729, 1880], [60, 1715, 1888],
    [80, 1704, 1897], [100, 1699, 1907], [140, 1698, 1920], [200, 1695, 1937],
    [300, 1695, 1960], [400, 1695, 1984], [500, 1695, 2006], [560, 1686, 2062],
  ];
  function nailXBoundsAt(y){
    const t = NAIL_X_BOUNDS;
    if(y <= t[0][0]) return [t[0][1], t[0][2]];
    for(let i = 1; i < t.length; i++){
      if(y <= t[i][0]){
        const [y0, min0, max0] = t[i - 1];
        const [y1, min1, max1] = t[i];
        const f = (y - y0) / (y1 - y0);
        return [min0 + (min1 - min0) * f, max0 + (max1 - max0) * f];
      }
    }
    const last = t[t.length - 1];
    return [last[1], last[2]];
  }

  // 모든 조각은 항상 소스 y=0(손톱 팁)에서 시작하므로 팁 폭은 조각마다 다시 잴 필요 없이
  // 고정값 — 조각별로 다른 건 반대쪽 끝(절단면, y=h) 폭뿐.
  const NAIL_TIP_BOUNDS = nailXBoundsAt(0);
  const NAIL_TIP_W = Math.max(1, NAIL_TIP_BOUNDS[1] - NAIL_TIP_BOUNDS[0]);

  function extractCutPiece(cutBoundaryY){
    const h = Math.max(1, Math.round(cutBoundaryY - CROP_Y));
    const [minXf, maxXf] = nailXBoundsAt(h);
    const PAD = 4;
    const minX = Math.max(0, Math.floor(minXf) - PAD);
    const maxX = Math.min(CROP_W, Math.ceil(maxXf) + PAD);
    const srcW = Math.max(1, maxX - minX);

    const piece = document.createElement('canvas');
    piece.className = 'cut-piece';
    piece.width = srcW;
    piece.height = h;
    const pieceCtx = piece.getContext('2d');
    pieceCtx.drawImage(nailImg, CROP_X + minX, CROP_Y, srcW, h, 0, 0, srcW, h);

    // 절단면(방금 잘린 아래쪽 끝)은 원본 그림에 원래 테두리가 없어서, 나머지 손톱
    // 윤곽선과 통일감 있게 검은 선을 그려줌. 위/좌우는 원본 SVG 외곽선을 그대로 씀.
    const CUT_EDGE_LINE_PX = 5; // 소스(2459px 기준) 단위 두께 — 화면에선 스케일만큼 축소돼 보임
    const lineW = srcW * 0.9;
    pieceCtx.fillStyle = '#000';
    pieceCtx.fillRect((srcW - lineW) / 2, Math.max(0, h - CUT_EDGE_LINE_PX), lineW, CUT_EDGE_LINE_PX);

    return { piece, srcMinX: minX, srcW, h };
  }

  function spawnCutPiece(side, cutBoundaryY){
    if(!imgReady || cutBoundaryY <= 0) return;
    const rect = fingerEls[side].getBoundingClientRect();
    const scale = rect.height / CROP_H; // 폭/높이 동일 비율(종횡비 유지)이라 스케일 공유
    const dispH = Math.max(2, (cutBoundaryY - CROP_Y) * scale);

    const { piece, srcMinX, srcW, h } = extractCutPiece(cutBoundaryY);
    const dispW = Math.max(2, srcW * scale);
    piece.style.width = dispW + 'px';
    piece.style.height = dispH + 'px';

    // 조각은 항상 팁(y=0, 폭 고정) → 절단면(y=h, 폭은 그때그때 다름)으로 좁아지는 모양이
    // 이미 정해져 있음 — 매 판정마다 픽셀을 다시 스캔할 필요 없이 절단면 폭만 표에서
    // 찾으면 사다리꼴 하나로 사각형보다 훨씬 실제 손톱 윤곽에 가까운 충돌 영역이 나옴.
    const [botMinX, botMaxX] = nailXBoundsAt(h);
    const botW = Math.max(1, botMaxX - botMinX);
    // 팁(위)/절단면(아래) 폭 비율. Matter의 Bodies.trapezoid는 slope를 "윗변을 얼마나
    // 깎아낼지"로 해석해서 top = width*(1-slope)임 — topBotRatio를 그대로 slope에 넣으면
    // 반대로(거의 사각형으로) 나오므로, 실제 physics 바디에 넘길 때는 (1-topBotRatio)를 씀.
    const topBotRatio = Math.min(1, Math.max(0.02, NAIL_TIP_W / botW));

    // 사다리꼴의 실제 무게중심은 기하학적 중앙이 아니라 넓은 쪽(절단면)에 더 쏠려있음
    // (표준 사다리꼴 무게중심 공식). Matter는 항상 무게중심을 기준으로 회전시키므로,
    // 화면에 그려지는 캔버스도 같은 지점을 기준으로 돌아야 어긋나지 않음 — 그래서
    // transform-origin을 50%/50%가 아니라 이 비율로 맞춤.
    const originFrac = (NAIL_TIP_W + 2 * botW) / (3 * (NAIL_TIP_W + botW));
    piece.style.transformOrigin = `50% ${(originFrac * 100).toFixed(2)}%`;
    document.body.appendChild(piece);

    // 충돌 박스를 실제 그림 크기보다 살짝 줄여서(0.3%), 조각끼리 쌓일 때 틈이 뜨는 대신
    // 미세하게 겹쳐 보이도록 함 — 빈 공간이 생기는 것보다 이쪽이 자연스러움.
    const trapW = botW * scale * COLLISION_SHRINK;
    const trapH = dispH * COLLISION_SHRINK;

    let debugEl = null;
    if(DEBUG_COLLISION){
      debugEl = document.createElement('div');
      debugEl.className = 'debug-box';
      debugEl.style.width = trapW + 'px';
      debugEl.style.height = trapH + 'px';
      debugEl.style.transformOrigin = `50% ${(originFrac * 100).toFixed(2)}%`;
      const topPct = ((1 - topBotRatio) / 2 * 100).toFixed(2);
      debugEl.style.clipPath = `polygon(${topPct}% 0%, ${100 - topPct}% 0%, 100% 100%, 0% 100%)`;
      document.body.appendChild(debugEl);
    }

    // 손톱을 깎아낸 지점(실제 손톱 픽셀 중심)에서 살짝 튕겨나가는 초기 속도.
    const spawnX = rect.left + (srcMinX + srcW / 2) * scale;
    const spawnY = rect.top + dispH / 2;
    const body = Bodies.trapezoid(spawnX, spawnY, trapW, trapH, 1 - topBotRatio, {
      restitution: 0.35,
      friction: 0.6,
      frictionAir: 0.02,
      density: 0.002,
    });
    Body.setAngle(body, (Math.random() - 0.5) * 0.6);
    // 자른 순간 충격을 받은 것처럼 조각이 위로 통! 튀어오른 뒤 중력에 끌려 떨어지도록 함
    Body.setVelocity(body, { x: (Math.random() - 0.5) * 8, y: -(6 + Math.random() * 4) });
    Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.5);
    World.add(world, body);

    activePieces.push({ el: piece, debugEl, body, w: dispW, h: dispH, bw: trapW, bh: trapH, originFrac });
    if(activePieces.length > MAX_PIECES){
      const old = activePieces.shift();
      World.remove(world, old.body);
      old.el.remove();
      if(old.debugEl) old.debugEl.remove();
    }
  }

  setPos('A', POS_CENTER_Y, 0);
  setPos('B', POS_BELOW_Y, 0);
  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');
  const gameoverEl = document.getElementById('gameover');
  const finalscoreEl = document.getElementById('finalscore');

  function buildLives(){
    livesEl.innerHTML = '';
    for(let i=0;i<MAX_LIVES;i++){
      const d = document.createElement('div');
      d.className = 'life';
      livesEl.appendChild(d);
    }
  }

  function renderLives(){
    const items = livesEl.querySelectorAll('.life');
    items.forEach((el, i) => {
      el.classList.toggle('lost', i >= lives);
    });
  }

  function currentBob(){
    return Math.sin(bobPhase) * bobAmp;
  }

  function newRound(){
    drawNail(ctxs[activeSide], NAIL_TOP_SVG);
    cutY = CUT_TOP;
    cutDir = 1;
    locked = false;
  }

  function startSwap(){
    const outSide = activeSide;
    const inSide = activeSide === 'A' ? 'B' : 'A';

    drawNail(ctxs[inSide], NAIL_TOP_SVG);
    fingerEls[inSide].classList.remove('slide-out', 'slide-in');
    setPos(inSide, POS_BELOW_Y, 0);
    void fingerEls[inSide].offsetWidth;

    fingerEls[outSide].classList.add('slide-out');
    fingerEls[inSide].classList.add('slide-in');
    setPos(outSide, POS_BELOW_Y, 0);
    setPos(inSide, POS_CENTER_Y, 0);

    setTimeout(()=>{
      fingerEls[outSide].classList.remove('slide-out');
      fingerEls[inSide].classList.remove('slide-in');
      activeSide = inSide;
      newRound();
    }, 350);
  }

  function showFeedback(text, color){
    const fb = document.createElement('div');
    fb.className = 'feedback';
    fb.textContent = text;
    fb.style.color = color;
    stage.appendChild(fb);
    setTimeout(()=>fb.remove(), 800);
  }

  function triggerGameOver(){
    gameOver = true;
    finalscoreEl.textContent = 'SCORE ' + score;
    gameoverEl.classList.add('show');
    clearPieces();
  }

  function resetGame(){
    round = 1;
    cutSpeed = 80;
    bobAmp = 10;
    bobFreq = 0.6;
    score = 0;
    lives = MAX_LIVES;
    gameOver = false;
    scoreEl.textContent = 0;
    renderLives();
    gameoverEl.classList.remove('show');
    newRound();
  }

  function onCut(){
    // 하드모드 진입 화면(카메라 켜기 안내)이 떠있는 동안은 클릭/스페이스가 버블링돼도 무시.
    if(!camOverlay.classList.contains('hidden')) return;
    if(gameOver){
      resetGame();
      return;
    }
    if(locked) return;
    locked = true;

    const bob = currentBob();
    const localY = cutY - bob;

    let result, color, points;
    let missedKnuckle = false;
    let isPerfect = false;

    if(localY > BOTTOM){
      result = 'OUCH'; color = 'black'; points = -50;
      missedKnuckle = true;
      fingerEls[activeSide].classList.add('hit');
      setTimeout(()=>fingerEls[activeSide].classList.remove('hit'), 250);
      shakePile();
      document.body.classList.add('flash');
      setTimeout(()=>document.body.classList.remove('flash'), 300);
    } else {
      const ratio = (localY - TOP) / (BOTTOM - TOP);
      if(ratio < TOO_LONG_RATIO){ result = 'TOO LONG'; color = 'black'; points = 0; }
      else if(ratio > PERFECT_RATIO){ result = 'PERFECT'; color = 'black'; points = 50; isPerfect = true; }
      else { result = 'GOOD'; color = 'black'; points = 30; }
    }

    score += points;
    scoreEl.textContent = score;

    if(isPerfect && drawPerfectNail(ctxs[activeSide])){
      spawnCutPiece(activeSide, CUT_Y_OFFSET);
    } else {
      const cutBoundaryY = svgYFromTrackPx(localY);
      drawNail(ctxs[activeSide], cutBoundaryY);
      // OUCH(관절까지 잘림)는 비주얼이 징그러워서 조각을 만들지 않음
      if(!missedKnuckle){
        spawnCutPiece(activeSide, cutBoundaryY);
      }
    }

    showFeedback(result, color);

    if(missedKnuckle){
      lives--;
      renderLives();
      if(lives <= 0){
        setTimeout(triggerGameOver, 500);
        return;
      }
    }

    round++;
    cutSpeed = Math.min(340, cutSpeed + 18);

    if(hardMode){
      // 하드모드: 곧바로 다음 라운드로 넘어가지 않고, 최소 지연 후 "입을 다시 벌릴 때까지" 대기.
      // processMouth()가 매 프레임 readyForSwap && stableMouthOpen을 확인해서 실제로 startSwap() 호출.
      setTimeout(()=>{ readyForSwap = true; }, 700);
    } else {
      setTimeout(startSwap, 700);
    }
  }

  function tick(t){
    if(lastTime === null) lastTime = t;
    const dtMs = Math.min(t - lastTime, 1000 / 30); // 탭 백그라운드 복귀 등 큰 점프 방지
    const dt = dtMs / 1000;
    lastTime = t;

    processMouth();

    Engine.update(engine, dtMs);
    for(const p of activePieces){
      // 사다리꼴은 무게중심이 세로 중앙이 아니라 p.originFrac 지점이라(위쪽 참고),
      // translate 기준점도 폭은 절반이지만 높이는 그 비율만큼 어긋나게 맞춰야
      // CSS transform-origin(피사체 쪽에서 맞춘 값)과 회전축이 일치함.
      p.el.style.transform = `translate(${p.body.position.x - p.w / 2}px, ${p.body.position.y - p.h * p.originFrac}px) rotate(${p.body.angle}rad)`;
      if(p.debugEl){
        p.debugEl.style.transform = `translate(${p.body.position.x - p.bw / 2}px, ${p.body.position.y - p.bh * p.originFrac}px) rotate(${p.body.angle}rad)`;
      }
    }

    if(!locked && !gameOver){
      cutY += cutDir * cutSpeed * dt;
      if(cutY >= CUT_BOTTOM){ cutY = CUT_BOTTOM; cutDir = -1; }
      if(cutY <= CUT_TOP){ cutY = CUT_TOP; cutDir = 1; }
      cutline.style.top = cutY + 'px';

      bobPhase += bobFreq * dt * Math.PI * 2;
      const bob = currentBob();
      setPos(activeSide, POS_CENTER_Y, bob);
    }

    requestAnimationFrame(tick);
  }

  document.addEventListener('click', onCut);
  document.addEventListener('keydown', (e)=>{
    if(e.code === 'Space'){ e.preventDefault(); onCut(); }
  });

  buildLives();

  // ===== 모드 전환 — 기본값은 버튼(클릭/스페이스)모드. 우상단 버튼으로 하드모드 토글. =====
  let hardMode = false;
  const modeToggleBtn = document.getElementById('mode-toggle-btn');

  // ===== 하드모드: ml5 FaceMesh로 입 벌림/다뭄 감지 =====
  // "입을 벌리면 ready, 닫으면 cut"을 기존 click/space onCut()에 그대로 얹음 — 판정
  // 로직은 안 건드리고 트리거만 하나 더 추가. click/space는 테스트용으로 계속 살려둠.
  const MOUTH_OPEN_THRESHOLD = 0.4; // (입 벌린 세로거리)/(입 가로폭) 비율 — 카메라/거리별 재조정 필요, mouth-debug 보면서 조절
  const MOUTH_DEBOUNCE_FRAMES = 4;  // 랜드마크 노이즈로 인한 깜빡임 방지

  const camVideo = document.getElementById('cam-video');
  const camOverlay = document.getElementById('cam-start');
  const camStartBtn = document.getElementById('cam-start-btn');
  const camStatus = document.getElementById('cam-status');
  const mouthDebugEl = document.getElementById('mouth-debug');
  const camMeshCanvas = document.getElementById('cam-mesh-canvas');
  const meshCtx = camMeshCanvas.getContext('2d');
  const devUiBtn = document.getElementById('dev-ui-btn');

  let faceMesh = null;
  let faceMeshReady = false;
  let cameraStream = null;
  let faces = [];

  let stableMouthOpen = false;
  let mouthCandidate = false;
  let mouthStreak = 0;
  let readyForSwap = false; // 컷 끝나고 다음 라운드로 넘어갈 준비(입 다시 벌리길) 대기 중인지
  let devUiOn = false;

  // 입 아귀(61/291)와 입술 안쪽 위/아래(13/14) — MediaPipe FaceMesh 표준 인덱스.
  // 입 폭으로 나눠서 정규화 → 카메라와의 거리가 달라져도 비율은 비교적 일정하게 유지됨.
  function getMouthOpenRatio(face){
    const kp = face.keypoints;
    const top = kp[13], bottom = kp[14], left = kp[61], right = kp[291];
    if(!top || !bottom || !left || !right) return 0;
    const openDist = Math.hypot(bottom.x - top.x, bottom.y - top.y);
    const mouthWidth = Math.hypot(right.x - left.x, right.y - left.y);
    return mouthWidth > 0 ? openDist / mouthWidth : 0;
  }

  // 실제 카메라 영상은 화면에 안 그리고, ml5가 잡은 랜드마크 점만 캔버스에 그림
  // (video 엘리먼트는 detectStart용 소스로만 쓰이고 항상 display:none).
  function drawMeshPreview(face){
    meshCtx.fillStyle = '#111';
    meshCtx.fillRect(0, 0, camMeshCanvas.width, camMeshCanvas.height);
    if(!face) return;
    meshCtx.fillStyle = '#4dff4d';
    for(const p of face.keypoints){
      meshCtx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
    meshCtx.fillStyle = '#ff3b3b';
    [13, 14, 61, 291].forEach(i => {
      const p = face.keypoints[i];
      if(!p) return;
      meshCtx.beginPath();
      meshCtx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      meshCtx.fill();
    });
  }

  function processMouth(){
    if(!hardMode || !faceMesh) return; // 베이직모드/카메라 준비 전에는 tick()이 매 프레임 불러도 아무것도 안 함

    const face = faces && faces[0];
    const ratio = face ? getMouthOpenRatio(face) : 0;
    const rawMouthOpen = ratio > MOUTH_OPEN_THRESHOLD;

    if(rawMouthOpen === mouthCandidate){
      mouthStreak++;
    } else {
      mouthCandidate = rawMouthOpen;
      mouthStreak = 1;
    }
    const prevStable = stableMouthOpen;
    if(mouthStreak >= MOUTH_DEBOUNCE_FRAMES){
      stableMouthOpen = mouthCandidate;
    }

    if(devUiOn){
      mouthDebugEl.textContent = `mouth: ${ratio.toFixed(2)} (th ${MOUTH_OPEN_THRESHOLD}) — ${stableMouthOpen ? 'OPEN (ready)' : 'CLOSED'}${face ? '' : ' — no face'}`;
      drawMeshPreview(face);
    }

    // 벌림 → 다뭄으로 바뀌는 순간 = cut 액션 (스페이스/클릭이랑 동일한 onCut 호출)
    if(prevStable && !stableMouthOpen && !locked && !gameOver){
      onCut();
    }

    // "입을 벌리고 있어야 다음 손가락으로 넘어감" — 컷 후 최소 지연이 지나고, 입이 다시
    // 열린 상태를 확인해야만 실제로 다음 라운드로 스왑함.
    if(readyForSwap && stableMouthOpen){
      readyForSwap = false;
      startSwap();
    }
  }

  function updateDevUiVisibility(){
    const show = hardMode && devUiOn;
    camMeshCanvas.classList.toggle('hidden', !show);
    mouthDebugEl.classList.toggle('hidden', !show);
  }

  devUiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    devUiOn = !devUiOn;
    devUiBtn.textContent = devUiOn ? 'dev ui: on' : 'dev ui: off';
    updateDevUiVisibility();
  });

  function tryStart(){
    if(!faceMeshReady || !cameraStream) return;
    faceMesh.detectStart(camVideo, (results) => { faces = results; });
    camOverlay.classList.add('hidden');
  }

  // 모델 로딩(특히 mediapipe 런타임의 WASM/모델 파일 다운로드)이 카메라 권한 요청 이후에야
  // 시작되면 두 대기시간이 순차로 더해져서 체감이 매우 느려짐 — 그래서 모델은 카메라 권한과
  // 무관하게 페이지 로드 즉시 백그라운드로 미리 받기 시작함(하드모드로 아직 전환 안 했어도).
  //
  // ml5.faceMesh(options, callback)의 반환값은 그냥 Promise고, detectStart 등이 실제로
  // 있는 모델 인스턴스는 콜백의 "인자"로 들어옴 — 반환값을 저장해서 쓰면
  // "detectStart is not a function"이 남(직접 콘솔로 확인함).
  ml5.faceMesh({ maxFaces: 1, refineLandmarks: true, runtime: 'mediapipe' }, (model) => {
    faceMesh = model;
    faceMeshReady = true;
    tryStart();
  });

  function initCameraAndModel(){
    camStartBtn.disabled = true;
    camStatus.textContent = faceMeshReady ? '카메라 권한 요청 중...' : '카메라 권한 요청 중... (얼굴 인식 모델도 백그라운드에서 준비 중)';
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
      audio: false,
    }).then(stream => {
      camVideo.srcObject = stream;
      camVideo.play();
      cameraStream = stream;
      if(!faceMeshReady) camStatus.textContent = '얼굴 인식 모델 로딩 중...';
      tryStart();
    }).catch(err => {
      camStartBtn.disabled = false;
      camStatus.textContent = '카메라 접근 실패 — ' + err.message + ' (https 또는 localhost에서만 동작함)';
    });
  }

  function stopCamera(){
    if(faceMesh) faceMesh.detectStop();
    if(cameraStream){
      cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = null;
    }
    faces = [];
    stableMouthOpen = false;
    mouthCandidate = false;
    mouthStreak = 0;
    readyForSwap = false;
  }

  function enterHardMode(){
    hardMode = true;
    modeToggleBtn.textContent = 'Basic Mode';
    devUiBtn.classList.remove('hidden');
    camStatus.textContent = '';
    camStartBtn.disabled = false;
    camOverlay.classList.remove('hidden');
  }

  function enterBasicMode(){
    hardMode = false;
    modeToggleBtn.textContent = '하드모드';
    camOverlay.classList.add('hidden');
    devUiBtn.classList.add('hidden');
    devUiOn = false;
    devUiBtn.textContent = 'dev ui: off';
    updateDevUiVisibility();
    stopCamera();
  }

  modeToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if(hardMode) enterBasicMode(); else enterHardMode();
  });

  // stopPropagation 필수 — 안 하면 이 클릭이 document의 전역 onCut 리스너까지 버블링돼서
  // "시작" 버튼 누르는 순간 몰래 컷 1회가 실행됨(그 결과가 700ms 뒤 readyForSwap=true로
  // 남아있다가, 플레이어가 처음 입을 벌리는 순간 조기 스왑되어 손가락이 겹쳐 보이는 원인이었음).
  camStartBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    initCameraAndModel();
  });

  resetGame();
  requestAnimationFrame(tick);
})();
