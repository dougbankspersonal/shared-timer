// @ts-nocheck

import { database } from "./firebase.js";
import {
  ref,
  get,
  set,
  onValue,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import { debugLog } from "./debugLog.js";

var gServerTimeOffset = null;

// Function, takes one arg, the oldGlobalState.
var onGlobalStateUpdated = null;

const params = new URLSearchParams(window.location.search);
const roomCode = params.get("room");

const defaultMinSeconds = 10;
const defaultMaxSeconds = 30;
const defaultFinalCountdownSeconds = 5;

let _globalTimer = null;

Object.defineProperty(window, "globalTimer", {
  get() {
    return _globalTimer;
  },
  set(value) {
    _globalTimer = value;
  },
});

// Aiming at a "React" model:
// All truth is in here.
// If a DB is involved, state changes go to db, we listen to db, db changes propagate and
// get written in here.
// Otherwise we just write state changes in here.
// Some feeble effort to ask "did things change" and if so update UI.
var globalState = {
  soundEnabled: false,
  pageLoading: true,
  dbLoading: true,
  dbState: {
    endTime: null,
    timerState: "ready", // "or "running" or "finished"
    minSeconds: defaultMinSeconds,
    maxSeconds: defaultMaxSeconds,
    finalCountdownSeconds: defaultFinalCountdownSeconds,
  },
  derivedState: {
    lastDisplayedSecond: null,
    lastDisplayedQuarterSecond: null,
  },
};

debugLog("global", "globalState.pageLoading = ", globalState.pageLoading);

// onGlobalStateUpdatedCallback should take one arg: the old globalState.
function setOnGlobalStateUpdated(onGlobalStateUpdatedCallback) {
  onGlobalStateUpdated = onGlobalStateUpdatedCallback;
}

function resetToReadyToStart() {
  clearInterval(globalTimer);
  debugLog(
    "resetToReadyToStart",
    "Resetting to ready state with dbState = ",
    JSON.stringify(newDbState),
  );

  var newDbState = structuredClone(globalState.dbState);
  newDbState.endTime = null;
  debugLog("resetToReadyToStart", "newDbState.endTime = ", newDbState.endTime);

  newDbState.timerState = "ready";
  newDbState.derivedState = newDbState.derivedState || {};
  newDbState.derivedState.lastDisplayedSecond = null;
  newDbState.derivedState.lastDisplayedQuarterSecond = null;

  // Save to database.
  maybeSaveRoom(newDbState);
}

function getServerTime() {
  return Date.now() + gServerTimeOffset;
}

// Main global state just got updated: possibly modify derived state if needed.
function updateDerivedState() {
  debugLog("updateDerivedState", "globalState = ", JSON.stringify(globalState));

  // If there is no end time, we are ready.
  if (globalState.dbState.endTime === null) {
    globalState.dbState.timerState = "ready";
    clearInterval(globalTimer);
    debugLog("updateDerivedState", "no end time, clearing timer");
    globalTimer = null;
    return true;
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
    clearInterval(globalTimer);
    globalTimer = null;
    return true;
  }

  // Timer is not yet in final countdown.
  if (seconds > globalState.dbState.finalCountdownSeconds) {
    if (
      quarterSeconds !== globalState.derivedState.lastDisplayedQuarterSecond
    ) {
      globalState.derivedState.lastDisplayedQuarterSecond = quarterSeconds;
    }
    if (seconds != globalState.derivedState.lastDisplayedSecond) {
      globalState.derivedState.lastDisplayedSecond = seconds;
      debugLog(
        "updateDerivedState",
        "Updated lastDisplayedSecond to " + seconds,
      );
    }
    return true;
  }

  // Timer is in final countdown.
  if (seconds != globalState.derivedState.lastDisplayedSecond) {
    globalState.derivedState.lastDisplayedSecond = seconds;
    return true;
  }
  return false;
}

function initGlobalStateForNewTimer(minSeconds, maxSeconds) {
  const duration =
    Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) + minSeconds;

  globalState.derivedState.lastDisplayedSecond = null;
  globalState.derivedState.lastDisplayedQuarterSecond = null;
  clearInterval(globalTimer);

  var newDbState = structuredClone(globalState.dbState);
  newDbState.endTime = getServerTime() + duration * 1000;
  debugLog(
    "initGlobalStateForNewTimer",
    "newDbState.endTime = ",
    newDbState.endTime,
  );
  newDbState.timerState = "running";
  maybeSaveRoom(newDbState);
}

// Write this blob into our for-reals db state.  Refresh derived data and notify
// listeners.
function applyDbStateToGlobalState(newDbState) {
  console.assert(newDbState, "newDbState must be defined");

  debugLog(
    "applyDbStateToGlobalState",
    "newDbState = ",
    JSON.stringify(newDbState),
  );
  // New source of truth.
  // 1. Remember old.
  var oldGlobalState = structuredClone(globalState);

  globalState.dbState = newDbState;
  globalState.dbLoading = false;

  // 2. Derivatives may changed.
  updateDerivedState();

  if (onGlobalStateUpdated) {
    console.assert(oldGlobalState, "Expected oldGlobalState to be non-null");
    console.assert(globalState, "Expected newGlobal State to be non-null");
    onGlobalStateUpdated(oldGlobalState);
  }
}

// Write new state to db.
// That's it: listener will catch changes and propagate ui updates.
async function saveRoom(roomRef, newDbState) {
  // If no room code, just slap in place locally.
  if (roomRef == null) {
    applyDbStateToGlobalState(newDbState);
    return;
  }
  debugLog("saveRoom", "roomCode = ", roomCode);
  console.trace();
  debugLog("saveRoom", "newDbState = " + JSON.stringify(newDbState));

  console.assert(roomRef, "roomRef must be defined");
  set(roomRef, newDbState);
  debugLog("saveRoom", "room saved");
}

function maybeSaveRoom(newDbState) {
  if (!roomCode) {
    // Write it into our global state immediately: no db involved.
    debugLog("maybeSaveRoom", "No room code, not saving room");
    // Slap in the new state local.
    applyDbStateToGlobalState(newDbState);
  } else {
    // Write it into the db: let our db-listening propagate into globalState.
    const roomRef = ref(database, `rooms/${roomCode}`);
    saveRoom(roomRef, newDbState);
  }
}

function onDbRoomUpdated(snapshot) {
  if (!snapshot.exists()) {
    return;
  }

  const newDbState = snapshot.val();

  applyDbStateToGlobalState(newDbState);
}

async function initialLoadRoom() {
  var defaultDbState = {
    endTime: null,
    timerState: "ready",
    minSeconds: defaultMinSeconds,
    maxSeconds: defaultMaxSeconds,
    finalCountdownSeconds: defaultFinalCountdownSeconds,
  };
  debugLog(
    "initialLoadRoom",
    "defaultDbState = ",
    JSON.stringify(defaultDbState),
  );
  if (!roomCode) {
    applyDbStateToGlobalState(defaultDbState);
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

  // No need to update listeners about this particular change:
  // it will bubble up as a result of the stuff below.
  globalState.dbLoading = true;

  debugLog("initialLoadRoom", "roomCode = ", JSON.stringify(roomCode));
  const snapshot = await get(roomRef);

  if (snapshot.exists()) {
    debugLog(
      "initialLoadRoom",
      "snapshot.val() = ",
      JSON.stringify(snapshot.val()),
    );
    applyDbStateToGlobalState(snapshot.val());
  } else {
    saveRoom(roomRef, defaultDbState);
  }
}

function onTimerInterval() {
  // The only thing that can change is derived state.
  var oldGlobalState = structuredClone(globalState);

  updateDerivedState();

  if (onGlobalStateUpdated) {
    onGlobalStateUpdated(oldGlobalState);
  }
}

function maybeStartTimer(oldGlobalState) {
  console.assert(oldGlobalState, "oldGlobalState must be defined");
  var oldDbState = oldGlobalState.dbState;
  var newDbState = globalState.dbState;
  console.assert(newDbState, "newDbState must be defined");
  console.assert(oldDbState, "oldDbState must be defined");

  // If we just started running, start up a timer.
  if (
    oldDbState.timerState !== "running" &&
    newDbState.timerState === "running"
  ) {
    clearInterval(globalTimer);
    globalTimer = setInterval(onTimerInterval, 50);
  }
}

function clearPageLoading() {
  if (globalState.pageLoading) {
    var oldGlobalState = structuredClone(globalState);
    globalState.pageLoading = false;
    // Watcher should be notified.
    if (onGlobalStateUpdated) {
      onGlobalStateUpdated(oldGlobalState);
    }
  }
}

function setSoundEnabled() {
  if (!globalState.soundEnabled) {
    var oldGlobalState = structuredClone(globalState);
    globalState.soundEnabled = true;
    // Notify watcher.
    if (onGlobalStateUpdated) {
      onGlobalStateUpdated(oldGlobalState);
    }
  }
}

export {
  defaultMinSeconds,
  defaultMaxSeconds,
  defaultFinalCountdownSeconds,
  globalState,
  maybeSaveRoom,
  initGlobalStateForNewTimer,
  resetToReadyToStart,
  updateDerivedState,
  setOnGlobalStateUpdated,
  initialLoadRoom,
  getServerTime,
  maybeStartTimer,
  clearPageLoading,
  setSoundEnabled,
};
