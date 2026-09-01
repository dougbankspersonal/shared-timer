import { database } from "./firebase.js";
import {
  ref,
  get,
  set,
  onValue,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

var gServerTimeOffset = null;
const roomCodeElement = document.getElementById("roomCode");
const display = document.getElementById("display");
const minInput = document.getElementById("minSeconds");
const maxInput = document.getElementById("maxSeconds");
const finalCountdownInput = document.getElementById("finalCountdown");
const startButton = document.getElementById("startButton");
const cancelButton = document.getElementById("cancelButton");
const resetButton = document.getElementById("resetButton");

const params = new URLSearchParams(window.location.search);
const roomCode = params.get("room");
const debugLogFlags = params.get("debugLogFlags");
const debugLogFlagsArray = debugLogFlags ? debugLogFlags.split(",") : [];
var debugLogFlagsTable = {};
for (const flag of debugLogFlagsArray) {
  debugLogFlagsTable[flag] = true;
}
console.log("debugLogFlagsTable = ", JSON.stringify(debugLogFlagsTable));

roomCodeElement.textContent = roomCode || "none";

const startSound = new Audio("sfx/hoot.mp3");
const beepSound = new Audio("sfx/beep.mp3");
const allDownSoung = new Audio("sfx/shriek.mp3");
const tickSound = new Audio("sfx/tick.wav");

// Has a "timer", which is a js interval,
// Some local state that just helps with UI
// DB state which persists across all instances.
var globalState = {
  soundEnabled: false,
  timer: null,
  pageLoading: true,
  dbLoading: false,
  dbState: {
    endTime: null,
    timerState: "ready", // "or "running" or "finished"
    minSeconds: 10,
    maxSeconds: 30,
    finalCountdownSeconds: 5,
  },
  dervivedState: {
    lastDisplayedSecond: null,
    lastDisplayedQuarterSecond: null,
  },
};

debugLog("global", "globalState.pageLoading = ", globalState.pageLoading);

const spinChars = ["/", "|", "\\", "―"];

// Functions
function debugLog(flag, ...args) {
  if (debugLogFlagsTable[flag]) {
    console.log(`[${flag}]`, ...args);
  }
}

function onPageLoaded() {
  debugLog(
    "onPageLoaded",
    "globalState.pageLoading = ",
    globalState.pageLoading,
  );

  globalState.pageLoading = false;
  debugLog(
    "onPageLoaded",
    "globalState.pageLoading = ",
    globalState.pageLoading,
  );
  updateUI();
}

function resetToReadyToStart() {
  clearInterval(globalState.timer);
  debugLog(
    "resetToReadyToStart",
    "Resetting to ready state with dbState = ",
    JSON.stringify(newDbState),
  );
  globalState.timer = null;
  globalState.dervivedState.lastDisplayedSecond = null;
  globalState.dervivedState.lastDisplayedQuarterSecond = null;

  var newDbState = structuredClone(globalState.dbState);
  newDbState.endTime = null;
  newDbState.timerState = "ready";

  // Save to database.
  maybeSaveRoom(newDbState);
}

function preloadSounds() {
  startSound.preload = "auto";
  beepSound.preload = "auto";
  allDownSoung.preload = "auto";
  tickSound.preload = "auto";
}

function updateButtons() {
  if (globalState.pageLoading || globalState.dbLoading) {
    startButton.style.display = "none";
    cancelButton.style.display = "none";
    resetButton.style.display = "none";
    return;
  }

  debugLog("updateButtons", "globalState = ", JSON.stringify(globalState));

  if (globalState.dbState.timerState == "ready") {
    startButton.style.display = "inline-block";
    cancelButton.style.display = "none";
    resetButton.style.display = "none";
  } else if (globalState.dbState.timerState == "done") {
    startButton.style.display = "none";
    cancelButton.style.display = "none";
    resetButton.style.display = "inline-block";
  } else {
    startButton.style.display = "none";
    cancelButton.style.display = "inline-block";
    resetButton.style.display = "none";
  }
}

function getServerTime() {
  return Date.now() + gServerTimeOffset;
}

function isInFinalCountdown() {
  // If not running, no.
  if (globalState.dbState.timerState != "running") {
    return false;
  }
  // Do all the math: end time vs current time and finalCountdownSecond.
  const remaining = Math.max(0, globalState.dbState.endTime - getServerTime());
  const seconds = remaining / 1000;
  return seconds <= globalState.dbState.finalCountdownSeconds;
}

function updateDisplayFromGlobalState() {
  debugLog("updateDisplayFromGlobalState", "Updating UI");
  debugLog(
    "updateDisplayFromGlobalState",
    "globalState = ",
    JSON.stringify(globalState),
  );

  if (globalState.pageLoading) {
    debugLog("updateDisplayFromGlobalState", "loading page");
    display.textContent = "Load page";
    return;
  }

  if (globalState.dbLoading) {
    debugLog("updateDisplayFromGlobalState", "loading db");
    display.textContent = "Load database";
    return;
  }

  if (globalState.dbState.timerState == "ready") {
    debugLog("updateDisplayFromGlobalState", "timer ready");
    display.textContent = "Ready";
    return;
  }

  if (globalState.dbState.timerState == "done") {
    debugLog("updateDisplayFromGlobalState", "timer done");
    display.textContent = "Done";
    return;
  }

  var inFinalCountdown = isInFinalCountdown();
  if (!inFinalCountdown) {
    console.assert(
      globalState.dervivedState.lastDisplayedQuarterSecond !== null,
      "Expected lastDisplayedQuarterSecond to be non-null when not in final countdown.",
    );
    var spinOffset =
      globalState.dervivedState.lastDisplayedQuarterSecond % spinChars.length;
    var spinChar = spinChars[spinOffset];
    display.textContent = spinChar;
  } else if (globalState.dervivedState.lastDisplayedSecond !== null) {
    debugLog("updateDisplayFromGlobalState", "in final countdown");
    console.assert(
      globalState.dervivedState.lastDisplayedSecond !== null,
      "Expected lastDisplayedSecond to be non-null when not in final countdown.",
    );
    display.textContent = globalState.dervivedState.lastDisplayedSecond;
  }
}

function updateUI() {
  updateButtons();
  updateDisplayFromGlobalState();
}

// We are updating state.
// No UI Shite.
function updateDerivedState() {
  debugLog("updateDerivedState", "globalState = ", JSON.stringify(globalState));

  // If there is no end time, we are ready.
  if (globalState.dbState.endTime === null) {
    globalState.dbState.timerState = "ready";
    clearInterval(globalState.timer);
    globalState.timer = null;
    return;
  }

  // How long until we are done, in msec, sec, and quarter sec.
  const remaining = Math.max(0, globalState.dbState.endTime - getServerTime());
  const seconds = Math.ceil(remaining / 1000);
  const quarterSeconds = Math.ceil(remaining / 250);

  // Timer is over.
  if (remaining <= 0) {
    globalState.dbState.timerState = "done";
    // Clear the timer.
    debugLog("updateDerivedState", "Timer done, clearing interval");
    clearInterval(globalState.timer);
    globalState.timer = null;
    return;
  }

  // Timer is not yet in final countdown.
  if (seconds > globalState.dbState.finalCountdownSeconds) {
    if (
      quarterSeconds !== globalState.dervivedState.lastDisplayedQuarterSecond
    ) {
      globalState.dervivedState.lastDisplayedQuarterSecond = quarterSeconds;
    }
    if (seconds != globalState.dervivedState.lastDisplayedSecond) {
      globalState.dervivedState.lastDisplayedSecond = seconds;
      debugLog(
        "updateDerivedState",
        "Updated lastDisplayedSecond to " + seconds,
      );
    }
    return;
  }

  // Timer is in final countdown.
  if (seconds != globalState.dervivedState.lastDisplayedSecond) {
    globalState.dervivedState.lastDisplayedSecond = seconds;
  }
}

// Update the UI to reflect timer state.
// - any text explaining what's up.
// - sounds.
// - updating timer state itself.
function onTimerInterval() {
  debugLog("onTimerInterval", "Timer interval triggered");

  // Save off old state.
  var oldDbState = structuredClone(globalState.dbState);
  var oldDerivedState = structuredClone(globalState.dervivedState);

  // Update global state based on current time.
  updateDerivedState();

  // Deal with UI fallout of changes.
  // Transition to running: play ding.
  if (
    oldDbState.timerState !== "running" &&
    globalState.dbState.timerState === "running"
  ) {
    play(startSound);
  }
  // New displayed second: play tick oe beep sound.
  if (
    oldDerivedState.lastDisplayedSecond !==
    globalState.dervivedState.lastDisplayedSecond
  ) {
    if (isInFinalCountdown()) {
      play(beepSound);
    } else {
      play(tickSound);
    }
  }
  // Transition to done: play tada sound.
  if (
    oldDbState.timerState !== "done" &&
    globalState.dbState.timerState === "done"
  ) {
    play(allDownSoung);
  }

  // No harm in just updating the whole UI: we could be smarter b ut whatever.
  updateUI();
}

function initGlobalStateForNewTimer() {
  const min = Number(minInput.value);
  const max = Number(maxInput.value);
  const duration = Math.floor(Math.random() * (max - min + 1)) + min;

  var newDbState = structuredClone(globalState.dbState);
  newDbState.endTime = getServerTime() + duration * 1000;
  newDbState.timerState = "running";

  globalState.dervivedState.lastDisplayedSecond = null;
  globalState.dervivedState.lastDisplayedQuarterSecond = null;
  clearInterval(globalState.timer);

  maybeSaveRoom(newDbState);
}

function maybeStartLocalInterval() {
  debugLog("maybeStartLocalInterval", "In maybeStartLocalInterval");
  if (globalState.timer) {
    return;
  }

  if (
    globalState.dbState &&
    globalState.dbState.endTime &&
    globalState.dbState.timerState === "running"
  ) {
    debugLog("maybeStartLocalInterval", "Starting local interval");
    globalState.timer = setInterval(onTimerInterval, 50);
  }
}

function onStartClick() {
  play(startSound);

  initGlobalStateForNewTimer();

  onTimerInterval();
}

function onResetClick() {
  resetToReadyToStart();
}

function onCancelClick() {
  resetToReadyToStart();
}

function addEventListeners() {
  document.addEventListener("DOMContentLoaded", onPageLoaded);
  document.addEventListener(
    "click",
    () => {
      globalState.soundEnabled = true;
    },
    { once: true },
  );

  minInput.addEventListener("change", applyInputs);
  maxInput.addEventListener("change", applyInputs);
  finalCountdownInput.addEventListener("change", applyInputs);

  startButton.addEventListener("click", onStartClick);
  resetButton.addEventListener("click", onResetClick);
  cancelButton.addEventListener("click", onCancelClick);
}

function play(sound) {
  if (!globalState.soundEnabled) {
    return;
  }
  sound.currentTime = 0;
  sound.play();
}

function applyDbStateToInputs() {
  var dbState = globalState.dbState;

  minInput.value = dbState.minSeconds;
  maxInput.value = dbState.maxSeconds;
  finalCountdownInput.value = dbState.finalCountdownSeconds;
}

async function createRoom(roomRef) {
  await set(roomRef, globalState.dbState);
}

async function saveRoom(roomRef, newDbState) {
  // If no room code, just slap in place locally.
  if (roomRef == null) {
    applyDbState(newDbState);
    return;
  }
  debugLog("saveRoom", "roomCode = ", roomCode);
  console.trace();
  debugLog("saveRoom", "newDbState = " + JSON.stringify(newDbState));

  console.assert(roomRef, "roomRef must be defined");
  set(roomRef, newDbState);
  debugLog("saveRoom", "room saved");
}

function applyDbState(newDbState) {
  // New source of truth.
  // 1. Local storage.
  globalState.dbState = newDbState;
  globalState.dbLoading = false;

  // 2. Derivatives.
  updateDerivedState();
  // 3. Deal with local downstream effects: ui, sound, timers, etc.
  maybeStartLocalInterval();
  applyDbStateToInputs();
  updateUI();
}

function maybeSaveRoom(newDbState) {
  if (!roomCode) {
    // Write it into our global state immediately: no db involved.
    debugLog("maybeSaveRoom", "No room code, not saving room");
    // Slap in the new state local.
    applyDbState(newDbState);
  } else {
    // Write it into the db: let our db-listening propagate into globalState.
    const roomRef = ref(database, `rooms/${roomCode}`);
    saveRoom(roomRef, newDbState);
  }
}

function applyInputs() {
  var newDbState = structuredClone(globalState.dbState);
  newDbState.minSeconds = Number(minInput.value);
  newDbState.maxSeconds = Number(maxInput.value);
  newDbState.finalCountdownSeconds = Number(finalCountdownInput.value);
  maybeSaveRoom(newDbState);
}

function onDbRoomUpdated(snapshot) {
  if (!snapshot.exists()) {
    return;
  }

  const dbState = snapshot.val();

  applyDbState(dbState);
}

async function initialLoadRoom() {
  if (!roomCode) {
    var newDbState = {};
    newDbState.minSeconds = Number(minInput.value);
    newDbState.maxSeconds = Number(maxInput.value);
    newDbState.finalCountdownSeconds = Number(finalCountdownInput.value);
    newDbState.timerState = "ready";
    newDbState.endTime = null;
    await maybeSaveRoom(newDbState);
    return;
  }

  const offsetRef = ref(database, ".info/serverTimeOffset");

  console.assert(
    gServerTimeOffset === null,
    "Expected gServerTimeOffset to be null",
  );
  onValue(
    offsetRef,
    (snapshot) => {
      gServerTimeOffset = snapshot.val();
    },
    { onlyOnce: true },
  );

  // Room code: find or create the room.
  const roomRef = ref(database, `rooms/${roomCode}`);

  // Listen for db updates on the room.
  onValue(roomRef, onDbRoomUpdated);

  globalState.dbLoading = true;
  updateUI();

  debugLog("initialLoadRoom", "roomCode = ", JSON.stringify(roomCode));
  const snapshot = await get(roomRef);

  if (snapshot.exists()) {
    debugLog(
      "initialLoadRoom",
      "snapshot.val() = ",
      JSON.stringify(snapshot.val()),
    );
    applyDbState(snapshot.val());
  } else {
    var newDbState = {};
    newDbState.minSeconds = Number(minInput.value);
    newDbState.maxSeconds = Number(maxInput.value);
    newDbState.finalCountdownSeconds = Number(finalCountdownInput.value);
    newDbState.timerState = "ready";
    newDbState.endTime = null;

    await maybeSaveRoom(newDbState);
  }
}

preloadSounds();
addEventListeners();
initialLoadRoom();
