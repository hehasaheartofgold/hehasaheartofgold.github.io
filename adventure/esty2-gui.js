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
});
