import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import { getDatabase } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyD0RmOTLM1laiNZ0mlFCfIrqRQ3u71JwUU",
  authDomain: "game-timer-9f36e.firebaseapp.com",
  databaseURL: "https://game-timer-9f36e-default-rtdb.firebaseio.com",
  projectId: "game-timer-9f36e",
  storageBucket: "game-timer-9f36e.firebasestorage.app",
  messagingSenderId: "358736081009",
  appId: "1:358736081009:web:1c17809501335c0df02bd0",
};

const app = initializeApp(firebaseConfig);

export const database = getDatabase(app);
