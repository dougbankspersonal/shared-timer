// @ts-nocheck
import { debugLog } from "./debugLog.js";
import * as stateManagement from "./stateManagement.js";
import { widgets } from "./widgetManagement.js";

const params = new URLSearchParams(window.location.search);
const roomCode = params.get("room");

const spinChars = ["/", "|", "\\", "―"];

//-----------------------------------
//
// Functions
//
//-----------------------------------
//-----------------------------------
//
// Sound helpers.
//
//-----------------------------------
const startSound = new Audio("sfx/hoot.mp3");
const beepSound = new Audio("sfx/beep.mp3");
const allDoneSound = new Audio("sfx/shriek.mp3");
const tickSound = new Audio("sfx/tick.wav");

function preloadSounds() {
  startSound.preload = "auto";
  beepSound.preload = "auto";
  allDoneSound.preload = "auto";
  tickSound.preload = "auto";
}

function playSound(sound) {
  console.trace("playSound", "sound = ", sound.src);
  setTimeout(() => {
    // Queue this up in a little bit, there can be race conditions.
    const globalState = stateManagement.globalState;
    if (!globalState.soundEnabled) {
      return;
    }
    sound.currentTime = 0;
    sound.play();
  }, 100);
}

//-----------------------------------
//
// Update UI and downstream: we know we need to change
// what's rendered because state has changed.
//
//-----------------------------------
function updateInputWidgets() {
  var globalState = stateManagement.globalState;

  console.assert(
    globalState,
    "Expected globalState to be non-null in updateInputWidgets",
  );
  console.assert(
    globalState.dbState,
    "Expected globalState.dbState to be non-null in updateInputWidgets",
  );

  if (globalState.pageLoading || globalState.dbLoading) {
    return;
  }

  widgets.minSecondsInput.value = globalState.dbState.minSeconds;
  widgets.maxSecondsInput.value = globalState.dbState.maxSeconds;
  widgets.finalCountdownSecondsInput.value =
    globalState.dbState.finalCountdownSeconds;
}

function updateButtons() {
  console.assert(
    widgets.startButton,
    "Expected widgets.startButton to be non-null",
  );
  const globalState = stateManagement.globalState;
  if (globalState.pageLoading || globalState.dbLoading) {
    widgets.startButton.style.display = "none";
    widgets.cancelButton.style.display = "none";
    widgets.resetButton.style.display = "none";
    return;
  }

  debugLog("updateButtons", "globalState = ", JSON.stringify(globalState));

  if (globalState.dbState.timerState == "ready") {
    widgets.startButton.style.display = "inline-block";
    widgets.cancelButton.style.display = "none";
    widgets.resetButton.style.display = "none";
  } else if (globalState.dbState.timerState == "done") {
    widgets.startButton.style.display = "none";
    widgets.cancelButton.style.display = "none";
    widgets.resetButton.style.display = "inline-block";
  } else {
    widgets.startButton.style.display = "none";
    widgets.cancelButton.style.display = "inline-block";
    widgets.resetButton.style.display = "none";
  }
}

function isInFinalCountdown() {
  var globalState = stateManagement.globalState;
  // If not running, no.
  if (globalState.dbState.timerState != "running") {
    return false;
  }
  // Do all the math: end time vs current time and finalCountdownSecond.
  const remaining = Math.max(
    0,
    globalState.dbState.endTime - stateManagement.getServerTime(),
  );
  const seconds = remaining / 1000;
  return seconds <= globalState.dbState.finalCountdownSeconds;
}

function updateDisplayFromGlobalState() {
  const globalState = stateManagement.globalState;
  debugLog("updateDisplayFromGlobalState", "Updating UI");
  debugLog(
    "updateDisplayFromGlobalState",
    "globalState = ",
    JSON.stringify(globalState),
  );

  widgets.roomCodeElement.textContent = roomCode || "No room code";

  if (globalState.pageLoading) {
    debugLog("updateDisplayFromGlobalState", "loading page");
    widgets.statusText.textContent = "Load page";
    return;
  }

  if (globalState.dbLoading) {
    debugLog("updateDisplayFromGlobalState", "loading db");
    widgets.statusText.textContent = "Load database";
    return;
  }

  if (globalState.dbState.timerState == "ready") {
    debugLog("updateDisplayFromGlobalState", "timer ready");
    widgets.statusText.textContent = "Ready";
    return;
  }

  if (globalState.dbState.timerState == "done") {
    debugLog("updateDisplayFromGlobalState", "timer done");
    widgets.statusText.textContent = "Done";
    return;
  }

  var inFinalCountdown = isInFinalCountdown();
  if (!inFinalCountdown) {
    console.assert(
      globalState.derivedState.lastDisplayedQuarterSecond !== null,
      "Expected lastDisplayedQuarterSecond to be non-null when not in final countdown.",
    );
    var spinOffset =
      globalState.derivedState.lastDisplayedQuarterSecond % spinChars.length;
    var spinChar = spinChars[spinOffset];
    widgets.statusText.textContent = spinChar;
  } else if (globalState.derivedState.lastDisplayedSecond !== null) {
    debugLog("updateDisplayFromGlobalState", "in final countdown");
    console.assert(
      globalState.derivedState.lastDisplayedSecond !== null,
      "Expected lastDisplayedSecond to be non-null when not in final countdown.",
    );
    widgets.statusText.textContent =
      globalState.derivedState.lastDisplayedSecond;
  }
}

function playSounds(oldGlobalState) {
  var globalState = stateManagement.globalState;
  var oldDbState = oldGlobalState.dbState;
  var newDbState = globalState.dbState;
  var oldDerivedState = oldGlobalState.derivedState;
  var newDerivedState = globalState.derivedState;

  // Sounds when timer starts or stops.
  if (oldDbState.timerState !== newDbState.timerState) {
    if (newDbState.timerState == "running") {
      playSound(startSound);
    } else if (newDbState.timerState == "done") {
      playSound(allDoneSound);
    }
  }

  // Sounds for timer ticks.
  // New displayed second: play tick oe beep sound.
  if (
    oldDerivedState.lastDisplayedSecond &&
    newDerivedState.lastDisplayedSecond &&
    newDbState.timerState == "running" &&
    oldDerivedState.lastDisplayedSecond !== newDerivedState.lastDisplayedSecond
  ) {
    if (isInFinalCountdown()) {
      playSound(beepSound);
    } else {
      debugLog(
        "playSounds",
        "oldDerivedState.lastDisplayedSecond = ",
        oldDerivedState.lastDisplayedSecond,
      );
      debugLog(
        "playSounds",
        "newDerivedState.lastDisplayedSecond = ",
        newDerivedState.lastDisplayedSecond,
      );
      playSound(tickSound);
    }
  }
}

function updateUI(oldGlobalState) {
  var globalState = stateManagement.globalState;
  // Don't bother if page/loading not ready.
  if (globalState.pageLoading || globalState.dbLoading) {
    return;
  }

  playSounds(oldGlobalState);
  updateInputWidgets();
  updateButtons();
  updateDisplayFromGlobalState();
}

//-----------------------------------
//
// Event listening.
//
//-----------------------------------
function onPageLoaded() {
  debugLog("onPageLoaded", "pageLoaded");
  widgets.loadWidgets();
  addEventListeners();

  stateManagement.clearPageLoading();
}

function applyInputs() {
  var globalState = stateManagement.globalState;

  var newDbState = structuredClone(globalState.dbState);
  var minSeconds = Number(widgets.minSecondsInput.value);
  var maxSeconds = Number(widgets.maxSecondsInput.value);
  if (minSeconds > maxSeconds) {
    var tmp = minSeconds;
    minSeconds = maxSeconds;
    maxSeconds = tmp;
  }
  newDbState.minSeconds = minSeconds;
  newDbState.maxSeconds = maxSeconds;
  newDbState.finalCountdownSeconds = Number(
    widgets.finalCountdownSecondsInput.value,
  );
  stateManagement.maybeSaveRoom(newDbState);
}

function onStartClick() {
  var minSeconds = Number(widgets.minSecondsInput.value);
  var maxSeconds = Number(widgets.maxSecondsInput.value);
  if (minSeconds > maxSeconds) {
    var tmp = minSeconds;
    minSeconds = maxSeconds;
    maxSeconds = tmp;
  }
  stateManagement.initGlobalStateForNewTimer(minSeconds, maxSeconds);
}

function onResetClick() {
  stateManagement.resetToReadyToStart();
}

function onCancelClick() {
  stateManagement.resetToReadyToStart();
}

function joinRoom() {
  const roomNumberToJoin = widgets.roomNumberToJoinInput.value.trim();

  if (!roomNumberToJoin) return;

  window.location.href = `${window.location.pathname}?room=${encodeURIComponent(roomNumberToJoin)}`;
}

function addEventListeners() {
  document.addEventListener(
    "click",
    () => {
      var globalState = stateManagement.globalState;
      debugLog(
        "addEventListeners",
        "globalState = ",
        JSON.stringify(globalState),
      );
      var newGlobalState = structuredClone(globalState);
      debugLog(
        "addEventListeners",
        "newGlobalState = ",
        JSON.stringify(newGlobalState),
      );
      newGlobalState.soundEnabled = true;
      stateManagement.setSoundEnabled();
    },
    { once: true },
  );

  widgets.minSecondsInput.addEventListener("change", applyInputs);
  widgets.maxSecondsInput.addEventListener("change", applyInputs);
  widgets.finalCountdownSecondsInput.addEventListener("change", applyInputs);

  widgets.startButton.addEventListener("click", onStartClick);
  widgets.resetButton.addEventListener("click", onResetClick);
  widgets.cancelButton.addEventListener("click", onCancelClick);

  widgets.joinRoomButton.addEventListener("click", joinRoom);
  widgets.roomNumberToJoinInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      joinRoom();
    }
  });
}

//-----------------------------------
//
// Actual code to run right at startup.
//
//-----------------------------------
stateManagement.setOnGlobalStateUpdated((oldGlobalState) => {
  console.assert(oldGlobalState, "Expected oldGlobalState to be non-null");

  stateManagement.maybeStartTimer(oldGlobalState);

  updateUI(oldGlobalState);
});

document.addEventListener("DOMContentLoaded", onPageLoaded);
preloadSounds();
stateManagement.initialLoadRoom();
