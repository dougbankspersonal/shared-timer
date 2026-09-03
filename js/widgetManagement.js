// @ts-nocheck
import { debugLog } from "./debugLog.js";

const widgets = {
  roomCodeElement: null,
  statusText: null,
  minSecondsInput: null,
  maxSecondsInput: null,
  finalCountdownSecondsInput: null,
  startButton: null,
  cancelButton: null,
  resetButton: null,
  roomNumberToJoinInput: null,
  joinRoomButton: null,
  loadWidgets: function () {
    debugLog("loadWidgets", "Loading widgets...");
    widgets.roomCodeElement = document.getElementById("roomCode");
    widgets.statusText = document.getElementById("statusText");
    widgets.minSecondsInput = document.getElementById("minSeconds");
    widgets.maxSecondsInput = document.getElementById("maxSeconds");
    widgets.finalCountdownSecondsInput =
      document.getElementById("finalCountdown");
    widgets.startButton = document.getElementById("startButton");
    widgets.cancelButton = document.getElementById("cancelButton");
    widgets.resetButton = document.getElementById("resetButton");
    widgets.roomNumberToJoinInput = document.getElementById("roomNumber");
    widgets.joinRoomButton = document.getElementById("joinRoomButton");
    debugLog(
      "loadWidgets",
      "widgets.minSecondsInput = ",
      JSON.stringify(widgets.minSecondsInput),
    );
    debugLog(
      "loadWidgets",
      "widgets.maxSecondsInput = ",
      JSON.stringify(widgets.maxSecondsInput),
    );
    debugLog(
      "loadWidgets",
      "widgets.finalCountdownSecondsInput = ",
      JSON.stringify(widgets.finalCountdownSecondsInput),
    );
  },
};

export { widgets };
