const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

/* =====================================================
   DOM
===================================================== */

const movesEl = document.getElementById("moves");
const fallsEl = document.getElementById("falls");
const timerEl = document.getElementById("timer");
const resetBtn = document.getElementById("resetBtn");
const hintEl = document.getElementById("hint");
const dailyLabelEl = document.getElementById("dailyLabel");
const editRouteBtn = document.getElementById("editRouteBtn");

const startOverlay = document.getElementById("startOverlay");
const startDailyTitle = document.getElementById("startDailyTitle");
const routeNameEl = document.getElementById("routeName");
const startBestEl = document.getElementById("startBest");
const startGlobalBestEl = document.getElementById("startGlobalBest");
const startStreakEl = document.getElementById("startStreak");
const playBtn = document.getElementById("playBtn");

const resultOverlay = document.getElementById("resultOverlay");
const resultTitle = document.getElementById("resultTitle");
const resultMoves = document.getElementById("resultMoves");
const resultFalls = document.getElementById("resultFalls");
const resultTime = document.getElementById("resultTime");
const resultStreak = document.getElementById("resultStreak");
const resultBest = document.getElementById("resultBest");
const newBestEl = document.getElementById("newBest");
const replayBtn = document.getElementById("replayBtn");
const shareBtn = document.getElementById("shareBtn");

const onlineScoreFlow = document.getElementById("onlineScoreFlow");
const scoreNameStep = document.getElementById("scoreNameStep");
const scoreNameInput = document.getElementById("scoreNameInput");
const scoreNameError = document.getElementById("scoreNameError");
const saveOnlineScoreBtn = document.getElementById("saveOnlineScoreBtn");
const leaderboardStep = document.getElementById("leaderboardStep");
const leaderboardList = document.getElementById("leaderboardList");
const leaderboardPosition = document.getElementById("leaderboardPosition");
const resultButtons = document.getElementById("resultButtons");

let pendingCompletedRun = null;

/* =====================================================
   CONSTANTS / DATE
===================================================== */

const DAY_MS = 86400000;
const STORAGE_KEY = "daily-climb-v1";
const CUSTOM_ROUTE_KEY = "daily-climb-custom-route";
const ROUTE_LIBRARY_KEY = "daily-climb-route-library-v1";

const URL_PARAMS = new URLSearchParams(window.location.search);

const IS_CUSTOM_MODE = URL_PARAMS.get("custom") === "1";

const ROUTE_QUERY_ID = URL_PARAMS.get("route");

const ONLINE = window.DailyClimbOnline || null;

const WORLD_HEIGHT_MULTIPLIER = 1.12;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function localDateKey(date = new Date()) {
  const y = date.getFullYear();

  const m = String(date.getMonth() + 1).padStart(2, "0");

  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function dateSerial(date = new Date()) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}

function dateKeyFromSerial(serial) {
  const date = new Date(serial * DAY_MS);

  const y = date.getUTCFullYear();

  const m = String(date.getUTCMonth() + 1).padStart(2, "0");

  const d = String(date.getUTCDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

const DAILY_EPOCH = Math.floor(Date.UTC(2026, 9, 3) / DAY_MS);

const TODAY_SERIAL = dateSerial();

const TODAY_KEY = localDateKey();

const DAILY_NUMBER = Math.max(1, TODAY_SERIAL - DAILY_EPOCH + 1);

/* =====================================================
   HOLD MODEL
===================================================== */

function defaultShapeForType(type) {
  if (type === "foot") {
    return "wedge";
  }

  if (type === "sloper") {
    return "sloper";
  }

  if (type === "top") {
    return "blob";
  }

  return "rock";
}

function allSides() {
  return {
    top: true,
    right: true,
    bottom: true,
    left: true,
  };
}

function defaultGripSidesForHold(type, shape = defaultShapeForType(type)) {
  if (type === "foot") {
    return {
      top: true,
      right: false,
      bottom: false,
      left: false,
    };
  }

  if (type === "sloper" || shape === "sloper") {
    return {
      top: true,
      right: true,
      bottom: false,
      left: true,
    };
  }

  if (type === "top") {
    return {
      top: true,
      right: true,
      bottom: false,
      left: true,
    };
  }

  if (shape === "edge") {
    return {
      top: true,
      right: false,
      bottom: false,
      left: false,
    };
  }

  if (shape === "wedge") {
    return {
      top: true,
      right: true,
      bottom: false,
      left: true,
    };
  }

  return allSides();
}

function normalizedGripSides(sides, type, shape) {
  const defaults = defaultGripSidesForHold(type, shape);

  if (!sides) {
    return {
      ...defaults,
    };
  }

  return {
    top: sides.top ?? defaults.top,

    right: sides.right ?? defaults.right,

    bottom: sides.bottom ?? defaults.bottom,

    left: sides.left ?? defaults.left,
  };
}

function normalizedHold(hold) {
  const shape = hold.shape || defaultShapeForType(hold.type);

  return {
    ...hold,

    shape,

    gripSides: normalizedGripSides(hold.gripSides, hold.type, shape),
  };
}

function getHoldCapacity(hold) {
  const size = hold.r || 20;

  const shape = hold.shape || defaultShapeForType(hold.type);

  if (hold.type === "top") {
    return {
      hands: 2,
      feet: 0,
    };
  }

  if (hold.type === "foot") {
    return {
      hands: 0,

      feet: size >= 25 ? 2 : 1,
    };
  }

  if (shape === "edge") {
    return {
      hands: size >= 30 ? 2 : 1,

      feet: size >= 25 ? 2 : 1,
    };
  }

  if (shape === "wedge") {
    return {
      hands: size >= 28 ? 2 : 1,

      feet: size >= 24 ? 2 : 1,
    };
  }

  if (shape === "blob") {
    return {
      hands: size >= 24 ? 2 : 1,

      feet: size >= 22 ? 2 : 1,
    };
  }

  if (shape === "sloper") {
    return {
      hands: size >= 29 ? 2 : 1,

      feet: size >= 25 ? 2 : 1,
    };
  }

  return {
    hands: size >= 26 ? 2 : 1,

    feet: size >= 23 ? 2 : 1,
  };
}

/* =====================================================
   SLOPER SUPPORT
===================================================== */

function getSloperHangLimit(limbKey, hold) {
  const contacts = getContactStats();

  const otherHandEntry = Object.entries(limbs).find(([key, other]) => key !== limbKey && other.kind === "hand" && !!other.grip);

  const otherHandOnDifferentHold = !!(otherHandEntry && otherHandEntry[1].grip !== hold.id);

  if (contacts.feet === 0 && !otherHandOnDifferentHold) {
    return 1.5;
  }

  let seconds;

  if (contacts.feet >= 2) {
    seconds = 12;
  } else if (contacts.feet === 1) {
    seconds = 5.5;
  } else {
    seconds = 7;
  }

  if (otherHandOnDifferentHold) {
    seconds *= 1.7;
  }

  const sizeT = clamp(((hold.r || 20) - 12) / 22, 0, 1);

  seconds *= 0.9 + sizeT * 0.25;

  return clamp(seconds, 1.5, 22);
}

/* =====================================================
   SWING CONTROL
===================================================== */

function getHoldSwingControl(hold, limbKind = "hand") {
  if (!hold) {
    return 0;
  }

  const size = clamp(((hold.r || 20) - 12) / 22, 0, 1);

  const shape = hold.shape || defaultShapeForType(hold.type);

  if (limbKind === "foot") {
    let factor = 0.66 + size * 0.24;

    if (shape === "wedge") {
      factor += 0.05;
    }

    if (shape === "edge") {
      factor -= 0.05;
    }

    return clamp(factor, 0.55, 0.98);
  }

  if (hold.type === "sloper" || shape === "sloper") {
    return clamp(0.48 + size * 0.3, 0.45, 0.8);
  }

  if (shape === "edge") {
    return clamp(0.68 + size * 0.18, 0.64, 0.88);
  }

  if (hold.type === "top") {
    return clamp(0.98 + size * 0.1, 0.98, 1.08);
  }

  return clamp(0.88 + size * 0.2, 0.86, 1.08);
}

/* =====================================================
   LEVELS
===================================================== */

const LEVELS = [
  {
    id: "first-ascent",

    name: "First Ascent",

    start: {
      leftHand: "lh",
      rightHand: "rh",
      leftFoot: "lf",
      rightFoot: "rf",
    },

    topId: "top",

    holds: [
      {
        id: "lf",
        x: 0.43,
        y: 0.9,
        r: 18,
        angle: -0.15,
        type: "foot",
        shape: "wedge",

        gripSides: {
          top: true,
          right: false,
          bottom: false,
          left: false,
        },

        color: "#22c55e",
      },

      {
        id: "rf",
        x: 0.56,
        y: 0.89,
        r: 18,
        angle: 0.15,
        type: "foot",
        shape: "wedge",

        gripSides: {
          top: true,
          right: false,
          bottom: false,
          left: false,
        },

        color: "#22c55e",
      },

      {
        id: "lh",
        x: 0.41,
        y: 0.63,
        r: 23,
        angle: -0.28,
        type: "jug",
        shape: "rock",
        gripSides: allSides(),
        color: "#ef4444",
      },

      {
        id: "rh",
        x: 0.57,
        y: 0.6,
        r: 23,
        angle: 0.24,
        type: "jug",
        shape: "rock",
        gripSides: allSides(),
        color: "#3b82f6",
      },

      {
        id: "footMidL",
        x: 0.46,
        y: 0.79,
        r: 16,
        angle: -0.1,
        type: "foot",
        shape: "edge",

        gripSides: {
          top: true,
          right: false,
          bottom: false,
          left: false,
        },

        color: "#a855f7",
      },

      {
        id: "footMidR",
        x: 0.64,
        y: 0.75,
        r: 16,
        angle: 0.17,
        type: "foot",
        shape: "wedge",

        gripSides: {
          top: true,
          right: false,
          bottom: false,
          left: false,
        },

        color: "#f97316",
      },

      {
        id: "midL",
        x: 0.29,
        y: 0.49,
        r: 22,
        angle: -0.38,
        type: "jug",
        shape: "edge",
        gripSides: allSides(),
        color: "#f43f5e",
      },

      {
        id: "midR",
        x: 0.7,
        y: 0.46,
        r: 22,
        angle: 0.31,
        type: "jug",
        shape: "rock",
        gripSides: allSides(),
        color: "#eab308",
      },

      {
        id: "highL",
        x: 0.42,
        y: 0.34,
        r: 21,
        angle: -0.2,
        type: "jug",
        shape: "wedge",
        gripSides: allSides(),
        color: "#06b6d4",
      },

      {
        id: "highR",
        x: 0.63,
        y: 0.31,
        r: 22,
        angle: 0.22,
        type: "sloper",
        shape: "sloper",

        gripSides: {
          top: true,
          right: true,
          bottom: true,
          left: true,
        },

        color: "#8b5cf6",
      },

      {
        id: "top",
        x: 0.52,
        y: 0.13,
        r: 29,
        angle: 0,
        type: "top",
        shape: "blob",

        gripSides: {
          top: true,
          right: true,
          bottom: true,
          left: true,
        },

        color: "#84cc16",
      },
    ],
  },

  {
    id: "side-pull",

    name: "Side Pull",

    start: {
      leftHand: "lh",
      rightHand: "rh",
      leftFoot: "lf",
      rightFoot: "rf",
    },

    topId: "top",

    holds: [
      {
        id: "lf",
        x: 0.4,
        y: 0.9,
        r: 18,
        angle: -0.1,
        type: "foot",
        shape: "wedge",

        gripSides: {
          top: true,
          right: false,
          bottom: false,
          left: false,
        },

        color: "#22c55e",
      },

      {
        id: "rf",
        x: 0.55,
        y: 0.89,
        r: 18,
        angle: 0.1,
        type: "foot",
        shape: "wedge",

        gripSides: {
          top: true,
          right: false,
          bottom: false,
          left: false,
        },

        color: "#22c55e",
      },

      {
        id: "lh",
        x: 0.39,
        y: 0.64,
        r: 23,
        angle: -0.2,
        type: "jug",
        shape: "rock",
        gripSides: allSides(),
        color: "#ef4444",
      },

      {
        id: "rh",
        x: 0.55,
        y: 0.61,
        r: 23,
        angle: 0.2,
        type: "jug",
        shape: "rock",
        gripSides: allSides(),
        color: "#3b82f6",
      },

      {
        id: "f1",
        x: 0.31,
        y: 0.78,
        r: 16,
        angle: 0.2,
        type: "foot",
        shape: "edge",

        gripSides: {
          top: true,
          right: false,
          bottom: false,
          left: false,
        },

        color: "#f97316",
      },

      {
        id: "f2",
        x: 0.59,
        y: 0.72,
        r: 16,
        angle: -0.1,
        type: "foot",
        shape: "edge",

        gripSides: {
          top: true,
          right: false,
          bottom: false,
          left: false,
        },

        color: "#a855f7",
      },

      {
        id: "m1",
        x: 0.69,
        y: 0.52,
        r: 23,
        angle: 0.45,
        type: "jug",
        shape: "wedge",
        gripSides: allSides(),
        color: "#eab308",
      },

      {
        id: "m2",
        x: 0.33,
        y: 0.44,
        r: 21,
        angle: -0.32,
        type: "jug",
        shape: "edge",
        gripSides: allSides(),
        color: "#06b6d4",
      },

      {
        id: "m3",
        x: 0.67,
        y: 0.34,
        r: 22,
        angle: 0.28,
        type: "sloper",
        shape: "sloper",
        gripSides: allSides(),
        color: "#8b5cf6",
      },

      {
        id: "top",
        x: 0.47,
        y: 0.13,
        r: 29,
        angle: -0.08,
        type: "top",
        shape: "blob",
        gripSides: allSides(),
        color: "#84cc16",
      },
    ],
  },

  {
    id: "zig-zag",

    name: "Zig Zag",

    start: {
      leftHand: "lh",
      rightHand: "rh",
      leftFoot: "lf",
      rightFoot: "rf",
    },

    topId: "top",

    holds: [
      {
        id: "lf",
        x: 0.43,
        y: 0.9,
        r: 18,
        angle: -0.1,
        type: "foot",
        shape: "wedge",

        gripSides: {
          top: true,
          right: false,
          bottom: false,
          left: false,
        },

        color: "#22c55e",
      },

      {
        id: "rf",
        x: 0.57,
        y: 0.89,
        r: 18,
        angle: 0.1,
        type: "foot",
        shape: "wedge",

        gripSides: {
          top: true,
          right: false,
          bottom: false,
          left: false,
        },

        color: "#22c55e",
      },

      {
        id: "lh",
        x: 0.41,
        y: 0.64,
        r: 23,
        angle: -0.2,
        type: "jug",
        shape: "rock",
        gripSides: allSides(),
        color: "#ef4444",
      },

      {
        id: "rh",
        x: 0.57,
        y: 0.61,
        r: 23,
        angle: 0.2,
        type: "jug",
        shape: "rock",
        gripSides: allSides(),
        color: "#3b82f6",
      },

      {
        id: "f1",
        x: 0.6,
        y: 0.77,
        r: 16,
        angle: 0.1,
        type: "foot",
        shape: "edge",

        gripSides: {
          top: true,
          right: false,
          bottom: false,
          left: false,
        },

        color: "#f97316",
      },

      {
        id: "m1",
        x: 0.3,
        y: 0.52,
        r: 22,
        angle: -0.4,
        type: "jug",
        shape: "edge",
        gripSides: allSides(),
        color: "#f43f5e",
      },

      {
        id: "f2",
        x: 0.38,
        y: 0.69,
        r: 16,
        angle: -0.1,
        type: "foot",
        shape: "wedge",

        gripSides: {
          top: true,
          right: false,
          bottom: false,
          left: false,
        },

        color: "#a855f7",
      },

      {
        id: "m2",
        x: 0.69,
        y: 0.43,
        r: 22,
        angle: 0.36,
        type: "jug",
        shape: "rock",
        gripSides: allSides(),
        color: "#eab308",
      },

      {
        id: "m3",
        x: 0.37,
        y: 0.3,
        r: 21,
        angle: -0.2,
        type: "jug",
        shape: "wedge",
        gripSides: allSides(),
        color: "#06b6d4",
      },

      {
        id: "top",
        x: 0.61,
        y: 0.13,
        r: 29,
        angle: 0.15,
        type: "top",
        shape: "blob",
        gripSides: allSides(),
        color: "#84cc16",
      },
    ],
  },
];

/* =====================================================
   LOAD ROUTE
===================================================== */

function loadCustomRoute() {
  if (!IS_CUSTOM_MODE) {
    return null;
  }

  try {
    const raw = localStorage.getItem(CUSTOM_ROUTE_KEY);

    if (!raw) {
      return null;
    }

    const route = JSON.parse(raw);

    if (!route || !Array.isArray(route.holds)) {
      return null;
    }

    return {
      ...route,

      holds: route.holds.map(normalizedHold),
    };
  } catch {
    return null;
  }
}

const customRoute = loadCustomRoute();

const preparedOnlineRoute = ONLINE?.getPreparedRoute?.() || null;

const currentLevel = preparedOnlineRoute || customRoute || LEVELS[(DAILY_NUMBER - 1) % LEVELS.length];

const ONLINE_SCORE_ACTIVE = Boolean(currentLevel?.onlineId && !IS_CUSTOM_MODE);

const IS_COMMUNITY_ROUTE = Boolean(ROUTE_QUERY_ID && ONLINE_SCORE_ACTIVE);

let holds = JSON.parse(JSON.stringify(currentLevel.holds.map(normalizedHold)));

/* =====================================================
   STATE / PHYSICS / BODY
===================================================== */

const state = {
  width: 0,
  height: 0,
  worldHeight: 0,
  cameraY: 0,

  dpr: Math.min(window.devicePixelRatio || 1, 2),

  status: "ready",

  moves: 0,
  falls: 0,

  selectedLimb: null,

  originalGrip: null,
  originalGripSide: null,

  hoveredHold: null,
  hoveredGripSide: null,

  topped: false,

  falling: false,
  fallTimer: 0,

  startedAt: 0,
  elapsedMs: 0,

  lastTime: performance.now(),

  dragVX: 0,
  dragVY: 0,

  lastDragX: 0,
  lastDragY: 0,
  lastDragTime: 0,
};

const PHYSICS = {
  gravity: 1250,

  linearDrag: 0.986,
  angularDrag: 0.958,

  handPullGain: 165,
  handDamping: 22,
  maxHandPull: 4800,

  footPushGain: 225,
  footDamping: 24,
  maxFootPush: 7000,

  poseGain: 43,
  poseDamping: 15,
  maxPoseForce: 3900,

  reachBodyForce: 1900,

  reachTorque: 5200,
  reachAngularDamping: 800,

  coreTorque: 4300,
  coreAngularDamping: 950,

  limbSwingTorqueMax: 1850,
  limbSwingForceMax: 115,

  maxVelocity: 850,
  maxAngularVelocity: 3.9,
};

const body = {
  pelvis: {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
  },

  angle: 0,

  angularVelocity: 0,

  scale: 1,

  shoulderWidth: 44,
  hipWidth: 30,

  torsoLength: 80,

  upperArm: 60,
  foreArm: 58,

  thigh: 72,
  shin: 70,
};

/* =====================================================
   CLIMBER HAT
===================================================== */

const climberHat = {
  attached: true,

  x: 0,
  y: 0,

  vx: 0,
  vy: 0,

  angle: 0,
  angularVelocity: 0,

  previousHeadX: 0,
  previousHeadY: 0,

  headVX: 0,
  headVY: 0,
  headSpeed: 0,

  unsafeTiltTime: 0,

  age: 0,

  initialized: false,
};

function makeLimb(label, kind, side) {
  return {
    label,
    kind,
    side,

    grip: null,
    gripSide: null,

    targetLength: 0,

    burst: 0,

    sloperEnergy: 1,

    free: {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
    },
  };
}

const limbs = {
  leftHand: makeLimb("venstre hånd", "hand", "left"),

  rightHand: makeLimb("højre hånd", "hand", "right"),

  leftFoot: makeLimb("venstre fod", "foot", "left"),

  rightFoot: makeLimb("højre fod", "foot", "right"),
};

/* =====================================================
   BASIC GEOMETRY
===================================================== */

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getHold(id) {
  return holds.find((h) => h.id === id) || null;
}

function hp(hold) {
  return {
    x: hold.x * state.width,

    y: hold.y * state.worldHeight,

    r: hold.r * body.scale,
  };
}

function maxReach(limbKey) {
  return limbs[limbKey].kind === "hand" ? body.upperArm + body.foreArm : body.thigh + body.shin;
}

function getHoldGeometry(hold) {
  const p = hp(hold);

  let width = p.r * 2.15;

  let height = p.r * 1.45;

  if (hold.type === "foot") {
    width = p.r * 1.9;

    height = p.r * 0.85;
  }

  if (hold.shape === "edge") {
    height *= 0.72;
  }

  if (hold.shape === "sloper") {
    width *= 1.15;
  }

  return {
    ...p,
    width,
    height,
  };
}

function rotateLocalToWorld(x, y, angle) {
  const c = Math.cos(angle);

  const s = Math.sin(angle);

  return {
    x: x * c - y * s,

    y: x * s + y * c,
  };
}

function getGripAnchor(hold, side) {
  const g = getHoldGeometry(hold);

  let lx = 0;
  let ly = 0;

  if (side === "top") {
    ly = -g.height * 0.46;
  }

  if (side === "bottom") {
    ly = g.height * 0.46;
  }

  if (side === "left") {
    lx = -g.width * 0.48;
  }

  if (side === "right") {
    lx = g.width * 0.48;
  }

  const rotated = rotateLocalToWorld(lx, ly, hold.angle || 0);

  return {
    x: g.x + rotated.x,

    y: g.y + rotated.y,
  };
}

function getSideTangent(hold, side) {
  let lx = 1;
  let ly = 0;

  if (side === "left" || side === "right") {
    lx = 0;
    ly = 1;
  }

  return rotateLocalToWorld(lx, ly, hold.angle || 0);
}

function enabledGripSides(hold) {
  return ["top", "right", "bottom", "left"].filter((side) => hold.gripSides?.[side]);
}

function chooseClosestEnabledSide(hold, point) {
  let bestSide = null;

  let bestDistance = Infinity;

  for (const side of enabledGripSides(hold)) {
    const anchor = getGripAnchor(hold, side);

    const d = dist(point, anchor);

    if (d < bestDistance) {
      bestDistance = d;

      bestSide = side;
    }
  }

  return {
    side: bestSide,

    distance: bestDistance,
  };
}

/* =====================================================
   TIME / STORAGE
===================================================== */

function formatTime(ms) {
  const total = Math.max(0, ms / 1000);

  const min = Math.floor(total / 60);

  const sec = Math.floor(total % 60);

  const tenth = Math.floor((total % 1) * 10);

  return `${String(min).padStart(2, "0")}:` + `${String(sec).padStart(2, "0")}.` + `${tenth}`;
}

function updateHUD() {
  movesEl.textContent = state.moves;

  fallsEl.textContent = state.falls;

  timerEl.textContent = formatTime(state.elapsedMs);
}

function loadRecords() {
  try {
    return (
      JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
        days: {},
      }
    );
  } catch {
    return {
      days: {},
    };
  }
}

function saveRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function loadRouteLibrary() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ROUTE_LIBRARY_KEY));

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRouteLibrary(items) {
  localStorage.setItem(ROUTE_LIBRARY_KEY, JSON.stringify(items));
}

function getCustomBest() {
  if (!IS_CUSTOM_MODE || !currentLevel.libraryId) {
    return null;
  }

  const entry = loadRouteLibrary().find((item) => item.id === currentLevel.libraryId);

  return entry?.best || null;
}

function isBetterResult(a, b) {
  if (!b) {
    return true;
  }

  if (a.moves !== b.moves) {
    return a.moves < b.moves;
  }

  if (a.falls !== b.falls) {
    return a.falls < b.falls;
  }

  return a.timeMs < b.timeMs;
}

function getTodayBest() {
  if (ONLINE_SCORE_ACTIVE) {
    return ONLINE?.getPreparedPersonalBest?.() || null;
  }

  if (IS_CUSTOM_MODE) {
    return getCustomBest();
  }

  return loadRecords().days?.[TODAY_KEY]?.best || null;
}

function getStreak() {
  if (IS_CUSTOM_MODE || IS_COMMUNITY_ROUTE) {
    return 0;
  }

  const records = loadRecords();

  let streak = 0;

  let serial = TODAY_SERIAL;

  while (records.days?.[dateKeyFromSerial(serial)]?.completed) {
    streak++;

    serial--;
  }

  return streak;
}

function saveCompletedRun(run) {
  if (ONLINE_SCORE_ACTIVE) {
    if (!IS_COMMUNITY_ROUTE) {
      const records = loadRecords();

      records.days ||= {};

      records.days[TODAY_KEY] ||= {
        completed: true,
        best: null,
      };

      records.days[TODAY_KEY].completed = true;

      saveRecords(records);
    }

    return false;
  }

  if (IS_CUSTOM_MODE) {
    if (!currentLevel.libraryId) {
      return false;
    }

    const library = loadRouteLibrary();

    const index = library.findIndex((item) => item.id === currentLevel.libraryId);

    if (index < 0) {
      return false;
    }

    const better = isBetterResult(run, library[index].best);

    if (better) {
      library[index].best = {
        ...run,
        completedAt: Date.now(),
      };

      library[index].updatedAt = Date.now();

      writeRouteLibrary(library);
    }

    return better;
  }

  const records = loadRecords();

  records.days ||= {};

  records.days[TODAY_KEY] ||= {
    completed: true,
    best: null,
  };

  const day = records.days[TODAY_KEY];

  day.completed = true;

  const better = isBetterResult(run, day.best);

  if (better) {
    day.best = {
      ...run,
    };
  }

  saveRecords(records);

  return better;
}

/* =====================================================
   RESIZE / CAMERA
===================================================== */

function resize() {
  const rect = canvas.getBoundingClientRect();

  state.width = rect.width;

  state.height = rect.height;

  state.worldHeight = state.height * WORLD_HEIGHT_MULTIPLIER;

  state.dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.max(1, Math.round(state.width * state.dpr));

  canvas.height = Math.max(1, Math.round(state.height * state.dpr));

  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

  body.scale = clamp(
    Math.min(
      state.width / 560,

      state.height / 930,
    ),
    0.62,
    0.86,
  );

  body.shoulderWidth = 44 * body.scale;

  body.hipWidth = 30 * body.scale;

  body.torsoLength = 80 * body.scale;

  body.upperArm = 60 * body.scale;

  body.foreArm = 58 * body.scale;

  body.thigh = 72 * body.scale;

  body.shin = 70 * body.scale;

  placeBodyAtStart();
}

function getCameraTarget() {
  const maxCamera = Math.max(0, state.worldHeight - state.height);

  return clamp(body.pelvis.y - state.height * 0.62, 0, maxCamera);
}

function updateCamera(dt) {
  const target = getCameraTarget();

  const blend = Math.min(1, dt * 5.2);

  state.cameraY += (target - state.cameraY) * blend;
}

/* =====================================================
   BODY POINTS
===================================================== */

function shoulderPoints() {
  const top = {
    x: body.pelvis.x + Math.sin(body.angle) * body.torsoLength,

    y: body.pelvis.y - Math.cos(body.angle) * body.torsoLength,
  };

  const nx = Math.cos(body.angle);

  const ny = Math.sin(body.angle);

  return {
    center: top,

    left: {
      x: top.x - (nx * body.shoulderWidth) / 2,

      y: top.y - (ny * body.shoulderWidth) / 2,
    },

    right: {
      x: top.x + (nx * body.shoulderWidth) / 2,

      y: top.y + (ny * body.shoulderWidth) / 2,
    },
  };
}

function hipPoints() {
  const nx = Math.cos(body.angle);

  const ny = Math.sin(body.angle);

  return {
    left: {
      x: body.pelvis.x - (nx * body.hipWidth) / 2,

      y: body.pelvis.y - (ny * body.hipWidth) / 2,
    },

    right: {
      x: body.pelvis.x + (nx * body.hipWidth) / 2,

      y: body.pelvis.y + (ny * body.hipWidth) / 2,
    },
  };
}

/* =====================================================
   HAT PHYSICS / ATTACHMENT
===================================================== */

function getSkeletonHeadPoint() {
  const shoulders = shoulderPoints();

  const upX = Math.sin(body.angle);

  const upY = -Math.cos(body.angle);

  const headOffset = 24 * body.scale;

  return {
    x: shoulders.center.x + upX * headOffset,

    y: shoulders.center.y + upY * headOffset,
  };
}

function getAttachedHatPoint() {
  const head = getSkeletonHeadPoint();

  const upX = Math.sin(body.angle);
  const upY = -Math.cos(body.angle);

  const offset = 21 * body.scale;

  return {
    x: head.x + upX * offset,
    y: head.y + upY * offset,
  };
}

function resetClimberHat() {
  const head = getSkeletonHeadPoint();

  const anchor = getAttachedHatPoint();

  climberHat.attached = true;

  climberHat.x = anchor.x;

  climberHat.y = anchor.y;

  climberHat.vx = 0;

  climberHat.vy = 0;

  climberHat.angle = body.angle - 0.13;

  climberHat.angularVelocity = 0;

  climberHat.previousHeadX = head.x;

  climberHat.previousHeadY = head.y;

  climberHat.headVX = 0;

  climberHat.headVY = 0;

  climberHat.headSpeed = 0;

  climberHat.unsafeTiltTime = 0;

  climberHat.age = 0;

  climberHat.initialized = true;
}

function knockClimberHatOff({ extraVx = 0, extraVy = 0, spin = 0 } = {}) {
  if (!climberHat.attached) {
    return;
  }

  const anchor = getAttachedHatPoint();

  climberHat.attached = false;

  climberHat.x = anchor.x;

  climberHat.y = anchor.y;

  climberHat.vx = climberHat.headVX * 0.9 + extraVx;

  climberHat.vy = climberHat.headVY * 0.9 + extraVy;

  climberHat.angle = body.angle - 0.13;

  climberHat.angularVelocity = body.angularVelocity * 1.15 + spin;
}

function updateClimberHat(dt) {
  if (!dt || dt <= 0) {
    return;
  }

  if (!climberHat.initialized) {
    resetClimberHat();
  }

  const head = getSkeletonHeadPoint();

  const rawVX = (head.x - climberHat.previousHeadX) / Math.max(dt, 0.001);

  const rawVY = (head.y - climberHat.previousHeadY) / Math.max(dt, 0.001);

  climberHat.headVX += (rawVX - climberHat.headVX) * Math.min(1, dt * 18);

  climberHat.headVY += (rawVY - climberHat.headVY) * Math.min(1, dt * 18);

  climberHat.headSpeed = Math.hypot(climberHat.headVX, climberHat.headVY);

  climberHat.previousHeadX = head.x;

  climberHat.previousHeadY = head.y;

  climberHat.age += dt;

  if (climberHat.attached) {
    const anchor = getAttachedHatPoint();

    climberHat.x = anchor.x;

    climberHat.y = anchor.y;

    climberHat.angle = body.angle - 0.13;

    const absTilt = Math.abs(body.angle);

    const unsafeTilt = absTilt > 1.04;

    const extremeTilt = absTilt > 1.24;

    if (unsafeTilt) {
      climberHat.unsafeTiltTime += dt * (extremeTilt ? 2.15 : 1);
    } else {
      climberHat.unsafeTiltTime = Math.max(0, climberHat.unsafeTiltTime - dt * 3.6);
    }

    const maxBurst = Math.max(...Object.values(limbs).map((limb) => limb.burst || 0));

    const angularSpeed = Math.abs(body.angularVelocity);

    const violentMovement = climberHat.headSpeed > 610 || angularSpeed > 3.35 || (climberHat.headSpeed > 455 && angularSpeed > 2.35) || (maxBurst > 0.72 && climberHat.headSpeed > 430);

    if (climberHat.age > 0.55 && climberHat.unsafeTiltTime > 0.17) {
      const direction = body.angle >= 0 ? 1 : -1;

      knockClimberHatOff({
        extraVx: direction * 42 * body.scale,

        extraVy: 12,

        spin: direction * 1.8,
      });
    } else if (climberHat.age > 0.55 && violentMovement) {
      const lateral = clamp(climberHat.headVX * 0.08, -55, 55);

      knockClimberHatOff({
        extraVx: lateral + (Math.random() - 0.5) * 34,

        extraVy: -55 - Math.min(75, climberHat.headSpeed * 0.055),

        spin: (Math.random() - 0.5) * 4.8,
      });
    }

    return;
  }

  const gravity = 1080;

  climberHat.vy += gravity * dt;

  climberHat.vx *= Math.pow(0.994, dt * 60);

  climberHat.vy *= Math.pow(0.997, dt * 60);

  climberHat.angularVelocity *= Math.pow(0.992, dt * 60);

  climberHat.x += climberHat.vx * dt;

  climberHat.y += climberHat.vy * dt;

  climberHat.angle += climberHat.angularVelocity * dt;
}

function rootForLimb(limbKey) {
  const limb = limbs[limbKey];

  if (limb.kind === "hand") {
    const shoulders = shoulderPoints();

    return limb.side === "left" ? shoulders.left : shoulders.right;
  }

  const hips = hipPoints();

  return limb.side === "left" ? hips.left : hips.right;
}

/* =====================================================
   AUTO START
===================================================== */

function calculateAutomaticStartPelvis() {
  const start = currentLevel.start || {};

  const lh = getHold(start.leftHand);

  const rh = getHold(start.rightHand);

  const lf = getHold(start.leftFoot);

  const rf = getHold(start.rightFoot);

  const all = [lh, rh, lf, rf].filter(Boolean);

  if (!all.length) {
    return {
      x: state.width * 0.5,

      y: state.worldHeight * 0.7,
    };
  }

  const x = all.reduce((sum, h) => sum + h.x * state.width, 0) / all.length;

  const handHolds = [lh, rh].filter(Boolean);

  const footHolds = [lf, rf].filter(Boolean);

  let handTargetY = null;

  let footTargetY = null;

  if (handHolds.length) {
    const y = handHolds.reduce((sum, h) => sum + h.y * state.worldHeight, 0) / handHolds.length;

    handTargetY = y + body.torsoLength + (body.upperArm + body.foreArm) * 0.4;
  }

  if (footHolds.length) {
    const y = footHolds.reduce((sum, h) => sum + h.y * state.worldHeight, 0) / footHolds.length;

    footTargetY = y - (body.thigh + body.shin) * 0.65;
  }

  let y = state.worldHeight * 0.7;

  if (handTargetY != null && footTargetY != null) {
    y = handTargetY * 0.42 + footTargetY * 0.58;
  } else if (handTargetY != null) {
    y = handTargetY;
  } else if (footTargetY != null) {
    y = footTargetY;
  }

  const topMargin = body.torsoLength + 55 * body.scale;

  const bottomMargin = 35 * body.scale;

  return {
    x: clamp(x, 45 * body.scale, state.width - 45 * body.scale),

    y: clamp(y, topMargin, state.worldHeight - bottomMargin),
  };
}

/* =====================================================
   GRIP / ENDPOINTS / CAPACITY
===================================================== */

function getHoldUsage(holdId) {
  let hands = 0;
  let feet = 0;

  for (const limb of Object.values(limbs)) {
    if (limb.grip !== holdId) {
      continue;
    }

    if (limb.kind === "hand") {
      hands++;
    } else {
      feet++;
    }
  }

  return {
    hands,
    feet,
  };
}

function findSwapOccupant(hold, limbKey) {
  const moving = limbs[limbKey];

  const cap = getHoldCapacity(hold)[moving.kind === "hand" ? "hands" : "feet"];

  if (cap !== 1) {
    return null;
  }

  for (const [otherKey, other] of Object.entries(limbs)) {
    if (otherKey === limbKey) {
      continue;
    }

    if (other.kind === moving.kind && other.grip === hold.id) {
      return otherKey;
    }
  }

  return null;
}

function holdTypeAllowsLimb(hold, limbKey) {
  const limb = limbs[limbKey];

  if (limb.kind === "hand" && hold.type === "foot") {
    return false;
  }

  if (limb.kind === "foot" && hold.type === "top") {
    return false;
  }

  return true;
}

function capacityAllowsLimb(hold, limbKey) {
  const limb = limbs[limbKey];

  const capacity = getHoldCapacity(hold);

  const usage = getHoldUsage(hold.id);

  const cap = limb.kind === "hand" ? capacity.hands : capacity.feet;

  const used = limb.kind === "hand" ? usage.hands : usage.feet;

  if (cap <= 0) {
    return false;
  }

  if (used < cap) {
    return true;
  }

  return cap === 1 && !!findSwapOccupant(hold, limbKey);
}

function validHoldForLimb(hold, limbKey) {
  return holdTypeAllowsLimb(hold, limbKey) && capacityAllowsLimb(hold, limbKey) && enabledGripSides(hold).length > 0;
}

function findBestGripCandidate(hold, limbKey, point) {
  if (!validHoldForLimb(hold, limbKey)) {
    return null;
  }

  const g = getHoldGeometry(hold);

  const baseSnap = Math.max(22 * body.scale, g.r * 0.95);

  let best = null;

  for (const side of enabledGripSides(hold)) {
    const anchor = getGripAnchor(hold, side);

    const d = dist(point, anchor);

    const snap = baseSnap + (side === "top" ? 5 * body.scale : 0);

    if (d <= snap && (!best || d < best.distance)) {
      best = {
        hold,
        side,
        anchor,
        distance: d,
      };
    }
  }

  return best;
}

function chooseStartGripSide(limbKey, hold) {
  const root = rootForLimb(limbKey);

  const nearest = chooseClosestEnabledSide(hold, root);

  return nearest.side || enabledGripSides(hold)[0] || "top";
}

function endpointForLimb(limbKey) {
  const limb = limbs[limbKey];

  if (limb.grip) {
    const hold = getHold(limb.grip);

    if (hold) {
      return getGripAnchor(hold, limb.gripSide || chooseStartGripSide(limbKey, hold));
    }
  }

  return limb.free;
}

function visualEndpointForLimb(limbKey) {
  const limb = limbs[limbKey];

  const point = endpointForLimb(limbKey);

  if (!limb.grip) {
    return point;
  }

  const shared = Object.entries(limbs).some(([key, other]) => key !== limbKey && other.grip === limb.grip);

  if (!shared) {
    return point;
  }

  const hold = getHold(limb.grip);

  if (!hold) {
    return point;
  }

  const tangent = getSideTangent(hold, limb.gripSide || "top");

  const normal = {
    x: -tangent.y,

    y: tangent.x,
  };

  const sideSign = limb.side === "left" ? -1 : 1;

  const tangentAmount = (limb.kind === "hand" ? 13 : 10) * body.scale * sideSign;

  const normalAmount = (limb.kind === "hand" ? -5 : 6) * body.scale;

  return {
    x: point.x + tangent.x * tangentAmount + normal.x * normalAmount,

    y: point.y + tangent.y * tangentAmount + normal.y * normalAmount,
  };
}

function detachLimb(limbKey, inheritVelocity = true) {
  const limb = limbs[limbKey];

  const point = endpointForLimb(limbKey);

  limb.grip = null;

  limb.gripSide = null;

  limb.free.x = point.x;

  limb.free.y = point.y;

  limb.free.vx = inheritVelocity ? body.pelvis.vx * 0.25 : 0;

  limb.free.vy = inheritVelocity ? body.pelvis.vy * 0.25 : 0;
}

function attachLimb(limbKey, holdId, preserveLength = false, gripSide = null) {
  const limb = limbs[limbKey];

  const hold = getHold(holdId);

  if (!hold) {
    return;
  }

  const chosenSide = gripSide || chooseStartGripSide(limbKey, hold);

  limb.grip = holdId;

  limb.gripSide = chosenSide;

  const root = rootForLimb(limbKey);

  const anchor = getGripAnchor(hold, chosenSide);

  const currentLength = dist(root, anchor);

  const maximum = maxReach(limbKey);

  if (preserveLength) {
    limb.targetLength = clamp(currentLength, maximum * 0.25, maximum * 0.97);

    limb.burst = 0;
  } else if (limb.kind === "hand") {
    limb.targetLength = clamp(currentLength * 0.65, maximum * 0.34, maximum * 0.6);

    limb.burst = 1;
  } else {
    limb.targetLength = clamp(Math.max(currentLength * 1.25, maximum * 0.76), maximum * 0.68, maximum * 0.9);

    limb.burst = 1;
  }

  limb.free.x = anchor.x;

  limb.free.y = anchor.y;

  limb.free.vx = 0;

  limb.free.vy = 0;
}

function performAutoSwapIfNeeded(hold, movingLimbKey) {
  const swapKey = findSwapOccupant(hold, movingLimbKey);

  if (!swapKey) {
    return null;
  }

  detachLimb(swapKey, true);

  return swapKey;
}

/* =====================================================
   START POSITION
===================================================== */

function solveStartConstraints() {
  for (const limbKey of Object.keys(limbs)) {
    const limb = limbs[limbKey];

    if (!limb.grip) {
      continue;
    }

    const root = rootForLimb(limbKey);

    const anchor = endpointForLimb(limbKey);

    const dx = anchor.x - root.x;

    const dy = anchor.y - root.y;

    const length = Math.hypot(dx, dy) || 1;

    const maximum = maxReach(limbKey) * (limb.kind === "foot" ? 1.04 : 0.98);

    if (length <= maximum) {
      continue;
    }

    const excess = length - maximum;

    body.pelvis.x += (dx / length) * excess * 0.38;

    body.pelvis.y += (dy / length) * excess * 0.38;
  }
}

function placeBodyAtStart() {
  if (!state.width || !state.height) {
    return;
  }

  state.selectedLimb = null;

  state.originalGrip = null;

  state.originalGripSide = null;

  state.hoveredHold = null;

  state.hoveredGripSide = null;

  state.falling = false;

  state.fallTimer = 0;

  state.dragVX = 0;

  state.dragVY = 0;

  body.angle = 0;

  body.angularVelocity = 0;

  const start = calculateAutomaticStartPelvis();

  body.pelvis.x = start.x;

  body.pelvis.y = start.y;

  body.pelvis.vx = 0;

  body.pelvis.vy = 0;

  for (const limb of Object.values(limbs)) {
    limb.grip = null;

    limb.gripSide = null;

    limb.burst = 0;

    limb.sloperEnergy = 1;

    limb.free.vx = 0;

    limb.free.vy = 0;
  }

  if (currentLevel.start) {
    attachLimb("leftHand", currentLevel.start.leftHand, true);

    attachLimb("rightHand", currentLevel.start.rightHand, true);

    attachLimb("leftFoot", currentLevel.start.leftFoot, true);

    attachLimb("rightFoot", currentLevel.start.rightFoot, true);
  }

  for (let i = 0; i < 12; i++) {
    solveStartConstraints();
  }

  body.pelvis.vx = 0;

  body.pelvis.vy = 0;

  body.angularVelocity = 0;

  state.cameraY = getCameraTarget();

  resetClimberHat();
}

/* =====================================================
   GAME FLOW
===================================================== */

function startRun() {
  state.status = "playing";

  state.moves = 0;

  state.falls = 0;

  state.elapsedMs = 0;

  state.topped = false;

  state.startedAt = performance.now();

  placeBodyAtStart();

  updateHUD();

  startOverlay.classList.add("hidden");

  resultOverlay.classList.add("hidden");

  if (ONLINE_SCORE_ACTIVE) {
    ONLINE?.countPlay?.(currentLevel.onlineId).catch((error) => {
      console.warn("Kunne ikke tælle play:", error);
    });
  }

  hintEl.innerHTML = "🧗 <strong>TOP begge hænder!</strong>";
}

function restartRun() {
  startRun();
}

function resetToMenu() {
  state.status = "ready";

  state.moves = 0;

  state.falls = 0;

  state.elapsedMs = 0;

  state.topped = false;

  pendingCompletedRun = null;

  placeBodyAtStart();

  updateHUD();

  updateStartScreen();

  resultOverlay.classList.add("hidden");

  startOverlay.classList.remove("hidden");

  hintEl.textContent = "Klar til climb.";
}

function triggerFall() {
  if (state.falling || state.status !== "playing") {
    return;
  }

  state.falling = true;

  state.fallTimer = 0;

  state.falls++;

  knockClimberHatOff({
    extraVx: body.pelvis.vx * 0.12,

    extraVy: -90,

    spin: body.angularVelocity * 0.9 + (Math.random() - 0.5) * 3,
  });

  updateHUD();

  hintEl.innerHTML = "<strong>FALL 💀</strong>";
}

function respawnAfterFall() {
  placeBodyAtStart();

  hintEl.innerHTML = `💥 ${state.falls} fall${state.falls === 1 ? "" : "s"} — fortsæt!`;
}

function checkTop() {
  if (state.status !== "playing") {
    return;
  }

  const top = currentLevel.topId;

  if (limbs.leftHand.grip === top && limbs.rightHand.grip === top) {
    finishRun();

    return;
  }

  if (limbs.leftHand.grip === top || limbs.rightHand.grip === top) {
    hintEl.innerHTML = "MATCH med <strong>den anden hånd!</strong>";
  }
}

/* =====================================================
   LEADERBOARD
===================================================== */

function getLeaderboardMedal(place) {
  if (place === 1) {
    return "🥇";
  }

  if (place === 2) {
    return "🥈";
  }

  if (place === 3) {
    return "🥉";
  }

  return `#${place}`;
}

function createLeaderboardRow(row) {
  const element = document.createElement("div");

  element.className = `leaderboard-row${row.isYou ? " you" : ""}`;

  const rank = document.createElement("div");

  rank.className = "leaderboard-rank";

  rank.textContent = getLeaderboardMedal(row.place);

  const player = document.createElement("div");

  player.className = "leaderboard-player";

  const playerName = document.createElement("strong");

  playerName.textContent = row.username;

  const sub = document.createElement("small");

  sub.textContent = row.isYou ? "DIG" : `#${row.place}`;

  player.append(playerName, sub);

  const score = document.createElement("div");

  score.className = "leaderboard-score";

  score.innerHTML = `${row.moves} moves<br>${row.falls} falls · ${formatTime(row.timeMs)}`;

  element.append(rank, player, score);

  return element;
}

function renderLeaderboard(rows) {
  if (!leaderboardList || !leaderboardPosition) {
    return;
  }

  leaderboardList.innerHTML = "";

  const topFive = rows.filter((row) => row.place <= 5);

  const you = rows.find((row) => row.isYou);

  for (const row of topFive) {
    leaderboardList.appendChild(createLeaderboardRow(row));
  }

  if (you && you.place > 5) {
    const separator = document.createElement("div");

    separator.className = "leaderboard-separator";

    separator.textContent = "•••";

    leaderboardList.appendChild(separator);

    leaderboardList.appendChild(createLeaderboardRow(you));
  }

  const totalPlayers = you?.totalPlayers || rows[0]?.totalPlayers || 0;

  if (you) {
    leaderboardPosition.textContent = `#${you.place} AF ${totalPlayers}`;
  } else {
    leaderboardPosition.textContent = `${totalPlayers} KLATRERE`;
  }
}

async function prepareOnlineScoreFlow() {
  if (!ONLINE_SCORE_ACTIVE) {
    return;
  }

  if (!onlineScoreFlow || !scoreNameStep || !scoreNameInput || !scoreNameError || !saveOnlineScoreBtn || !leaderboardStep || !leaderboardList || !leaderboardPosition || !resultButtons) {
    console.error("Leaderboard UI mangler i index.html.");

    resultButtons?.classList.remove("hidden");

    return;
  }

  onlineScoreFlow.classList.remove("hidden");

  scoreNameStep.classList.remove("hidden");

  leaderboardStep.classList.add("hidden");

  resultButtons.classList.add("hidden");

  scoreNameError.classList.add("hidden");

  scoreNameError.textContent = "";

  saveOnlineScoreBtn.disabled = false;

  saveOnlineScoreBtn.textContent = "GEM SCORE";

  scoreNameInput.value = "";

  try {
    const profile = await ONLINE.ensureProfile();

    if (profile?.username && !profile.username.startsWith("Climber-")) {
      scoreNameInput.value = profile.username;
    }
  } catch (error) {
    console.warn("Kunne ikke hente profil:", error);
  }

  setTimeout(() => {
    scoreNameInput.focus();

    scoreNameInput.select();
  }, 350);
}

async function saveOnlineScoreAndShowLeaderboard() {
  if (!ONLINE_SCORE_ACTIVE || !pendingCompletedRun) {
    return;
  }

  if (!scoreNameInput || !scoreNameError || !saveOnlineScoreBtn) {
    return;
  }

  const name = scoreNameInput.value.trim().replace(/\s+/g, " ");

  if (name.length < 2) {
    scoreNameError.textContent = "Skriv mindst 2 tegn.";

    scoreNameError.classList.remove("hidden");

    scoreNameInput.focus();

    return;
  }

  if (name.length > 24) {
    scoreNameError.textContent = "Navnet må maks være 24 tegn.";

    scoreNameError.classList.remove("hidden");

    return;
  }

  saveOnlineScoreBtn.disabled = true;

  saveOnlineScoreBtn.textContent = "GEMMER…";

  scoreNameError.classList.add("hidden");

  try {
    await ONLINE.setUsername(name);

    const newBest = await ONLINE.submitScore(currentLevel.onlineId, pendingCompletedRun);

    let personalBest = null;

    if (ONLINE.refreshPreparedScores) {
      const refreshed = await ONLINE.refreshPreparedScores(currentLevel.onlineId);

      personalBest = refreshed?.personalBest || null;
    } else {
      personalBest = await ONLINE.getPersonalBest(currentLevel.onlineId);

      if (personalBest) {
        ONLINE?.setPreparedPersonalBest?.(personalBest);
      }
    }

    if (personalBest) {
      resultBest.textContent = `${personalBest.moves} moves · ${formatTime(personalBest.timeMs)}`;
    }

    newBestEl.classList.toggle("hidden", !newBest);

    const leaderboard = await ONLINE.getRouteLeaderboard(currentLevel.onlineId);

    renderLeaderboard(leaderboard);

    scoreNameStep.classList.add("hidden");

    leaderboardStep.classList.remove("hidden");

    resultButtons.classList.remove("hidden");

    pendingCompletedRun = null;
  } catch (error) {
    console.error(error);

    scoreNameError.textContent = error.message || "Kunne ikke gemme scoren.";

    scoreNameError.classList.remove("hidden");

    saveOnlineScoreBtn.disabled = false;

    saveOnlineScoreBtn.textContent = "PRØV IGEN";
  }
}

function finishRun() {
  state.status = "finished";

  state.topped = true;

  state.elapsedMs = performance.now() - state.startedAt;

  body.pelvis.vx = 0;

  body.pelvis.vy = 0;

  body.angularVelocity = 0;

  const run = {
    moves: state.moves,

    falls: state.falls,

    timeMs: Math.round(state.elapsedMs),
  };

  pendingCompletedRun = ONLINE_SCORE_ACTIVE ? run : null;

  const isNewBest = saveCompletedRun(run);

  const best = getTodayBest();

  const streak = getStreak();

  resultTitle.textContent = ONLINE_SCORE_ACTIVE ? currentLevel.name : IS_CUSTOM_MODE ? currentLevel.name : `Daily Climb #${DAILY_NUMBER}`;

  resultMoves.textContent = run.moves;

  resultFalls.textContent = run.falls;

  resultTime.textContent = formatTime(run.timeMs);

  resultStreak.textContent = IS_CUSTOM_MODE || IS_COMMUNITY_ROUTE ? "—" : streak;

  resultBest.textContent = best ? `${best.moves} moves · ${formatTime(best.timeMs)}` : "—";

  newBestEl.classList.toggle("hidden", ONLINE_SCORE_ACTIVE || !isNewBest);

  hintEl.innerHTML = "<strong>TOP! 🔥</strong>";

  if (ONLINE_SCORE_ACTIVE) {
    prepareOnlineScoreFlow();
  } else {
    onlineScoreFlow?.classList.add("hidden");

    resultButtons?.classList.remove("hidden");
  }

  setTimeout(() => resultOverlay.classList.remove("hidden"), 300);
}

function updateStartScreen() {
  editRouteBtn.classList.toggle("hidden", !IS_CUSTOM_MODE);

  if (ONLINE_SCORE_ACTIVE) {
    const personalBest = getTodayBest();

    const globalBest = ONLINE?.getPreparedGlobalBest?.() || null;

    const streak = getStreak();

    dailyLabelEl.textContent = IS_COMMUNITY_ROUTE ? "COMMUNITY CLIMB" : "DAGENS BANE";

    startDailyTitle.textContent = currentLevel.name || "Online Boulder";

    routeNameEl.textContent = currentLevel.authorName ? `af ${currentLevel.authorName}` : "Community Boulder";

    if (startGlobalBestEl) {
      startGlobalBestEl.textContent = globalBest ? `${globalBest.username} · ${globalBest.moves} moves · ${globalBest.falls} falls · ${formatTime(globalBest.timeMs)}` : "Ingen score endnu";
    }

    startBestEl.textContent = personalBest ? `${personalBest.moves} moves · ${personalBest.falls} falls · ${formatTime(personalBest.timeMs)}` : "Ikke klaret endnu";

    startStreakEl.textContent = IS_COMMUNITY_ROUTE ? "—" : `${streak} ${streak === 1 ? "dag" : "dage"}`;

    return;
  }

  if (IS_CUSTOM_MODE) {
    const best = getCustomBest();

    dailyLabelEl.textContent = "CUSTOM CLIMB";

    startDailyTitle.textContent = currentLevel.name || "Custom Boulder";

    routeNameEl.textContent = currentLevel.libraryId ? "Gemt bane · highscore aktiv" : "Route Builder Test";

    if (startGlobalBestEl) {
      startGlobalBestEl.textContent = "—";
    }

    startBestEl.textContent = best ? `${best.moves} moves · ${best.falls} falls · ${formatTime(best.timeMs)}` : "Ingen score endnu";

    startStreakEl.textContent = "—";

    return;
  }

  const best = getTodayBest();

  const streak = getStreak();

  dailyLabelEl.textContent = `DAILY CLIMB #${DAILY_NUMBER}`;

  startDailyTitle.textContent = `Daily Climb #${DAILY_NUMBER}`;

  routeNameEl.textContent = currentLevel.name;

  if (startGlobalBestEl) {
    startGlobalBestEl.textContent = "—";
  }

  startBestEl.textContent = best ? `${best.moves} moves · ${formatTime(best.timeMs)}` : "Ikke klaret endnu";

  startStreakEl.textContent = `${streak} ${streak === 1 ? "dag" : "dage"}`;
}

/* =====================================================
   IK / FREE LIMBS
===================================================== */

function solveTwoBone(root, target, a, b, bend = 1) {
  const dx = target.x - root.x;

  const dy = target.y - root.y;

  let d = Math.hypot(dx, dy);

  d = clamp(d, 0.001, a + b - 0.001);

  const ux = dx / d;

  const uy = dy / d;

  const x = (a * a - b * b + d * d) / (2 * d);

  const h = Math.sqrt(Math.max(0, a * a - x * x));

  const px = root.x + ux * x;

  const py = root.y + uy * x;

  return {
    joint: {
      x: px - uy * h * bend,

      y: py + ux * h * bend,
    },
  };
}

function naturalFreeTarget(limbKey) {
  const limb = limbs[limbKey];

  const root = rootForLimb(limbKey);

  const side = limb.side === "left" ? -1 : 1;

  if (limb.kind === "hand") {
    return {
      x: root.x + side * 22 * body.scale,

      y: root.y + 74 * body.scale,
    };
  }

  return {
    x: root.x + side * 15 * body.scale,

    y: root.y + 104 * body.scale,
  };
}

function updateFreeLimb(limbKey, dt) {
  const limb = limbs[limbKey];

  if (limb.grip || state.selectedLimb === limbKey) {
    return;
  }

  const target = naturalFreeTarget(limbKey);

  const spring = limb.kind === "hand" ? 20 : 24;

  limb.free.vx += (target.x - limb.free.x) * spring * dt;

  limb.free.vy += (target.y - limb.free.y) * spring * dt;

  limb.free.vy += PHYSICS.gravity * 0.07 * dt;

  limb.free.vx *= Math.pow(0.82, dt * 60);

  limb.free.vy *= Math.pow(0.82, dt * 60);

  limb.free.x += limb.free.vx * dt;

  limb.free.y += limb.free.vy * dt;

  const margin = 16 * body.scale;

  limb.free.x = clamp(limb.free.x, margin, state.width - margin);

  limb.free.y = clamp(limb.free.y, state.cameraY + margin, state.cameraY + state.height - margin);

  const root = rootForLimb(limbKey);

  const maximum = maxReach(limbKey) * 0.985;

  const dx = limb.free.x - root.x;

  const dy = limb.free.y - root.y;

  const length = Math.hypot(dx, dy) || 1;

  if (length > maximum) {
    limb.free.x = root.x + (dx / length) * maximum;

    limb.free.y = root.y + (dy / length) * maximum;

    limb.free.vx *= 0.4;

    limb.free.vy *= 0.4;
  }
}

function getReachStretch() {
  if (!state.selectedLimb) {
    return 0;
  }

  const root = rootForLimb(state.selectedLimb);

  const target = limbs[state.selectedLimb].free;

  const ratio = dist(root, target) / maxReach(state.selectedLimb);

  return clamp((ratio - 0.55) / 0.42, 0, 1);
}

/* =====================================================
   LIMB FORCE / POSE / REACH
===================================================== */

function calculateLimbForce(limbKey) {
  const limb = limbs[limbKey];

  if (!limb.grip) {
    return null;
  }

  let reachRelax = 1;

  if (state.selectedLimb && state.selectedLimb !== limbKey) {
    reachRelax = 1 - getReachStretch() * 0.58;
  }

  const hold = getHold(limb.grip);

  if (!hold) {
    return null;
  }

  const anchor = endpointForLimb(limbKey);

  const root = rootForLimb(limbKey);

  const dx = anchor.x - root.x;

  const dy = anchor.y - root.y;

  const length = Math.hypot(dx, dy) || 1;

  const towardX = dx / length;

  const towardY = dy / length;

  const awayX = -towardX;

  const awayY = -towardY;

  const rx = root.x - body.pelvis.x;

  const ry = root.y - body.pelvis.y;

  const rootVX = body.pelvis.vx - body.angularVelocity * ry;

  const rootVY = body.pelvis.vy + body.angularVelocity * rx;

  let fx = 0;
  let fy = 0;

  if (limb.kind === "hand") {
    const contraction = Math.max(0, length - limb.targetLength);

    const radialVelocity = rootVX * towardX + rootVY * towardY;

    let pull = contraction * PHYSICS.handPullGain - radialVelocity * PHYSICS.handDamping;

    pull = clamp(pull, 0, PHYSICS.maxHandPull);

    const contacts = getContactStats();

    if (contacts.feet === 0) {
      pull *= contacts.hands >= 2 ? 0.3 : 0.18;
    }

    pull *= reachRelax;

    if (hold.type === "sloper") {
      const sizeBoost = 0.62 + clamp(((hold.r || 20) - 12) / 22, 0, 1) * 0.18;

      pull *= sizeBoost * (0.6 + limb.sloperEnergy * 0.4);
    } else if (hold.shape === "edge") {
      pull *= 0.9;
    }

    fx = towardX * pull;

    fy = towardY * pull;
  } else {
    const extension = Math.max(0, limb.targetLength - length);

    const awayVelocity = rootVX * awayX + rootVY * awayY;

    let push = extension * PHYSICS.footPushGain - awayVelocity * PHYSICS.footDamping;

    push = clamp(push, 0, PHYSICS.maxFootPush);

    const verticalSupport = clamp((anchor.y - root.y) / (maxReach(limbKey) * 0.55), 0, 1);

    const sizeSupport = 0.82 + clamp(((hold.r || 20) - 12) / 22, 0, 1) * 0.18;

    push *= verticalSupport * reachRelax * sizeSupport;

    fx = awayX * push;

    fy = awayY * push;
  }

  return {
    fx,
    fy,
    rx,
    ry,
  };
}

function getContactStats() {
  let hands = 0;
  let feet = 0;

  for (const limb of Object.values(limbs)) {
    if (!limb.grip) {
      continue;
    }

    if (limb.kind === "hand") {
      hands++;
    } else {
      feet++;
    }
  }

  return {
    hands,
    feet,

    total: hands + feet,
  };
}

function calculateClimbPoseDrive() {
  const contacts = getContactStats();

  if (!contacts.total) {
    return {
      fx: 0,
      fy: 0,
    };
  }

  let desiredX = 0;
  let desiredY = 0;
  let totalWeight = 0;

  for (const [limbKey, limb] of Object.entries(limbs)) {
    if (!limb.grip) {
      continue;
    }

    const anchor = endpointForLimb(limbKey);

    const burstBonus = 1 + limb.burst * 0.18;

    if (limb.kind === "hand") {
      const targetX = anchor.x + (limb.side === "left" ? 16 : -16) * body.scale;

      const targetY = anchor.y + body.torsoLength + 38 * body.scale;

      let weight = contacts.feet > 0 ? 1.15 : 0.7;

      weight *= burstBonus;

      desiredX += targetX * weight;

      desiredY += targetY * weight;

      totalWeight += weight;
    } else {
      const targetX = anchor.x + (limb.side === "left" ? 13 : -13) * body.scale;

      const targetY = anchor.y - maxReach(limbKey) * 0.76;

      const weight = 1.15 * burstBonus;

      desiredX += targetX * weight;

      desiredY += targetY * weight;

      totalWeight += weight;
    }
  }

  if (!totalWeight) {
    return {
      fx: 0,
      fy: 0,
    };
  }

  desiredX /= totalWeight;

  desiredY /= totalWeight;

  let strength = 1;

  if (contacts.hands === 1 && contacts.feet === 0) {
    strength = 0.18;
  } else if (contacts.hands === 2 && contacts.feet === 0) {
    strength = 0.12;
  } else if (contacts.hands >= 1 && contacts.feet >= 1) {
    strength = 1;
  } else if (contacts.feet >= 1 && contacts.hands === 0) {
    strength = contacts.feet === 1 ? 0.04 : 0.12;
  }

  if (state.selectedLimb) {
    strength *= 1 - getReachStretch() * 0.48;
  }

  let fx = (desiredX - body.pelvis.x) * PHYSICS.poseGain * strength - body.pelvis.vx * PHYSICS.poseDamping * strength;

  let fy = (desiredY - body.pelvis.y) * PHYSICS.poseGain * strength - body.pelvis.vy * PHYSICS.poseDamping * strength;

  if (contacts.feet === 0) {
    fy = 0;
  }

  const magnitude = Math.hypot(fx, fy);

  if (magnitude > PHYSICS.maxPoseForce) {
    fx = (fx / magnitude) * PHYSICS.maxPoseForce;

    fy = (fy / magnitude) * PHYSICS.maxPoseForce;
  }

  return {
    fx,
    fy,
  };
}

function calculateReachAssist() {
  if (!state.selectedLimb) {
    return {
      fx: 0,
      fy: 0,
      torque: 0,
    };
  }

  const contacts = getContactStats();

  if (!contacts.total) {
    return {
      fx: 0,
      fy: 0,
      torque: 0,
    };
  }

  const limbKey = state.selectedLimb;

  const limb = limbs[limbKey];

  const root = rootForLimb(limbKey);

  const target = limb.free;

  const dx = target.x - root.x;

  const dy = target.y - root.y;

  const distance = Math.hypot(dx, dy) || 1;

  const ratio = distance / maxReach(limbKey);

  const intensity = clamp((ratio - 0.58) / 0.38, 0, 1);

  const dirX = dx / distance;

  const dirY = dy / distance;

  let force = PHYSICS.reachBodyForce * intensity;

  if (limb.kind === "foot") {
    force *= 0.45;
  }

  if (contacts.feet === 0) {
    force *= 0.18;
  }

  let fx = dirX * force;

  let fy = dirY * force;

  if (contacts.feet === 0 && fy < 0) {
    fy = 0;
  }

  const desiredAngle = limb.kind === "hand" ? clamp(dirX * 0.38, -0.38, 0.38) : clamp(dirX * 0.2, -0.2, 0.2);

  let torqueStrength = PHYSICS.reachTorque;

  if (contacts.feet === 0) {
    torqueStrength *= 0.55;
  }

  const torque = (desiredAngle - body.angle) * torqueStrength * intensity - body.angularVelocity * PHYSICS.reachAngularDamping * intensity;

  return {
    fx,
    fy,
    torque,
  };
}

function calculateCoreTorque() {
  const contacts = getContactStats();

  if (contacts.total <= 1) {
    return 0;
  }

  let strength = 0;

  if (contacts.total >= 4) {
    strength = 1;
  } else if (contacts.total === 3) {
    strength = 0.78;
  } else if (contacts.hands >= 1 && contacts.feet >= 1) {
    strength = 0.48;
  } else {
    strength = 0.08;
  }

  if (state.selectedLimb) {
    strength *= 1 - getReachStretch() * 0.52;
  }

  return -body.angle * PHYSICS.coreTorque * strength - body.angularVelocity * PHYSICS.coreAngularDamping * strength;
}

/* =====================================================
   LIMB SWING / MOMENTUM
===================================================== */

function getCurrentSupportControl() {
  let total = 0;

  let weight = 0;

  for (const limb of Object.values(limbs)) {
    if (!limb.grip) {
      continue;
    }

    const hold = getHold(limb.grip);

    if (!hold) {
      continue;
    }

    let factor = getHoldSwingControl(hold, limb.kind);

    if (limb.kind === "hand" && hold.type === "sloper") {
      factor *= 0.62 + limb.sloperEnergy * 0.38;
    }

    const w = limb.kind === "hand" ? 1.1 : 0.8;

    total += factor * w;

    weight += w;
  }

  return weight ? clamp(total / weight, 0.45, 1.08) : 0;
}

function calculateLimbSwingAssist() {
  if (!state.selectedLimb) {
    return {
      fx: 0,
      torque: 0,
    };
  }

  const contacts = getContactStats();

  if (!contacts.total) {
    return {
      fx: 0,
      torque: 0,
    };
  }

  const limb = limbs[state.selectedLimb];

  const speed = Math.hypot(state.dragVX, state.dragVY);

  if (speed < 35) {
    return {
      fx: 0,
      torque: 0,
    };
  }

  const support = getCurrentSupportControl();

  if (!support) {
    return {
      fx: 0,
      torque: 0,
    };
  }

  const rx = limb.free.x - body.pelvis.x;

  const ry = limb.free.y - body.pelvis.y;

  const angularInput = rx * state.dragVY - ry * state.dragVX;

  const limbFactor = limb.kind === "foot" ? 0.052 : 0.04;

  const torque = clamp(angularInput * limbFactor * support, -PHYSICS.limbSwingTorqueMax, PHYSICS.limbSwingTorqueMax);

  const horizontalFactor = limb.kind === "foot" ? 0.1 : 0.065;

  const fx = clamp(-state.dragVX * horizontalFactor * support, -PHYSICS.limbSwingForceMax, PHYSICS.limbSwingForceMax);

  return {
    fx,
    torque,
  };
}

/* =====================================================
   SLOPER STAMINA
===================================================== */

function updateSloperStamina(dt) {
  for (const [limbKey, limb] of Object.entries(limbs)) {
    if (limb.kind !== "hand") {
      continue;
    }

    const hold = limb.grip ? getHold(limb.grip) : null;

    if (!hold || hold.type !== "sloper") {
      limb.sloperEnergy = clamp(limb.sloperEnergy + dt * 0.34, 0, 1);

      continue;
    }

    const hangLimit = getSloperHangLimit(limbKey, hold);

    limb.sloperEnergy -= dt / hangLimit;

    if (limb.sloperEnergy <= 0) {
      limb.sloperEnergy = 0;

      detachLimb(limbKey, true);

      hintEl.innerHTML = `<strong>${limb.label.toUpperCase()} SLAP SLOPEREN 💀</strong>`;
    }
  }
}

/* =====================================================
   PHYSICS LOOP
===================================================== */

function updatePhysics(dt) {
  if (state.status !== "playing") {
    return;
  }

  let forceX = 0;

  let forceY = PHYSICS.gravity;

  let torque = calculateCoreTorque();

  for (const limbKey of Object.keys(limbs)) {
    const force = calculateLimbForce(limbKey);

    if (!force) {
      continue;
    }

    forceX += force.fx;

    forceY += force.fy;

    torque += force.rx * force.fy - force.ry * force.fx;
  }

  const climbDrive = calculateClimbPoseDrive();

  forceX += climbDrive.fx;

  forceY += climbDrive.fy;

  const reachAssist = calculateReachAssist();

  forceX += reachAssist.fx;

  forceY += reachAssist.fy;

  torque += reachAssist.torque;

  const swingAssist = calculateLimbSwingAssist();

  forceX += swingAssist.fx;

  torque += swingAssist.torque;

  state.dragVX *= Math.pow(0.7, dt * 60);

  state.dragVY *= Math.pow(0.7, dt * 60);

  body.pelvis.vx += forceX * dt;

  body.pelvis.vy += forceY * dt;

  const inertia = body.torsoLength ** 2 * 0.42;

  body.angularVelocity += (torque / inertia) * dt;

  body.pelvis.vx *= Math.pow(PHYSICS.linearDrag, dt * 60);

  body.pelvis.vy *= Math.pow(PHYSICS.linearDrag, dt * 60);

  body.angularVelocity *= Math.pow(PHYSICS.angularDrag, dt * 60);

  body.pelvis.vx = clamp(body.pelvis.vx, -PHYSICS.maxVelocity, PHYSICS.maxVelocity);

  body.pelvis.vy = clamp(body.pelvis.vy, -PHYSICS.maxVelocity, PHYSICS.maxVelocity);

  body.angularVelocity = clamp(body.angularVelocity, -PHYSICS.maxAngularVelocity, PHYSICS.maxAngularVelocity);

  body.pelvis.x += body.pelvis.vx * dt;

  body.pelvis.y += body.pelvis.vy * dt;

  body.angle += body.angularVelocity * dt;

  body.angle = clamp(body.angle, -1.35, 1.35);

  solveHardConstraints();

  updateSloperStamina(dt);

  for (const limb of Object.values(limbs)) {
    limb.burst = Math.max(0, limb.burst - dt * 3);
  }

  for (const limbKey of Object.keys(limbs)) {
    updateFreeLimb(limbKey, dt);
  }

  updateCamera(dt);

  if (getContactStats().total === 0 && body.pelvis.y > state.worldHeight + 80) {
    triggerFall();
  }
}

function solveHardConstraints() {
  for (let iteration = 0; iteration < 8; iteration++) {
    for (const limbKey of Object.keys(limbs)) {
      const limb = limbs[limbKey];

      if (!limb.grip) {
        continue;
      }

      const root = rootForLimb(limbKey);

      const anchor = endpointForLimb(limbKey);

      const dx = anchor.x - root.x;

      const dy = anchor.y - root.y;

      const length = Math.hypot(dx, dy) || 1;

      const maximum = maxReach(limbKey) * (limb.kind === "foot" ? 1.07 : 0.99);

      if (length <= maximum) {
        continue;
      }

      if (limb.kind === "foot") {
        detachLimb(limbKey, true);

        continue;
      }

      const excess = length - maximum;

      const nx = dx / length;

      const ny = dy / length;

      const correction = state.selectedLimb ? 0.28 + (1 - getReachStretch()) * 0.12 : 0.4;

      body.pelvis.x += nx * excess * correction;

      body.pelvis.y += ny * excess * correction;

      const awayVelocity = body.pelvis.vx * -nx + body.pelvis.vy * -ny;

      if (awayVelocity > 0) {
        body.pelvis.vx += nx * awayVelocity * 0.38;

        body.pelvis.vy += ny * awayVelocity * 0.38;
      }
    }
  }
}

/* =====================================================
   DRAW HOLD SHAPES / GRIP SIDES
===================================================== */

function traceHoldShape(hold, width, height) {
  const shape = hold.shape || defaultShapeForType(hold.type);

  ctx.beginPath();

  if (shape === "edge") {
    ctx.moveTo(-width * 0.52, -height * 0.22);

    ctx.lineTo(-width * 0.35, -height * 0.52);

    ctx.lineTo(width * 0.4, -height * 0.48);

    ctx.lineTo(width * 0.53, -height * 0.1);

    ctx.lineTo(width * 0.36, height * 0.42);

    ctx.lineTo(-width * 0.43, height * 0.5);

    ctx.closePath();

    return;
  }

  if (shape === "wedge") {
    ctx.moveTo(-width * 0.58, height * 0.35);

    ctx.lineTo(-width * 0.34, -height * 0.42);

    ctx.lineTo(width * 0.5, -height * 0.3);

    ctx.lineTo(width * 0.58, height * 0.3);

    ctx.lineTo(width * 0.1, height * 0.48);

    ctx.closePath();

    return;
  }

  if (shape === "blob") {
    ctx.moveTo(-width * 0.48, -height * 0.1);

    ctx.bezierCurveTo(-width * 0.42, -height * 0.58, width * 0.18, -height * 0.62, width * 0.48, -height * 0.22);

    ctx.bezierCurveTo(width * 0.68, height * 0.14, width * 0.28, height * 0.6, -width * 0.18, height * 0.5);

    ctx.bezierCurveTo(-width * 0.58, height * 0.38, -width * 0.68, height * 0.12, -width * 0.48, -height * 0.1);

    ctx.closePath();

    return;
  }

  if (shape === "sloper") {
    ctx.moveTo(-width * 0.5, 0);

    ctx.bezierCurveTo(-width * 0.46, -height * 0.46, width * 0.3, -height * 0.58, width * 0.52, -height * 0.05);

    ctx.bezierCurveTo(width * 0.56, height * 0.32, width * 0.1, height * 0.5, -width * 0.32, height * 0.38);

    ctx.closePath();

    return;
  }

  ctx.moveTo(-width * 0.57, -height * 0.1);

  ctx.lineTo(-width * 0.36, -height * 0.53);

  ctx.lineTo(-width * 0.05, -height * 0.65);

  ctx.lineTo(width * 0.18, -height * 0.48);

  ctx.lineTo(width * 0.52, -height * 0.38);

  ctx.lineTo(width * 0.62, height * 0.04);

  ctx.lineTo(width * 0.39, height * 0.47);

  ctx.lineTo(width * 0.02, height * 0.58);

  ctx.lineTo(-width * 0.45, height * 0.38);

  ctx.closePath();
}

function drawGripSideLine(side, width, height, active) {
  ctx.save();

  ctx.lineCap = "round";

  ctx.lineWidth = active ? Math.max(2.2, Math.min(width, height) * 0.1) : Math.max(2, Math.min(width, height) * 0.075);

  ctx.strokeStyle = active ? "rgba(255,255,255,.72)" : "rgba(5,10,18,.62)";

  ctx.setLineDash(active ? [4, 3, 1.5, 3] : []);

  ctx.beginPath();

  if (side === "top") {
    ctx.moveTo(-width * 0.28, -height * 0.47);

    ctx.lineTo(width * 0.28, -height * 0.47);
  } else if (side === "bottom") {
    ctx.moveTo(-width * 0.28, height * 0.46);

    ctx.lineTo(width * 0.28, height * 0.46);
  } else if (side === "left") {
    ctx.moveTo(-width * 0.49, -height * 0.2);

    ctx.lineTo(-width * 0.49, height * 0.2);
  } else {
    ctx.moveTo(width * 0.49, -height * 0.2);

    ctx.lineTo(width * 0.49, height * 0.2);
  }

  ctx.stroke();

  ctx.restore();
}

/* =====================================================
   SLOPER METER
===================================================== */

function drawSloperMeter(hold, p) {
  if (hold.type !== "sloper") {
    return;
  }

  const attached = Object.entries(limbs).filter(([, limb]) => limb.kind === "hand" && limb.grip === hold.id);

  if (!attached.length) {
    return;
  }

  const weakest = attached
    .map(([key, limb]) => ({
      key,
      limb,

      remaining: limb.sloperEnergy * getSloperHangLimit(key, hold),
    }))
    .sort((a, b) => a.remaining - b.remaining)[0];

  const energy = weakest.limb.sloperEnergy;

  const remaining = Math.max(0, weakest.remaining);

  const width = 46 * body.scale;

  const height = 5 * body.scale;

  const x = p.x - width / 2;

  const y = p.y - p.r - 18 * body.scale;

  ctx.fillStyle = "rgba(0,0,0,.58)";

  ctx.fillRect(x, y, width, height);

  ctx.fillStyle = energy > 0.55 ? "#bef264" : energy > 0.25 ? "#facc15" : "#fb7185";

  ctx.fillRect(x, y, width * energy, height);

  ctx.strokeStyle = "rgba(255,255,255,.35)";

  ctx.lineWidth = 1;

  ctx.strokeRect(x, y, width, height);

  ctx.fillStyle = "rgba(255,255,255,.78)";

  ctx.font = `800 ${Math.max(8, 9 * body.scale)}px system-ui`;

  ctx.textAlign = "center";

  ctx.fillText(`${remaining.toFixed(1)}s`, p.x, y - 4 * body.scale);
}

/* =====================================================
   BACKGROUND / HOLDS
===================================================== */

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, state.worldHeight);

  gradient.addColorStop(0, "#182433");

  gradient.addColorStop(1, "#0b111b");

  ctx.fillStyle = gradient;

  ctx.fillRect(0, 0, state.width, state.worldHeight);

  ctx.globalAlpha = 0.045;

  ctx.strokeStyle = "#fff";

  for (let y = 30; y < state.worldHeight; y += 54) {
    ctx.beginPath();

    ctx.moveTo(0, y);

    ctx.lineTo(state.width, y + Math.sin(y * 0.04) * 6);

    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

function drawHold(hold) {
  const p = getHoldGeometry(hold);

  const hovered = state.hoveredHold?.id === hold.id;

  const valid = state.selectedLimb ? validHoldForLimb(hold, state.selectedLimb) : false;

  ctx.save();

  ctx.translate(p.x, p.y);

  ctx.rotate(hold.angle || 0);

  if (hovered) {
    ctx.shadowColor = "#fff";

    ctx.shadowBlur = 24;
  } else if (valid) {
    ctx.shadowColor = "rgba(255,255,255,.15)";

    ctx.shadowBlur = 9;
  } else {
    ctx.shadowColor = "rgba(0,0,0,.5)";

    ctx.shadowBlur = 7;
  }

  ctx.save();

  ctx.translate(2 * body.scale, 4 * body.scale);

  ctx.fillStyle = "rgba(0,0,0,.45)";

  traceHoldShape(hold, p.width, p.height);

  ctx.fill();

  ctx.restore();

  ctx.fillStyle = hold.color;

  traceHoldShape(hold, p.width, p.height);

  ctx.fill();

  ctx.shadowBlur = 0;

  ctx.strokeStyle = "rgba(0,0,0,.38)";

  ctx.lineWidth = Math.max(2, p.r * 0.1);

  traceHoldShape(hold, p.width, p.height);

  ctx.stroke();

  for (const side of ["top", "right", "bottom", "left"]) {
    drawGripSideLine(side, p.width, p.height, !!hold.gripSides?.[side]);
  }

  if (hovered && state.hoveredGripSide) {
    drawGripSideLine(state.hoveredGripSide, p.width, p.height, true);
  }

  ctx.restore();

  drawSloperMeter(hold, p);

  if (hold.type === "top") {
    ctx.fillStyle = "rgba(255,255,255,.8)";

    ctx.textAlign = "center";

    ctx.font = `800 ${11 * body.scale}px system-ui`;

    ctx.fillText("TOP", p.x, p.y - p.r - 12);
  }
}

/* =====================================================
   BODY DRAW
===================================================== */

function drawLimb(root, target, a, b, bend, color, width) {
  const solved = solveTwoBone(root, target, a, b, bend);

  ctx.strokeStyle = color;

  ctx.lineWidth = width;

  ctx.lineCap = "round";

  ctx.lineJoin = "round";

  ctx.beginPath();

  ctx.moveTo(root.x, root.y);

  ctx.lineTo(solved.joint.x, solved.joint.y);

  ctx.lineTo(target.x, target.y);

  ctx.stroke();
}

function drawReach() {
  if (!state.selectedLimb) {
    return;
  }

  const root = rootForLimb(state.selectedLimb);

  const radius = maxReach(state.selectedLimb);

  const stretch = getReachStretch();

  ctx.save();

  ctx.setLineDash([7, 8]);

  ctx.strokeStyle = `rgba(255,255,255,${0.16 + stretch * 0.2})`;

  ctx.lineWidth = 2;

  ctx.beginPath();

  ctx.arc(root.x, root.y, radius, 0, Math.PI * 2);

  ctx.stroke();

  ctx.restore();
}

function drawCenterOfMass() {
  ctx.save();

  ctx.shadowColor = "#facc15";

  ctx.shadowBlur = 8;

  ctx.fillStyle = "#facc15";

  ctx.beginPath();

  ctx.arc(body.pelvis.x, body.pelvis.y, 3.6 * body.scale, 0, Math.PI * 2);

  ctx.fill();

  ctx.restore();
}

/* =====================================================
   MOBILE ENDPOINT CONTROLS
===================================================== */

function isCoarsePointer() {
  return window.matchMedia?.("(pointer: coarse)")?.matches || navigator.maxTouchPoints > 0;
}

function getLimbTouchRadius(limbKey) {
  const limb = limbs[limbKey];

  if (isCoarsePointer()) {
    return limb.kind === "hand" ? 54 : 52;
  }

  return limb.kind === "hand" ? 36 : 34;
}

function getLimbMarkerColor(limbKey) {
  return limbs[limbKey].side === "left" ? "#38bdf8" : "#fb923c";
}

function drawSelectionPulse(limbKey, point) {
  if (state.selectedLimb !== limbKey) {
    return;
  }

  const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.012);

  const radius = (limbs[limbKey].kind === "hand" ? 17 : 18) + pulse * 4;

  ctx.save();

  ctx.strokeStyle = `rgba(255,255,255,${0.38 + pulse * 0.34})`;

  ctx.lineWidth = 2.2;

  ctx.shadowColor = "#ffffff";

  ctx.shadowBlur = 12;

  ctx.beginPath();

  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);

  ctx.stroke();

  ctx.restore();
}

function drawHandMarker(limbKey, point) {
  const selected = state.selectedLimb === limbKey;

  const mobile = isCoarsePointer();

  const radius = mobile ? (selected ? 12 : 10) : (selected ? 10 : 8) * Math.max(body.scale, 0.82);

  drawSelectionPulse(limbKey, point);

  ctx.save();

  ctx.shadowColor = getLimbMarkerColor(limbKey);

  ctx.shadowBlur = selected ? 16 : 8;

  ctx.fillStyle = getLimbMarkerColor(limbKey);

  ctx.beginPath();

  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);

  ctx.fill();

  ctx.shadowBlur = 0;

  ctx.strokeStyle = "#08111f";

  ctx.lineWidth = mobile ? 3 : 2.4;

  ctx.stroke();

  ctx.fillStyle = "#ffffff";

  ctx.font = `900 ${mobile ? 9 : 8}px system-ui`;

  ctx.textAlign = "center";

  ctx.textBaseline = "middle";

  ctx.fillText(limbs[limbKey].side === "left" ? "L" : "R", point.x, point.y + 0.5);

  ctx.restore();
}

function drawFootMarker(limbKey, point) {
  const selected = state.selectedLimb === limbKey;

  const mobile = isCoarsePointer();

  const rx = mobile ? (selected ? 14 : 12) : (selected ? 12 : 10) * Math.max(body.scale, 0.82);

  const ry = mobile ? (selected ? 8.5 : 7) : (selected ? 7.5 : 6) * Math.max(body.scale, 0.82);

  drawSelectionPulse(limbKey, point);

  ctx.save();

  ctx.shadowColor = getLimbMarkerColor(limbKey);

  ctx.shadowBlur = selected ? 16 : 8;

  ctx.fillStyle = getLimbMarkerColor(limbKey);

  ctx.beginPath();

  ctx.ellipse(point.x, point.y, rx, ry, 0, 0, Math.PI * 2);

  ctx.fill();

  ctx.shadowBlur = 0;

  ctx.strokeStyle = "#08111f";

  ctx.lineWidth = mobile ? 3 : 2.4;

  ctx.stroke();

  ctx.fillStyle = "#ffffff";

  ctx.font = `900 ${mobile ? 9 : 8}px system-ui`;

  ctx.textAlign = "center";

  ctx.textBaseline = "middle";

  ctx.fillText(limbs[limbKey].side === "left" ? "L" : "R", point.x, point.y + 0.5);

  ctx.restore();
}

/* =====================================================
   SKELETON DRAW HELPERS
===================================================== */

const SKELETON_BONE = "#f2eee4";

const SKELETON_SHADOW = "rgba(4,7,7,.72)";

function drawSkeletonBone(from, to, width = 4) {
  ctx.save();

  ctx.strokeStyle = SKELETON_SHADOW;

  ctx.lineWidth = width + 3 * body.scale;

  ctx.lineCap = "round";

  ctx.beginPath();

  ctx.moveTo(from.x, from.y);

  ctx.lineTo(to.x, to.y);

  ctx.stroke();

  ctx.strokeStyle = SKELETON_BONE;

  ctx.lineWidth = width;

  ctx.beginPath();

  ctx.moveTo(from.x, from.y);

  ctx.lineTo(to.x, to.y);

  ctx.stroke();

  ctx.restore();
}

function drawSkeletonJoint(point, radius = 4) {
  ctx.save();

  ctx.fillStyle = SKELETON_SHADOW;

  ctx.beginPath();

  ctx.arc(point.x, point.y, radius + 2 * body.scale, 0, Math.PI * 2);

  ctx.fill();

  ctx.fillStyle = SKELETON_BONE;

  ctx.beginPath();

  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);

  ctx.fill();

  ctx.restore();
}

/* =====================================================
   SKELETON LIMB
===================================================== */

function drawSkeletonLimb(root, target, upperLength, lowerLength, bend, upperWidth, lowerWidth) {
  const solved = solveTwoBone(root, target, upperLength, lowerLength, bend);

  const joint = solved.joint;

  drawSkeletonBone(root, joint, upperWidth);

  drawSkeletonBone(joint, target, lowerWidth);

  drawSkeletonJoint(joint, 3.8 * body.scale);

  return joint;
}

/* =====================================================
   TORSO / RIBS / SKULL
===================================================== */

function drawSkeletonTorso() {
  const s = body.scale;

  ctx.save();
  ctx.translate(body.pelvis.x, body.pelvis.y);
  ctx.rotate(body.angle);

  const shoulderY = -body.torsoLength;

  /* ===================================================
     SPINE
  =================================================== */
  ctx.lineCap = "round";

  ctx.strokeStyle = SKELETON_SHADOW;
  ctx.lineWidth = 7 * s;
  ctx.beginPath();
  ctx.moveTo(0, -7 * s);
  ctx.lineTo(0, -body.torsoLength + 4 * s);
  ctx.stroke();

  ctx.strokeStyle = SKELETON_BONE;
  ctx.lineWidth = 3.2 * s;
  ctx.beginPath();
  ctx.moveTo(0, -7 * s);
  ctx.lineTo(0, -body.torsoLength + 4 * s);
  ctx.stroke();

  /* ===================================================
     CLAVICLES
  =================================================== */
  ctx.strokeStyle = SKELETON_BONE;
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.moveTo(-2 * s, shoulderY + 4 * s);
  ctx.lineTo(-body.shoulderWidth / 2, shoulderY);

  ctx.moveTo(2 * s, shoulderY + 4 * s);
  ctx.lineTo(body.shoulderWidth / 2, shoulderY);
  ctx.stroke();

  /* ===================================================
     RIBCAGE
  =================================================== */
  const chestTopY = shoulderY + 13 * s;
  const ribSpacing = 8.3 * s;

  const ribWidths = [body.shoulderWidth * 0.36, body.shoulderWidth * 0.43, body.shoulderWidth * 0.46, body.shoulderWidth * 0.43, body.shoulderWidth * 0.36, body.shoulderWidth * 0.27];

  ctx.strokeStyle = SKELETON_BONE;
  ctx.lineWidth = 2.15 * s;

  // Sternum
  ctx.beginPath();
  ctx.moveTo(0, chestTopY - 5 * s);
  ctx.lineTo(0, chestTopY + ribSpacing * 4.9);
  ctx.stroke();

  // Ribs
  for (let i = 0; i < ribWidths.length; i++) {
    const y = chestTopY + i * ribSpacing;
    const width = ribWidths[i];
    const drop = (5 + i * 1.6) * s;

    // left rib
    ctx.beginPath();
    ctx.moveTo(-1.5 * s, y);
    ctx.bezierCurveTo(-width * 0.28, y - 2 * s, -width * 0.88, y + drop * 0.18, -width, y + drop);
    ctx.bezierCurveTo(-width * 0.92, y + drop + 3 * s, -width * 0.65, y + drop + 5 * s, -width * 0.48, y + drop + 4 * s);
    ctx.stroke();

    // right rib
    ctx.beginPath();
    ctx.moveTo(1.5 * s, y);
    ctx.bezierCurveTo(width * 0.28, y - 2 * s, width * 0.88, y + drop * 0.18, width, y + drop);
    ctx.bezierCurveTo(width * 0.92, y + drop + 3 * s, width * 0.65, y + drop + 5 * s, width * 0.48, y + drop + 4 * s);
    ctx.stroke();
  }

  // Small chest bone fill
  ctx.fillStyle = SKELETON_BONE;
  ctx.beginPath();
  ctx.moveTo(-3 * s, chestTopY - 1 * s);
  ctx.lineTo(3 * s, chestTopY - 1 * s);
  ctx.lineTo(2 * s, chestTopY + 30 * s);
  ctx.lineTo(0, chestTopY + 35 * s);
  ctx.lineTo(-2 * s, chestTopY + 30 * s);
  ctx.closePath();
  ctx.fill();

  /* ===================================================
     PELVIS
  =================================================== */
  ctx.strokeStyle = SKELETON_SHADOW;
  ctx.lineWidth = 6 * s;
  ctx.beginPath();
  ctx.moveTo(-body.hipWidth * 0.47, -7 * s);
  ctx.bezierCurveTo(-body.hipWidth * 0.62, -1 * s, -body.hipWidth * 0.52, 11 * s, -9 * s, 12 * s);
  ctx.lineTo(0, 5 * s);
  ctx.lineTo(9 * s, 12 * s);
  ctx.bezierCurveTo(body.hipWidth * 0.52, 11 * s, body.hipWidth * 0.62, -1 * s, body.hipWidth * 0.47, -7 * s);
  ctx.stroke();

  ctx.strokeStyle = SKELETON_BONE;
  ctx.lineWidth = 2.8 * s;
  ctx.stroke();

  /* ===================================================
     NECK
  =================================================== */
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.moveTo(-4 * s, shoulderY - 1 * s);
  ctx.lineTo(-3 * s, shoulderY - 11 * s);

  ctx.moveTo(4 * s, shoulderY - 1 * s);
  ctx.lineTo(3 * s, shoulderY - 11 * s);
  ctx.stroke();

  /* ===================================================
     SKULL - bigger, less beak
  =================================================== */
  const headY = shoulderY - 29 * s;

  // shadow silhouette
  ctx.fillStyle = SKELETON_SHADOW;
  ctx.beginPath();
  ctx.moveTo(-14 * s, headY - 10 * s);
  ctx.bezierCurveTo(-18 * s, headY - 2 * s, -16 * s, headY + 10 * s, -10 * s, headY + 14 * s);
  ctx.lineTo(-5 * s, headY + 16 * s);
  ctx.lineTo(0, headY + 15 * s);
  ctx.lineTo(5 * s, headY + 16 * s);
  ctx.lineTo(10 * s, headY + 14 * s);
  ctx.bezierCurveTo(16 * s, headY + 10 * s, 18 * s, headY - 2 * s, 14 * s, headY - 10 * s);
  ctx.bezierCurveTo(12 * s, headY - 17 * s, 6 * s, headY - 20 * s, 0, headY - 20 * s);
  ctx.bezierCurveTo(-6 * s, headY - 20 * s, -12 * s, headY - 17 * s, -14 * s, headY - 10 * s);
  ctx.closePath();
  ctx.fill();

  // actual skull
  ctx.fillStyle = SKELETON_BONE;
  ctx.beginPath();
  ctx.moveTo(-13 * s, headY - 10 * s);
  ctx.bezierCurveTo(-16 * s, headY - 2 * s, -14 * s, headY + 8 * s, -9 * s, headY + 12 * s);
  ctx.lineTo(-4 * s, headY + 14 * s);
  ctx.lineTo(0, headY + 12.5 * s);
  ctx.lineTo(4 * s, headY + 14 * s);
  ctx.lineTo(9 * s, headY + 12 * s);
  ctx.bezierCurveTo(14 * s, headY + 8 * s, 16 * s, headY - 2 * s, 13 * s, headY - 10 * s);
  ctx.bezierCurveTo(11 * s, headY - 16 * s, 6 * s, headY - 19 * s, 0, headY - 19 * s);
  ctx.bezierCurveTo(-6 * s, headY - 19 * s, -11 * s, headY - 16 * s, -13 * s, headY - 10 * s);
  ctx.closePath();
  ctx.fill();

  // jaw
  ctx.beginPath();
  ctx.moveTo(-8 * s, headY + 10 * s);
  ctx.lineTo(-5 * s, headY + 16 * s);
  ctx.lineTo(0, headY + 18 * s);
  ctx.lineTo(5 * s, headY + 16 * s);
  ctx.lineTo(8 * s, headY + 10 * s);
  ctx.lineTo(5 * s, headY + 14 * s);
  ctx.lineTo(0, headY + 15 * s);
  ctx.lineTo(-5 * s, headY + 14 * s);
  ctx.closePath();
  ctx.fill();

  /* ===================================================
     EYE SOCKETS
  =================================================== */
  ctx.fillStyle = "#101313";

  ctx.beginPath();
  ctx.moveTo(-9 * s, headY - 5 * s);
  ctx.lineTo(-2 * s, headY - 2 * s);
  ctx.lineTo(-3 * s, headY + 5 * s);
  ctx.bezierCurveTo(-8 * s, headY + 5 * s, -11 * s, headY + 1 * s, -9 * s, headY - 5 * s);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(2 * s, headY - 2 * s);
  ctx.lineTo(9 * s, headY - 5 * s);
  ctx.bezierCurveTo(11 * s, headY + 1 * s, 8 * s, headY + 5 * s, 3 * s, headY + 5 * s);
  ctx.closePath();
  ctx.fill();

  /* ===================================================
     NOSE HOLE
  =================================================== */
  ctx.beginPath();
  ctx.moveTo(0, headY + 2 * s);
  ctx.lineTo(-2.7 * s, headY + 8 * s);
  ctx.lineTo(2.7 * s, headY + 8 * s);
  ctx.closePath();
  ctx.fill();

  /* ===================================================
     TEETH
  =================================================== */
  ctx.strokeStyle = "#101313";
  ctx.lineWidth = 1.1 * s;

  ctx.beginPath();
  ctx.moveTo(-5.5 * s, headY + 13.2 * s);
  ctx.lineTo(5.5 * s, headY + 13.2 * s);
  ctx.stroke();

  for (let i = -4; i <= 4; i += 2) {
    ctx.beginPath();
    ctx.moveTo(i * s, headY + 11.8 * s);
    ctx.lineTo(i * s, headY + 15.2 * s);
    ctx.stroke();
  }

  /* ===================================================
     BROW RIDGES
  =================================================== */
  ctx.strokeStyle = "#101313";
  ctx.lineWidth = 2.4 * s;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-11 * s, headY - 7 * s);
  ctx.lineTo(-2 * s, headY - 3 * s);

  ctx.moveTo(11 * s, headY - 7 * s);
  ctx.lineTo(2 * s, headY - 3 * s);
  ctx.stroke();

  ctx.restore();
}
/* =====================================================
   CLIMBER HAT DRAW
===================================================== */

function drawClimberHat() {
  if (!climberHat.initialized) {
    return;
  }

  const s = body.scale;

  ctx.save();
  ctx.translate(climberHat.x, climberHat.y);
  ctx.rotate(climberHat.angle);

  ctx.shadowColor = "rgba(0,0,0,.5)";
  ctx.shadowBlur = 6 * s;

  // brim
  ctx.fillStyle = "#0b0e0e";
  ctx.beginPath();
  ctx.ellipse(0, 0, 14 * s, 4.2 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // crown
  ctx.beginPath();
  ctx.moveTo(-7.8 * s, -1.6 * s);
  ctx.lineTo(-6.6 * s, -16.5 * s);
  ctx.quadraticCurveTo(0, -19.2 * s, 6.7 * s, -15.8 * s);
  ctx.lineTo(7.8 * s, -1.6 * s);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;

  // lime band
  ctx.fillStyle = "#d9ef72";
  ctx.beginPath();
  ctx.roundRect(-6.9 * s, -6.9 * s, 13.8 * s, 2.8 * s, 1.3 * s);
  ctx.fill();

  // highlight
  ctx.strokeStyle = "rgba(244,240,231,.34)";
  ctx.lineWidth = 1 * s;
  ctx.beginPath();
  ctx.moveTo(-5.8 * s, -14.5 * s);
  ctx.lineTo(-6.2 * s, -4.1 * s);
  ctx.stroke();

  ctx.restore();
}

/* =====================================================
   NEW BODY DRAW
===================================================== */

function drawBody() {
  const shoulders = shoulderPoints();

  const hips = hipPoints();

  const leftHand = visualEndpointForLimb("leftHand");

  const rightHand = visualEndpointForLimb("rightHand");

  const leftFoot = visualEndpointForLimb("leftFoot");

  const rightFoot = visualEndpointForLimb("rightFoot");

  drawReach();

  drawSkeletonLimb(hips.left, leftFoot, body.thigh, body.shin, -1, 5.7 * body.scale, 4.6 * body.scale);

  drawSkeletonLimb(hips.right, rightFoot, body.thigh, body.shin, 1, 5.7 * body.scale, 4.6 * body.scale);

  drawSkeletonLimb(shoulders.left, leftHand, body.upperArm, body.foreArm, -1, 4.8 * body.scale, 3.8 * body.scale);

  drawSkeletonLimb(shoulders.right, rightHand, body.upperArm, body.foreArm, 1, 4.8 * body.scale, 3.8 * body.scale);

  drawSkeletonTorso();

  drawClimberHat();

  drawHandMarker("leftHand", leftHand);

  drawHandMarker("rightHand", rightHand);

  drawFootMarker("leftFoot", leftFoot);

  drawFootMarker("rightFoot", rightFoot);

  drawCenterOfMass();
}

/* =====================================================
   RENDER
===================================================== */

function render() {
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

  ctx.clearRect(0, 0, state.width, state.height);

  ctx.save();

  ctx.translate(0, -state.cameraY);

  drawBackground();

  holds.forEach(drawHold);

  drawBody();

  ctx.restore();
}

/* =====================================================
   LOOP
===================================================== */

function frame(now) {
  const dt = Math.min((now - state.lastTime) / 1000, 1 / 60);

  state.lastTime = now;

  if (state.status === "playing") {
    state.elapsedMs = now - state.startedAt;

    updatePhysics(dt);

    updateHUD();
  }

  updateClimberHat(dt);

  if (state.falling) {
    state.fallTimer += dt;

    if (state.fallTimer > 0.7) {
      respawnAfterFall();
    }
  }

  render();

  requestAnimationFrame(frame);
}

/* =====================================================
   POINTER / AUTO SWAP
===================================================== */

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,

    y: event.clientY - rect.top + state.cameraY,
  };
}

function nearestLimb(point) {
  let best = null;

  let bestScore = Infinity;

  for (const limbKey of Object.keys(limbs)) {
    const endpoint = visualEndpointForLimb(limbKey);

    const d = dist(point, endpoint);

    const radius = getLimbTouchRadius(limbKey);

    if (d > radius) {
      continue;
    }

    const score = d / radius;

    if (score < bestScore) {
      bestScore = score;

      best = limbKey;
    }
  }

  return best;
}

function pointerDown(event) {
  if (state.status !== "playing" || state.falling || state.topped) {
    return;
  }

  const pointer = canvasPoint(event);

  const limbKey = nearestLimb(pointer);

  if (!limbKey) {
    return;
  }

  const limb = limbs[limbKey];

  state.selectedLimb = limbKey;

  state.originalGrip = limb.grip;

  state.originalGripSide = limb.gripSide;

  state.hoveredHold = null;

  state.hoveredGripSide = null;

  const current = visualEndpointForLimb(limbKey);

  limb.free.x = current.x;

  limb.free.y = current.y;

  limb.free.vx = 0;

  limb.free.vy = 0;

  limb.grip = null;

  limb.gripSide = null;

  state.lastDragX = current.x;

  state.lastDragY = current.y;

  state.lastDragTime = event.timeStamp || performance.now();

  state.dragVX = 0;

  state.dragVY = 0;

  canvas.setPointerCapture(event.pointerId);

  hintEl.innerHTML = `Flytter <strong>${limb.label}</strong>`;

  pointerMove(event);
}

function pointerMove(event) {
  if (!state.selectedLimb || state.status !== "playing") {
    return;
  }

  const limbKey = state.selectedLimb;

  const limb = limbs[limbKey];

  const pointer = canvasPoint(event);

  const root = rootForLimb(limbKey);

  let reach = maxReach(limbKey) * 0.985;

  if (limb.kind === "hand") {
    const speed = Math.hypot(body.pelvis.vx, body.pelvis.vy);

    reach += clamp(speed * 0.018, 0, 15 * body.scale);
  }

  let dx = pointer.x - root.x;

  let dy = pointer.y - root.y;

  const length = Math.hypot(dx, dy) || 1;

  if (length > reach) {
    dx = (dx / length) * reach;

    dy = (dy / length) * reach;
  }

  const newX = root.x + dx;

  const newY = root.y + dy;

  const now = event.timeStamp || performance.now();

  const dragDt = clamp((now - state.lastDragTime) / 1000, 0.008, 0.06);

  const instantVX = (newX - state.lastDragX) / dragDt;

  const instantVY = (newY - state.lastDragY) / dragDt;

  state.dragVX = state.dragVX * 0.55 + instantVX * 0.45;

  state.dragVY = state.dragVY * 0.55 + instantVY * 0.45;

  state.lastDragX = newX;

  state.lastDragY = newY;

  state.lastDragTime = now;

  limb.free.x = newX;

  limb.free.y = newY;

  limb.free.vx = 0;

  limb.free.vy = 0;

  state.hoveredHold = null;

  state.hoveredGripSide = null;

  let bestCandidate = null;

  for (const hold of holds) {
    const candidate = findBestGripCandidate(hold, limbKey, limb.free);

    if (!candidate) {
      continue;
    }

    if (!bestCandidate || candidate.distance < bestCandidate.distance) {
      bestCandidate = candidate;
    }
  }

  if (bestCandidate) {
    state.hoveredHold = bestCandidate.hold;

    state.hoveredGripSide = bestCandidate.side;
  }
}

function pointerUp(event) {
  if (!state.selectedLimb) {
    return;
  }

  const limbKey = state.selectedLimb;

  const limb = limbs[limbKey];

  const hold = state.hoveredHold;

  const side = state.hoveredGripSide;

  if (hold && side) {
    const swappedKey = performAutoSwapIfNeeded(hold, limbKey);

    attachLimb(limbKey, hold.id, false, side);

    if (hold.id !== state.originalGrip) {
      state.moves++;

      updateHUD();
    }

    if (swappedKey) {
      const swapped = limbs[swappedKey];

      hintEl.innerHTML = `<strong>AUTO-SWAP 🔁</strong> ${limb.label} overtog fra ${swapped.label}`;
    } else if (hold.type === "sloper" && limb.kind === "hand") {
      hintEl.innerHTML = `<strong>SLOPER!</strong> ca. ${getSloperHangLimit(limbKey, hold).toFixed(1)}s med din nuværende støtte`;
    } else {
      hintEl.innerHTML = limb.kind === "hand" ? `<strong>${limb.label}</strong> — PULL 🧗` : `<strong>${limb.label}</strong> — PUSH 🦵`;
    }
  } else {
    limb.grip = null;

    limb.gripSide = null;

    hintEl.innerHTML = `<strong>${limb.label}</strong> er fri.`;
  }

  state.selectedLimb = null;

  state.originalGrip = null;

  state.originalGripSide = null;

  state.hoveredHold = null;

  state.hoveredGripSide = null;

  state.dragVX = 0;

  state.dragVY = 0;

  try {
    if (event?.pointerId != null && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  } catch {}

  checkTop();
}

/* =====================================================
   SHARE / EVENTS / INIT
===================================================== */

async function shareResult() {
  const title = ONLINE_SCORE_ACTIVE ? currentLevel.name : IS_CUSTOM_MODE ? currentLevel.name : `Daily Climb #${DAILY_NUMBER}`;

  const text = `${title} 🧗

🖐 ${state.moves} moves
💥 ${state.falls} falls
⏱ ${formatTime(state.elapsedMs)}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: "Daily Climb",

        text,
      });

      return;
    } catch {}
  }

  try {
    await navigator.clipboard.writeText(text);

    shareBtn.textContent = "KOPIERET ✓";

    setTimeout(() => {
      shareBtn.textContent = "DEL RESULTAT";
    }, 1500);
  } catch {}
}

canvas.addEventListener("pointerdown", pointerDown);

canvas.addEventListener("pointermove", pointerMove);

canvas.addEventListener("pointerup", pointerUp);

canvas.addEventListener("pointercancel", pointerUp);

playBtn.addEventListener("click", startRun);

replayBtn.addEventListener("click", restartRun);

shareBtn.addEventListener("click", shareResult);

editRouteBtn.addEventListener("click", () => {
  window.location.href = "builder.html";
});

resetBtn.addEventListener("click", () => (state.status === "playing" ? startRun() : resetToMenu()));

window.addEventListener("resize", resize);

new ResizeObserver(resize).observe(canvas);

saveOnlineScoreBtn?.addEventListener("click", saveOnlineScoreAndShowLeaderboard);

scoreNameInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();

    saveOnlineScoreAndShowLeaderboard();
  }
});

function init() {
  updateStartScreen();

  resize();

  updateHUD();

  requestAnimationFrame(frame);
}

init();
