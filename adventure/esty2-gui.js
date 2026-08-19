// EstyJS GUI wiring, trimmed down for the "박우성의 대모험" embed.
// Based on esty2-gui.js by Darren Coles (GPL-2.0) — https://github.com/kaiec/EstyJS
"use strict";

var estyjs = null;

function reset() {
	estyjs.reset();
}

function pauseResume() {
	var running = estyjs.pauseResume();
	document.querySelector("#btnPause span").innerHTML = running ? "Pause" : "Resume";
}

function soundToggle() {
	var sound = estyjs.soundToggle();
	document.querySelector("#btnSound span").innerHTML = sound ? "Sound off" : "Sound on";
}

function fullScreen() {
	var elem = document.getElementById("EstyJsOutput");
	if (elem.requestFullscreen) {
		elem.requestFullscreen();
	}
}

function openFile(fname) {
	estyjs.openFloppyFile('A', fname);
}

// #estyjs는 폭 1040px 고정 레이아웃(모니터 배경 이미지가 픽셀 단위로 패딩돼있어서
// 유동폭으로 만들기 어려움) — 화면이 좁으면 통째로 transform: scale로 축소하고,
// 줄어든 만큼 wrapper 높이도 같이 줄여서 아래 콘텐츠가 안 겹치게 함.
function fitEstyJs() {
	var box = document.getElementById("estyjs");
	var wrap = document.getElementById("estyjs-wrap");
	var naturalWidth = 1040;
	var availableWidth = wrap.clientWidth;
	var scale = Math.min(1, availableWidth / naturalWidth);
	box.style.transform = "scale(" + scale + ")";
	// transform-origin이 top left라 중앙 정렬은 여기서 직접 마진으로 계산
	// (flex justify-content + margin:auto 조합은 박스가 컨테이너보다 넓을 때
	// 브라우저마다 auto 마진 처리가 달라 오른쪽이 잘리는 문제가 있었음).
	var scaledWidth = naturalWidth * scale;
	box.style.marginLeft = Math.max(0, (availableWidth - scaledWidth) / 2) + "px";
	wrap.style.height = (box.offsetHeight * scale) + "px";
}

// 방향키(37/39)·스페이스(32)와 같은 keyCode로 keyboard.js의 document.onkeydown/onkeyup을
// 직접 호출 — 실제 키보드를 안 눌러도 눌린 것과 똑같이 인식됨.
function bindTouchKey(buttonId, keyCode) {
	var btn = document.getElementById(buttonId);
	var press = function (e) {
		e.preventDefault();
		document.onkeydown({ keyCode: keyCode });
	};
	var release = function (e) {
		e.preventDefault();
		document.onkeyup({ keyCode: keyCode });
	};
	btn.addEventListener("pointerdown", press);
	btn.addEventListener("pointerup", release);
	btn.addEventListener("pointercancel", release);
	btn.addEventListener("pointerleave", release);
}

document.addEventListener("DOMContentLoaded", function () {
	estyjs = EstyJs("EstyJsOutput");
	estyjs.setRowSkip(false);
	estyjs.setMonoMonitor(false);
	// 기본값(KeypadJoystick=true)이면 방향키가 키보드가 아니라 가상 조이스틱 포트로
	// 가로채져서, 키보드 입력을 읽는 이 게임에서는 방향키가 안 먹음 — 꺼줌.
	estyjs.setJoystick(false);

	// 에뮬레이션 루프는 setTimeout(...,20) 기반이라 이 동기 블록이 끝나기 전엔
	// 첫 프레임도 안 돎 — 그 전에 디스크를 넣어서 TOS가 AUTO 폴더를 스캔하는
	// 시점에 이미 디스크가 꽂혀 있도록 보장 (지연 삽입 시 타이밍 레이스 발생).
	openFile('./woosung-adventure.st');

	fitEstyJs();
	window.addEventListener("resize", fitEstyJs);
	window.addEventListener("orientationchange", fitEstyJs);
	// 웹폰트가 늦게 로드되면서 레이아웃이 미세하게 밀리는 경우를 대비해
	// 폰트 로드 완료 후 한 번 더 재계산.
	if (document.fonts && document.fonts.ready) {
		document.fonts.ready.then(fitEstyJs);
	}

	bindTouchKey("touchLeft", 37);
	bindTouchKey("touchRight", 39);
	bindTouchKey("touchFire", 32);
});
