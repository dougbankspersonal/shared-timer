const params = new URLSearchParams(window.location.search);
const debugLogFlags = params.get("debugLogFlags");
const debugLogFlagsArray = debugLogFlags ? debugLogFlags.split(",") : [];
var debugLogFlagsTable = {};
for (const flag of debugLogFlagsArray) {
  debugLogFlagsTable[flag] = true;
}
console.log("debugLogFlagsTable = ", JSON.stringify(debugLogFlagsTable));

// Functions
export function debugLog(flag, ...args) {
  if (debugLogFlagsTable[flag]) {
    console.log(`[${flag}]`, ...args);
  }
}
