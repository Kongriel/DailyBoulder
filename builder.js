const canvas = document.getElementById("builderCanvas");
const ctx = canvas.getContext("2d");

const routeNameInput = document.getElementById("routeName");
const selectedEditor = document.getElementById("selectedEditor");
const holdTypeInput = document.getElementById("holdType");
const holdShapeInput = document.getElementById("holdShape");
const angleSlider = document.getElementById("angleSlider");
const angleValue = document.getElementById("angleValue");
const sizeSlider = document.getElementById("sizeSlider");
const sizeValue = document.getElementById("sizeValue");
const capacityHandsEl = document.getElementById("capacityHands");
const capacityFeetEl = document.getElementById("capacityFeet");
const colorPicker = document.getElementById("colorPicker");
const deleteBtn = document.getElementById("deleteBtn");
const topBtn = document.getElementById("topBtn");
const testBtn = document.getElementById("testBtn");
const saveRouteBtn = document.getElementById("saveRouteBtn");
const newRouteBtn = document.getElementById("newRouteBtn");
const routeLibraryEl = document.getElementById("routeLibrary");
const messageEl = document.getElementById("builderMessage");
const statusLH = document.getElementById("statusLH");
const statusRH = document.getElementById("statusRH");
const statusLF = document.getElementById("statusLF");
const statusRF = document.getElementById("statusRF");
const statusTop = document.getElementById("statusTop");

const CUSTOM_ROUTE_KEY = "daily-climb-custom-route";
const BUILDER_DRAFT_KEY = "daily-climb-builder-draft";
const ROUTE_LIBRARY_KEY = "daily-climb-route-library-v1";

/* =====================================================
   HELPERS / HOLD MODEL
===================================================== */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function defaultColorForType(type) {
  if (type === "foot") {
    return "#22c55e";
  }

  if (type === "sloper") {
    return "#8b5cf6";
  }

  if (type === "top") {
    return "#84cc16";
  }

  return "#ef4444";
}

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
   DEFAULT ROUTE / DRAFT
===================================================== */

const DEFAULT_ROUTE = {
  id: "custom-route",

  name: "Min Boulder",

  start: {
    leftHand: "start-lh",
    rightHand: "start-rh",
    leftFoot: "start-lf",
    rightFoot: "start-rf",
  },

  topId: "top",

  holds: [
    {
      id: "start-lf",
      x: 0.42,
      y: 0.88,
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
      id: "start-rf",
      x: 0.57,
      y: 0.88,
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
      id: "start-lh",
      x: 0.41,
      y: 0.64,
      r: 22,
      angle: -0.2,
      type: "jug",
      shape: "rock",
      gripSides: allSides(),
      color: "#ef4444",
    },

    {
      id: "start-rh",
      x: 0.58,
      y: 0.61,
      r: 22,
      angle: 0.2,
      type: "jug",
      shape: "rock",
      gripSides: allSides(),
      color: "#3b82f6",
    },

    {
      id: "top",
      x: 0.5,
      y: 0.13,
      r: 28,
      angle: 0,
      type: "top",
      shape: "blob",

      gripSides: {
        top: true,
        right: true,
        bottom: false,
        left: true,
      },

      color: "#84cc16",
    },
  ],
};

function loadBuilderDraft() {
  try {
    const raw = localStorage.getItem(BUILDER_DRAFT_KEY);

    if (!raw) {
      return null;
    }

    const data = JSON.parse(raw);

    if (!data || !Array.isArray(data.holds)) {
      return null;
    }

    return {
      ...data,

      holds: data.holds.map(normalizedHold),
    };
  } catch {
    return null;
  }
}

let route = loadBuilderDraft() || JSON.parse(JSON.stringify(DEFAULT_ROUTE));

route.start ||= JSON.parse(JSON.stringify(DEFAULT_ROUTE.start));

route.holds = route.holds.map(normalizedHold);

routeNameInput.value = route.name || "Min Boulder";

let holdCounter = 1;

for (const hold of route.holds) {
  const match = /^hold-(\d+)$/.exec(hold.id);

  if (match) {
    holdCounter = Math.max(holdCounter, Number(match[1]) + 1);
  }
}

function saveDraft() {
  route.name = routeNameInput.value.trim() || "Custom Boulder";

  localStorage.setItem(BUILDER_DRAFT_KEY, JSON.stringify(route));
}

/* =====================================================
   ROUTE LIBRARY
===================================================== */

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
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

function makeLibraryId() {
  return `route-` + `${Date.now().toString(36)}-` + `${Math.random().toString(36).slice(2, 7)}`;
}

function formatLibraryBest(best) {
  if (!best) {
    return "Ingen highscore endnu";
  }

  const total = Math.max(0, (best.timeMs || 0) / 1000);

  const min = Math.floor(total / 60);

  const sec = Math.floor(total % 60);

  const tenth = Math.floor((total % 1) * 10);

  const time = `${String(min).padStart(2, "0")}:` + `${String(sec).padStart(2, "0")}.` + `${tenth}`;

  return `🏆 ${best.moves} moves · ` + `${best.falls} falls · ` + time;
}

function resetHoldCounter() {
  holdCounter = 1;

  for (const hold of route.holds) {
    const match = /^hold-(\d+)$/.exec(hold.id);

    if (match) {
      holdCounter = Math.max(holdCounter, Number(match[1]) + 1);
    }
  }
}

function renderRouteLibrary() {
  const library = loadRouteLibrary()
    .slice()
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  routeLibraryEl.innerHTML = "";

  if (!library.length) {
    routeLibraryEl.innerHTML = `
        <div class="library-empty">
          Gem eller test din første bane — så dukker den op her med sin egen highscore.
        </div>
      `;

    return;
  }

  for (const entry of library) {
    const card = document.createElement("div");

    card.className = `route-card${entry.id === route.libraryId ? " current" : ""}`;

    const holdsCount = entry.route?.holds?.length || 0;

    card.innerHTML = `
      <div class="route-card-top">

        <div class="route-card-name"></div>

        <div class="route-card-count">
          ${holdsCount} greb
        </div>

      </div>

      <div class="route-card-best"></div>

      <div class="route-card-actions">

        <button
          class="library-edit"
          type="button"
        >
          REDIGER
        </button>

        <button
          class="library-play"
          type="button"
        >
          ▶ SPIL
        </button>

        <button
          class="library-delete"
          type="button"
        >
          ✕
        </button>

      </div>
    `;

    card.querySelector(".route-card-name").textContent = entry.name || "Uden navn";

    card.querySelector(".route-card-best").textContent = formatLibraryBest(entry.best);

    card.querySelector(".library-edit").addEventListener("click", () => loadLibraryRoute(entry.id));

    card.querySelector(".library-play").addEventListener("click", () => playLibraryRoute(entry.id));

    card.querySelector(".library-delete").addEventListener("click", () => deleteLibraryRoute(entry.id));

    routeLibraryEl.appendChild(card);
  }
}

function saveRouteToLibrary({ silent = false } = {}) {
  const error = validateRoute();

  if (error) {
    messageEl.className = "builder-message error";

    messageEl.textContent = error;

    return false;
  }

  route.name = routeNameInput.value.trim() || "Custom Boulder";

  route.libraryId ||= makeLibraryId();

  const library = loadRouteLibrary();

  const index = library.findIndex((item) => item.id === route.libraryId);

  const now = Date.now();

  const old = index >= 0 ? library[index] : null;

  const entry = {
    id: route.libraryId,

    name: route.name,

    createdAt: old?.createdAt || now,

    updatedAt: now,

    best: old?.best || null,

    route: cloneData(route),
  };

  entry.route.libraryId = route.libraryId;

  if (index >= 0) {
    library[index] = entry;
  } else {
    library.push(entry);
  }

  writeRouteLibrary(library);

  saveDraft();

  renderRouteLibrary();

  if (!silent) {
    messageEl.className = "builder-message success";

    messageEl.textContent = `💾 ${route.name} er gemt i dit bibliotek.`;
  }

  return true;
}

function loadLibraryRoute(id) {
  const entry = loadRouteLibrary().find((item) => item.id === id);

  if (!entry?.route) {
    return;
  }

  route = cloneData(entry.route);

  route.libraryId = entry.id;

  route.start ||= cloneData(DEFAULT_ROUTE.start);

  route.holds = (route.holds || []).map(normalizedHold);

  routeNameInput.value = route.name || entry.name || "Custom Boulder";

  state.selectedId = null;

  state.selectedIds.clear();

  selectedEditor.classList.add("hidden");

  resetHoldCounter();

  refreshAssignments();

  refreshDeleteButton();

  refreshSelectionInfo();

  saveDraft();

  renderRouteLibrary();

  draw();

  messageEl.className = "builder-message success";

  messageEl.textContent = `Redigerer: ${route.name}`;
}

function playLibraryRoute(id) {
  const entry = loadRouteLibrary().find((item) => item.id === id);

  if (!entry?.route) {
    return;
  }

  const playable = cloneData(entry.route);

  playable.libraryId = entry.id;

  localStorage.setItem(BUILDER_DRAFT_KEY, JSON.stringify(playable));

  localStorage.setItem(CUSTOM_ROUTE_KEY, JSON.stringify(playable));

  window.location.href = "index.html?custom=1";
}

function deleteLibraryRoute(id) {
  const library = loadRouteLibrary();

  const entry = library.find((item) => item.id === id);

  if (!entry) {
    return;
  }

  if (!window.confirm(`Slet “${entry.name || "denne bane"}” og dens highscore?`)) {
    return;
  }

  writeRouteLibrary(library.filter((item) => item.id !== id));

  if (route.libraryId === id) {
    delete route.libraryId;

    saveDraft();
  }

  renderRouteLibrary();

  messageEl.className = "builder-message";

  messageEl.textContent = "Banen blev slettet fra biblioteket.";
}

function createNewRoute() {
  route = cloneData(DEFAULT_ROUTE);

  delete route.libraryId;

  route.holds = route.holds.map(normalizedHold);

  routeNameInput.value = "Ny Boulder";

  route.name = "Ny Boulder";

  state.selectedId = null;

  state.selectedIds.clear();

  selectedEditor.classList.add("hidden");

  resetHoldCounter();

  refreshAssignments();

  refreshDeleteButton();

  refreshSelectionInfo();

  saveDraft();

  renderRouteLibrary();

  draw();

  messageEl.className = "builder-message success";

  messageEl.textContent = "Ny bane klar. Byg løs 🔥";
}

/* =====================================================
   STATE / BASIC
===================================================== */

const state = {
  width: 0,

  height: 0,

  dpr: Math.min(window.devicePixelRatio || 1, 2),

  /*
    Primary selected hold.
  */

  selectedId: null,

  /*
    Multiple selected holds.
  */

  selectedIds: new Set(),

  /*
    GROUP MOVE
  */

  dragging: false,

  dragStartPointer: null,

  dragStartPositions: null,

  /*
    ROTATE
  */

  rotating: false,

  rotationCenter: null,

  rotationPointerStart: 0,

  rotationStartAngles: null,

  /*
    RESIZE
  */

  resizing: false,

  resizeCenter: null,

  resizePointerStartDistance: 0,

  resizeStartSize: 0,
};

function getHold(id) {
  return route.holds.find((hold) => hold.id === id) || null;
}

function selectedHold() {
  return getHold(state.selectedId);
}

function getSelectedHolds() {
  return route.holds.filter((hold) => state.selectedIds.has(hold.id));
}

function normalizeAngle(angle) {
  while (angle > Math.PI) {
    angle -= Math.PI * 2;
  }

  while (angle < -Math.PI) {
    angle += Math.PI * 2;
  }

  return angle;
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,

    y: event.clientY - rect.top,
  };
}

function holdScreenPosition(hold) {
  return {
    x: hold.x * state.width,

    y: hold.y * state.height,
  };
}

function resize() {
  const rect = canvas.getBoundingClientRect();

  state.width = rect.width;

  state.height = rect.height;

  state.dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.max(1, Math.round(state.width * state.dpr));

  canvas.height = Math.max(1, Math.round(state.height * state.dpr));

  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

  draw();
}

/* =====================================================
   DRAW WALL / HOLD
===================================================== */

function drawWall() {
  const gradient = ctx.createLinearGradient(0, 0, 0, state.height);

  gradient.addColorStop(0, "#182433");

  gradient.addColorStop(1, "#0b111b");

  ctx.fillStyle = gradient;

  ctx.fillRect(0, 0, state.width, state.height);

  ctx.globalAlpha = 0.04;

  ctx.strokeStyle = "#fff";

  for (let y = 30; y < state.height; y += 54) {
    ctx.beginPath();

    ctx.moveTo(0, y);

    ctx.lineTo(state.width, y + Math.sin(y * 0.04) * 6);

    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

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

  ctx.lineWidth = active ? Math.max(2.4, Math.min(width, height) * 0.105) : Math.max(2, Math.min(width, height) * 0.075);

  ctx.strokeStyle = active ? "rgba(255,255,255,.78)" : "rgba(4,9,16,.68)";

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

function drawHoldLabels(hold, point) {
  const labels = [];

  if (route.start.leftHand === hold.id) {
    labels.push("LH");
  }

  if (route.start.rightHand === hold.id) {
    labels.push("RH");
  }

  if (route.start.leftFoot === hold.id) {
    labels.push("LF");
  }

  if (route.start.rightFoot === hold.id) {
    labels.push("RF");
  }

  if (route.topId === hold.id) {
    labels.push("TOP");
  }

  if (!labels.length) {
    return;
  }

  const text = labels.join(" · ");

  ctx.font = "800 10px system-ui";

  ctx.textAlign = "center";

  const width = ctx.measureText(text).width + 12;

  ctx.fillStyle = "rgba(5,10,18,.82)";

  ctx.beginPath();

  ctx.roundRect(
    point.x - width / 2,

    point.y - 38,

    width,

    20,

    8,
  );

  ctx.fill();

  ctx.fillStyle = "#fff";

  ctx.fillText(text, point.x, point.y - 24);
}

function drawHold(hold) {
  const p = holdScreenPosition(hold);

  const scale = clamp(
    Math.min(
      state.width / 500,

      state.height / 830,
    ),

    0.75,

    1,
  );

  const r = hold.r * scale;

  const selected = state.selectedIds.has(hold.id);

  const primary = state.selectedId === hold.id;

  let width = r * 2.15;

  let height = r * 1.45;

  if (hold.type === "foot") {
    width = r * 1.9;

    height = r * 0.85;
  }

  if (hold.shape === "edge") {
    height *= 0.72;
  }

  if (hold.shape === "sloper") {
    width *= 1.15;
  }

  ctx.save();

  ctx.translate(p.x, p.y);

  ctx.rotate(hold.angle || 0);

  ctx.shadowColor = primary ? "rgba(217,239,114,.95)" : selected ? "rgba(255,255,255,.90)" : "rgba(0,0,0,.5)";

  ctx.shadowBlur = primary ? 20 : selected ? 15 : 7;

  ctx.save();

  ctx.translate(2, 4);

  ctx.fillStyle = "rgba(0,0,0,.45)";

  traceHoldShape(hold, width, height);

  ctx.fill();

  ctx.restore();

  ctx.fillStyle = hold.color;

  traceHoldShape(hold, width, height);

  ctx.fill();

  ctx.shadowBlur = 0;

  ctx.strokeStyle = "rgba(0,0,0,.38)";

  ctx.lineWidth = Math.max(2, r * 0.1);

  traceHoldShape(hold, width, height);

  ctx.stroke();

  for (const side of ["top", "right", "bottom", "left"]) {
    drawGripSideLine(side, width, height, !!hold.gripSides?.[side]);
  }

  ctx.restore();

  drawHoldLabels(hold, p);
}

/* =====================================================
   ROTATE HANDLE
===================================================== */

function getRotationHandlePosition(hold) {
  if (!hold) {
    return null;
  }

  const center = holdScreenPosition(hold);

  const scale = clamp(
    Math.min(
      state.width / 500,

      state.height / 830,
    ),

    0.75,

    1,
  );

  const r = hold.r * scale;

  const distance = Math.max(42, r * 2);

  const angle = (hold.angle || 0) - Math.PI / 2;

  return {
    center,

    x: center.x + Math.cos(angle) * distance,

    y: center.y + Math.sin(angle) * distance,
  };
}

function drawRotationHandle() {
  const hold = selectedHold();

  if (!hold) {
    return;
  }

  const handle = getRotationHandlePosition(hold);

  if (!handle) {
    return;
  }

  ctx.save();

  ctx.beginPath();

  ctx.moveTo(handle.center.x, handle.center.y);

  ctx.lineTo(handle.x, handle.y);

  ctx.strokeStyle = "rgba(217,239,114,.48)";

  ctx.lineWidth = 1.5;

  ctx.setLineDash([3, 4]);

  ctx.stroke();

  ctx.setLineDash([]);

  /*
    Small lime rotation handle.
  */

  ctx.beginPath();

  ctx.arc(handle.x, handle.y, 7, 0, Math.PI * 2);

  ctx.fillStyle = "#d9ef72";

  ctx.fill();

  ctx.strokeStyle = "#090d0d";

  ctx.lineWidth = 2;

  ctx.stroke();

  ctx.beginPath();

  ctx.arc(handle.x, handle.y, 1.6, 0, Math.PI * 2);

  ctx.fillStyle = "#090d0d";

  ctx.fill();

  ctx.restore();
}

/* =====================================================
   SIZE HANDLE
===================================================== */

function getSizeHandlePosition(hold) {
  if (!hold) {
    return null;
  }

  const center = holdScreenPosition(hold);

  const scale = clamp(
    Math.min(
      state.width / 500,

      state.height / 830,
    ),

    0.75,

    1,
  );

  const distance = Math.max(38, (hold.r + 22) * scale);

  const angle = hold.angle || 0;

  return {
    center,

    x: center.x + Math.cos(angle) * distance,

    y: center.y + Math.sin(angle) * distance,
  };
}

function drawSizeHandle() {
  const hold = selectedHold();

  if (!hold) {
    return;
  }

  const handle = getSizeHandlePosition(hold);

  if (!handle) {
    return;
  }

  ctx.save();

  ctx.beginPath();

  ctx.moveTo(handle.center.x, handle.center.y);

  ctx.lineTo(handle.x, handle.y);

  ctx.strokeStyle = "rgba(247,244,236,.42)";

  ctx.lineWidth = 1.5;

  ctx.setLineDash([3, 4]);

  ctx.stroke();

  ctx.setLineDash([]);

  /*
    White diamond = size control.
  */

  ctx.translate(handle.x, handle.y);

  ctx.rotate(Math.PI / 4);

  ctx.fillStyle = "#f7f4ec";

  ctx.strokeStyle = "#090d0d";

  ctx.lineWidth = 2;

  ctx.beginPath();

  ctx.rect(-5, -5, 10, 10);

  ctx.fill();

  ctx.stroke();

  ctx.restore();
}

function draw() {
  drawWall();

  route.holds.forEach(drawHold);

  drawSizeHandle();

  drawRotationHandle();
}

/* =====================================================
   HIT TEST / EDITOR
===================================================== */

function findHoldAt(point) {
  let nearest = null;

  let nearestDistance = Infinity;

  for (let i = route.holds.length - 1; i >= 0; i--) {
    const hold = route.holds[i];

    const p = holdScreenPosition(hold);

    const d = Math.hypot(
      point.x - p.x,

      point.y - p.y,
    );

    const hitRadius = hold.r * 1.5 + 12;

    if (d < hitRadius && d < nearestDistance) {
      nearest = hold;

      nearestDistance = d;
    }
  }

  return nearest;
}

function rotationHandleHit(point) {
  const hold = selectedHold();

  if (!hold) {
    return false;
  }

  const handle = getRotationHandlePosition(hold);

  if (!handle) {
    return false;
  }

  return (
    Math.hypot(
      point.x - handle.x,

      point.y - handle.y,
    ) <= 13
  );
}

function sizeHandleHit(point) {
  const hold = selectedHold();

  if (!hold) {
    return false;
  }

  const handle = getSizeHandlePosition(hold);

  if (!handle) {
    return false;
  }

  return (
    Math.hypot(
      point.x - handle.x,

      point.y - handle.y,
    ) <= 14
  );
}

function refreshEditorLabels() {
  angleValue.textContent = `${angleSlider.value}°`;

  sizeValue.textContent = sizeSlider.value;
}

function refreshCapacity() {
  const hold = selectedHold();

  if (!hold) {
    capacityHandsEl.textContent = "—";

    capacityFeetEl.textContent = "—";

    return;
  }

  const capacity = getHoldCapacity(hold);

  capacityHandsEl.textContent = capacity.hands;

  capacityFeetEl.textContent = capacity.feet;
}

function refreshGripSideButtons() {
  const hold = selectedHold();

  document.querySelectorAll(".grip-side-btn").forEach((button) => {
    const side = button.dataset.gripSide;

    button.classList.toggle("active", !!hold?.gripSides?.[side]);
  });
}

function shortHoldName(id) {
  return id || "—";
}

function refreshAssignments() {
  statusLH.textContent = shortHoldName(route.start.leftHand);

  statusRH.textContent = shortHoldName(route.start.rightHand);

  statusLF.textContent = shortHoldName(route.start.leftFoot);

  statusRF.textContent = shortHoldName(route.start.rightFoot);

  statusTop.textContent = shortHoldName(route.topId);

  document.querySelectorAll(".assign-btn").forEach((button) => {
    const key = button.dataset.assignment;

    button.classList.toggle("active", route.start[key] === state.selectedId);
  });
}

/* =====================================================
   DELETE BUTTON
===================================================== */

function refreshDeleteButton() {
  if (!deleteBtn) {
    return;
  }

  const holds = getSelectedHolds();

  if (!holds.length) {
    deleteBtn.textContent = "🗑 SLET GREB";

    return;
  }

  if (holds.length > 1) {
    deleteBtn.textContent = `🗑 SLET ${holds.length} GREB`;

    return;
  }

  deleteBtn.textContent = holds[0].type === "foot" ? "🗑 SLET FODGREB" : "🗑 SLET GREB";
}

/* =====================================================
   SELECTION INFO
===================================================== */

function refreshSelectionInfo() {
  const info = document.getElementById("selectionInfo");

  if (!info) {
    return;
  }

  const count = state.selectedIds.size;

  if (count > 1) {
    info.classList.remove("hidden");

    info.textContent = `${count} GREB VALGT · TRÆK ET AF DEM FOR AT FLYTTE GRUPPEN`;
  } else {
    info.classList.add("hidden");

    info.textContent = "";
  }
}

/* =====================================================
   SELECT HOLD
===================================================== */

function selectHold(id, { toggle = false, keepGroup = false } = {}) {
  /*
    Click on empty wall:
    clear selection.
  */

  if (!id) {
    state.selectedId = null;

    state.selectedIds.clear();

    selectedEditor.classList.add("hidden");

    messageEl.className = "builder-message";

    messageEl.textContent = "Vælg et greb for at redigere det.";

    refreshAssignments();

    refreshDeleteButton();

    refreshSelectionInfo();

    draw();

    return;
  }

  /*
    Shift / Cmd / Ctrl click.
  */

  if (toggle) {
    if (state.selectedIds.has(id)) {
      state.selectedIds.delete(id);

      if (state.selectedId === id) {
        state.selectedId = Array.from(state.selectedIds).at(-1) || null;
      }
    } else {
      state.selectedIds.add(id);

      state.selectedId = id;
    }
  } else if (keepGroup && state.selectedIds.has(id)) {

  /*
    Click selected member
    without removing group.
  */
    state.selectedId = id;
  } else {

  /*
    Normal click:
    only one selected.
  */
    state.selectedIds.clear();

    state.selectedIds.add(id);

    state.selectedId = id;
  }

  const hold = selectedHold();

  if (!hold) {
    selectedEditor.classList.add("hidden");

    refreshAssignments();

    refreshDeleteButton();

    refreshSelectionInfo();

    draw();

    return;
  }

  selectedEditor.classList.remove("hidden");

  holdTypeInput.value = hold.type;

  holdShapeInput.value = hold.shape || defaultShapeForType(hold.type);

  angleSlider.value = Math.round(((hold.angle || 0) * 180) / Math.PI);

  sizeSlider.value = Math.round(hold.r);

  colorPicker.value = hold.color;

  refreshEditorLabels();

  refreshCapacity();

  refreshGripSideButtons();

  refreshAssignments();

  refreshDeleteButton();

  refreshSelectionInfo();

  if (state.selectedIds.size > 1) {
    messageEl.className = "builder-message success";

    messageEl.textContent = `${state.selectedIds.size} greb valgt · træk et af dem for at flytte hele gruppen.`;
  }

  draw();
}

/* =====================================================
   MODIFY ROUTE
===================================================== */

function addHold(type) {
  const id = `hold-${holdCounter++}`;

  const shape = defaultShapeForType(type);

  const hold = {
    id,

    x: 0.5 + (Math.random() - 0.5) * 0.12,

    y: 0.48 + (Math.random() - 0.5) * 0.1,

    r: type === "foot" ? 16 : 21,

    angle: 0,

    type,

    shape,

    gripSides: defaultGripSidesForHold(type, shape),

    color: defaultColorForType(type),
  };

  route.holds.push(hold);

  selectHold(id);

  saveDraft();

  messageEl.className = "builder-message success";

  messageEl.textContent = "Nyt greb tilføjet — træk det rundt og vælg de ru/gribbare sider.";
}

/* =====================================================
   DELETE SELECTED
===================================================== */

function deleteSelected() {
  const ids = new Set(state.selectedIds);

  if (!ids.size && state.selectedId) {
    ids.add(state.selectedId);
  }

  if (!ids.size) {
    return;
  }

  const count = ids.size;

  /*
    Remove holds.
  */

  route.holds = route.holds.filter((hold) => !ids.has(hold.id));

  /*
    Remove start assignments.
  */

  for (const key of Object.keys(route.start)) {
    if (ids.has(route.start[key])) {
      route.start[key] = null;
    }
  }

  /*
    Remove top assignment.
  */

  if (ids.has(route.topId)) {
    route.topId = null;
  }

  state.selectedId = null;

  state.selectedIds.clear();

  state.dragging = false;

  state.rotating = false;

  state.resizing = false;

  selectedEditor.classList.add("hidden");

  refreshAssignments();

  refreshDeleteButton();

  refreshSelectionInfo();

  saveDraft();

  messageEl.className = "builder-message";

  messageEl.textContent = count === 1 ? "Grebet blev slettet." : `${count} greb blev slettet.`;

  draw();
}

/* =====================================================
   START
===================================================== */

function assignStart(assignment) {
  const hold = selectedHold();

  if (!hold) {
    return;
  }

  const isFoot = assignment === "leftFoot" || assignment === "rightFoot";

  const isHand = !isFoot;

  if (isFoot && hold.type !== "foot") {
    messageEl.className = "builder-message error";

    messageEl.textContent = "Startfødder skal sættes på et foothold.";

    return;
  }

  if (isHand && hold.type === "foot") {
    messageEl.className = "builder-message error";

    messageEl.textContent = "Starthænder kan ikke sættes på et foothold.";

    return;
  }

  const capacity = getHoldCapacity(hold);

  const others = Object.entries(route.start).filter(([key, id]) => key !== assignment && id === hold.id);

  const otherHands = others.filter(([key]) => key === "leftHand" || key === "rightHand").length;

  const otherFeet = others.filter(([key]) => key === "leftFoot" || key === "rightFoot").length;

  if (isHand && otherHands >= capacity.hands) {
    messageEl.className = "builder-message error";

    messageEl.textContent = "Det greb har kun plads til én starthånd.";

    return;
  }

  if (isFoot && otherFeet >= capacity.feet) {
    messageEl.className = "builder-message error";

    messageEl.textContent = "Det foothold har kun plads til én startfod.";

    return;
  }

  route.start[assignment] = hold.id;

  refreshAssignments();

  saveDraft();

  messageEl.className = "builder-message success";

  messageEl.textContent = `${assignment} sat til ${hold.id}.`;

  draw();
}

/* =====================================================
   TOP
===================================================== */

function markAsTop() {
  const hold = selectedHold();

  if (!hold) {
    return;
  }

  if (route.topId) {
    const oldTop = getHold(route.topId);

    if (oldTop && oldTop.id !== hold.id && oldTop.type === "top") {
      oldTop.type = "jug";

      oldTop.shape ||= "rock";

      oldTop.gripSides ||= allSides();

      if (oldTop.color === "#84cc16") {
        oldTop.color = "#ef4444";
      }
    }
  }

  route.topId = hold.id;

  hold.type = "top";

  hold.shape = "blob";

  hold.color = "#84cc16";

  hold.gripSides = normalizedGripSides(hold.gripSides, "top", "blob");

  if (!Object.values(hold.gripSides).some(Boolean)) {
    hold.gripSides.top = true;
  }

  holdTypeInput.value = "top";

  holdShapeInput.value = "blob";

  colorPicker.value = hold.color;

  refreshCapacity();

  refreshGripSideButtons();

  refreshAssignments();

  refreshDeleteButton();

  saveDraft();

  messageEl.className = "builder-message success";

  messageEl.textContent = "Topgrebet er sat.";

  draw();
}

/* =====================================================
   GRIP SIDES
===================================================== */

function toggleGripSide(side) {
  const hold = selectedHold();

  if (!hold) {
    return;
  }

  const currentlyActive = !!hold.gripSides?.[side];

  const activeCount = Object.values(hold.gripSides || {}).filter(Boolean).length;

  if (currentlyActive && activeCount <= 1) {
    messageEl.className = "builder-message error";

    messageEl.textContent = "Et greb skal have mindst én gribbar side.";

    return;
  }

  hold.gripSides ||= defaultGripSidesForHold(hold.type, hold.shape);

  hold.gripSides[side] = !currentlyActive;

  refreshGripSideButtons();

  saveDraft();

  draw();

  messageEl.className = "builder-message success";

  messageEl.textContent = hold.gripSides[side] ? `${side.toUpperCase()} er nu RU / GRIBBAR.` : `${side.toUpperCase()} er nu GLAT / IKKE-GRIBBAR.`;
}

/* =====================================================
   VALIDATE / TEST
===================================================== */

function validateRoute() {
  if (route.holds.length < 5) {
    return "Banen skal have mindst 5 greb.";
  }

  const required = [
    ["venstre starthånd", "leftHand"],

    ["højre starthånd", "rightHand"],

    ["venstre startfod", "leftFoot"],

    ["højre startfod", "rightFoot"],
  ];

  for (const [label, key] of required) {
    const id = route.start[key];

    if (!id || !getHold(id)) {
      return `Du mangler ${label}.`;
    }
  }

  const lf = getHold(route.start.leftFoot);

  const rf = getHold(route.start.rightFoot);

  const lh = getHold(route.start.leftHand);

  const rh = getHold(route.start.rightHand);

  if (lf?.type !== "foot" || rf?.type !== "foot") {
    return "Begge startfødder skal stå på footholds.";
  }

  if (lh?.type === "foot" || rh?.type === "foot") {
    return "Starthænder kan ikke bruge footholds.";
  }

  if (route.start.leftHand === route.start.rightHand && getHoldCapacity(lh).hands < 2) {
    return "Starthænderne deler et greb, der kun har plads til én hånd.";
  }

  if (route.start.leftFoot === route.start.rightFoot && getHoldCapacity(lf).feet < 2) {
    return "Startfødderne deler et hold, der kun har plads til én fod.";
  }

  for (const hold of route.holds) {
    if (!Object.values(hold.gripSides || {}).some(Boolean)) {
      return `${hold.id} mangler en gribbar side.`;
    }
  }

  if (!route.topId || !getHold(route.topId)) {
    return "Banen mangler et topgreb.";
  }

  return null;
}

function testRoute() {
  const error = validateRoute();

  if (error) {
    messageEl.className = "builder-message error";

    messageEl.textContent = error;

    return;
  }

  route.name = routeNameInput.value.trim() || "Custom Boulder";

  if (
    !saveRouteToLibrary({
      silent: true,
    })
  ) {
    return;
  }

  saveDraft();

  localStorage.setItem(CUSTOM_ROUTE_KEY, JSON.stringify(route));

  window.location.href = "index.html?custom=1";
}

/* =====================================================
   POINTER DOWN
===================================================== */

function pointerDown(event) {
  const point = canvasPoint(event);

  /*
    ROTATION HANDLE
  */

  if (rotationHandleHit(point)) {
    const hold = selectedHold();

    const center = holdScreenPosition(hold);

    state.rotating = true;

    state.resizing = false;

    state.dragging = false;

    state.rotationCenter = center;

    state.rotationPointerStart = Math.atan2(
      point.y - center.y,

      point.x - center.x,
    );

    state.rotationStartAngles = new Map(getSelectedHolds().map((item) => [item.id, item.angle || 0]));

    canvas.setPointerCapture(event.pointerId);

    return;
  }

  /*
    SIZE HANDLE
  */

  if (sizeHandleHit(point)) {
    const hold = selectedHold();

    const center = holdScreenPosition(hold);

    state.resizing = true;

    state.rotating = false;

    state.dragging = false;

    state.resizeCenter = center;

    state.resizePointerStartDistance = Math.hypot(
      point.x - center.x,

      point.y - center.y,
    );

    state.resizeStartSize = hold.r;

    canvas.setPointerCapture(event.pointerId);

    return;
  }

  /*
    NORMAL HOLD CLICK
  */

  const hold = findHoldAt(point);

  if (!hold) {
    selectHold(null);

    return;
  }

  /*
    Shift / Cmd / Ctrl
    = multi-select.
  */

  const additive = event.shiftKey || event.metaKey || event.ctrlKey;

  if (additive) {
    selectHold(hold.id, {
      toggle: true,
    });

    /*
      Shift click can also
      remove a hold.
    */

    if (!state.selectedIds.has(hold.id)) {
      return;
    }
  } else {
    /*
      Clicking a member of an
      existing selection keeps
      the whole group.
    */

    selectHold(hold.id, {
      keepGroup: true,
    });
  }

  /*
    START GROUP DRAG
  */

  state.dragging = true;

  state.rotating = false;

  state.resizing = false;

  state.dragStartPointer = point;

  state.dragStartPositions = new Map(
    getSelectedHolds().map((item) => [
      item.id,

      {
        x: item.x,

        y: item.y,
      },
    ]),
  );

  canvas.setPointerCapture(event.pointerId);
}

/* =====================================================
   POINTER MOVE
===================================================== */

function pointerMove(event) {
  const point = canvasPoint(event);

  /* ===================================================
     RESIZE
  =================================================== */

  if (state.resizing && state.selectedId) {
    const hold = selectedHold();

    if (!hold) {
      return;
    }

    const center = state.resizeCenter;

    const currentDistance = Math.hypot(
      point.x - center.x,

      point.y - center.y,
    );

    const screenDelta = currentDistance - state.resizePointerStartDistance;

    const scale = clamp(
      Math.min(
        state.width / 500,

        state.height / 830,
      ),

      0.75,

      1,
    );

    /*
      Lower sensitivity makes
      resizing easier with mouse.
    */

    const sizeDelta = screenDelta / (scale * 1.4);

    hold.r = clamp(
      state.resizeStartSize + sizeDelta,

      12,

      34,
    );

    sizeSlider.value = Math.round(hold.r);

    /*
      IMPORTANT:
      hand/foot capacity changes
      immediately while resizing.
    */

    refreshEditorLabels();

    refreshCapacity();

    draw();

    return;
  }

  /* ===================================================
     ROTATE
  =================================================== */

  if (state.rotating && state.selectedId) {
    const center = state.rotationCenter;

    const currentPointerAngle = Math.atan2(
      point.y - center.y,

      point.x - center.x,
    );

    const delta = currentPointerAngle - state.rotationPointerStart;

    /*
      Multiple selected holds rotate
      by the same angular amount.
    */

    for (const hold of getSelectedHolds()) {
      const originalAngle = state.rotationStartAngles?.get(hold.id) || 0;

      hold.angle = normalizeAngle(originalAngle + delta);
    }

    const primary = selectedHold();

    if (primary) {
      angleSlider.value = Math.round((primary.angle * 180) / Math.PI);

      refreshEditorLabels();
    }

    draw();

    return;
  }

  /* ===================================================
     GROUP MOVE
  =================================================== */

  if (!state.dragging || !state.dragStartPointer || !state.dragStartPositions) {
    return;
  }

  let dx = (point.x - state.dragStartPointer.x) / state.width;

  let dy = (point.y - state.dragStartPointer.y) / state.height;

  const positions = Array.from(state.dragStartPositions.values());

  /*
    Keep entire selected group
    inside the wall.
  */

  const minDx = Math.max(...positions.map((position) => 0.04 - position.x));

  const maxDx = Math.min(...positions.map((position) => 0.96 - position.x));

  const minDy = Math.max(...positions.map((position) => 0.05 - position.y));

  const maxDy = Math.min(...positions.map((position) => 0.94 - position.y));

  dx = clamp(dx, minDx, maxDx);

  dy = clamp(dy, minDy, maxDy);

  for (const hold of getSelectedHolds()) {
    const start = state.dragStartPositions.get(hold.id);

    if (!start) {
      continue;
    }

    hold.x = start.x + dx;

    hold.y = start.y + dy;
  }

  draw();
}

/* =====================================================
   POINTER UP
===================================================== */

function pointerUp(event) {
  const changed = state.dragging || state.rotating || state.resizing;

  state.dragging = false;

  state.rotating = false;

  state.resizing = false;

  state.dragStartPointer = null;

  state.dragStartPositions = null;

  state.rotationCenter = null;

  state.rotationStartAngles = null;

  state.resizeCenter = null;

  state.resizePointerStartDistance = 0;

  state.resizeStartSize = 0;

  if (changed) {
    saveDraft();
  }

  try {
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  } catch {}
}

/* =====================================================
   EVENTS
===================================================== */

document.querySelectorAll(".hold-add").forEach((button) => {
  button.addEventListener("click", () => addHold(button.dataset.type));
});

document.querySelectorAll(".assign-btn").forEach((button) => {
  button.addEventListener("click", () => assignStart(button.dataset.assignment));
});

document.querySelectorAll(".grip-side-btn").forEach((button) => {
  button.addEventListener("click", () => toggleGripSide(button.dataset.gripSide));
});

/* =====================================================
   TYPE
===================================================== */

holdTypeInput.addEventListener("change", () => {
  const hold = selectedHold();

  if (!hold) {
    return;
  }

  const oldType = hold.type;

  hold.type = holdTypeInput.value;

  if (hold.type === "top") {
    markAsTop();

    return;
  }

  if (oldType !== hold.type) {
    hold.shape = defaultShapeForType(hold.type);

    hold.gripSides = defaultGripSidesForHold(hold.type, hold.shape);

    holdShapeInput.value = hold.shape;

    if (hold.type === "foot") {
      hold.color = "#22c55e";
    }

    if (hold.type === "sloper") {
      hold.color = "#8b5cf6";
    }

    colorPicker.value = hold.color;
  }

  if (route.topId === hold.id && hold.type !== "top") {
    route.topId = null;
  }

  refreshCapacity();

  refreshGripSideButtons();

  refreshAssignments();

  refreshDeleteButton();

  saveDraft();

  draw();
});

/* =====================================================
   SHAPE
===================================================== */

holdShapeInput.addEventListener("change", () => {
  const hold = selectedHold();

  if (!hold) {
    return;
  }

  hold.shape = holdShapeInput.value;

  refreshCapacity();

  saveDraft();

  draw();
});

/* =====================================================
   ANGLE SLIDER
===================================================== */

angleSlider.addEventListener("input", () => {
  const hold = selectedHold();

  if (!hold) {
    return;
  }

  const nextAngle = (Number(angleSlider.value) * Math.PI) / 180;

  const delta = normalizeAngle(nextAngle - (hold.angle || 0));

  /*
      If multiple holds are selected,
      slider rotates whole group.
    */

  if (state.selectedIds.size > 1) {
    for (const item of getSelectedHolds()) {
      item.angle = normalizeAngle((item.angle || 0) + delta);
    }
  } else {
    hold.angle = nextAngle;
  }

  refreshEditorLabels();

  saveDraft();

  draw();
});

/* =====================================================
   SIZE SLIDER
===================================================== */

sizeSlider.addEventListener("input", () => {
  const hold = selectedHold();

  if (!hold) {
    return;
  }

  hold.r = Number(sizeSlider.value);

  refreshEditorLabels();

  /*
      Immediately updates:
      HÆNDER / FØDDER.
    */

  refreshCapacity();

  saveDraft();

  draw();
});

/* =====================================================
   COLOR
===================================================== */

colorPicker.addEventListener("input", () => {
  const hold = selectedHold();

  if (!hold) {
    return;
  }

  hold.color = colorPicker.value;

  saveDraft();

  draw();
});

/* =====================================================
   BUTTON EVENTS
===================================================== */

routeNameInput.addEventListener("input", saveDraft);

deleteBtn.addEventListener("click", deleteSelected);

topBtn.addEventListener("click", markAsTop);

saveRouteBtn.addEventListener("click", () => saveRouteToLibrary());

newRouteBtn.addEventListener("click", createNewRoute);

testBtn.addEventListener("click", testRoute);

/* =====================================================
   CANVAS
===================================================== */

canvas.addEventListener("pointerdown", pointerDown);

canvas.addEventListener("pointermove", pointerMove);

canvas.addEventListener("pointerup", pointerUp);

canvas.addEventListener("pointercancel", pointerUp);

/* =====================================================
   KEYBOARD
===================================================== */

document.addEventListener("keydown", (event) => {
  const target = event.target;

  const tag = target?.tagName?.toLowerCase();

  /*
      Don't trigger Delete while
      user types in inputs.
    */

  const isTyping = tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;

  if (isTyping) {
    return;
  }

  /*
      Windows / full keyboard:
      Delete

      Mac:
      Backspace
    */

  if (event.key === "Delete" || event.key === "Backspace") {
    if (state.selectedIds.size || state.selectedId) {
      event.preventDefault();

      deleteSelected();
    }

    return;
  }

  /*
      Escape deselects.
    */

  if (event.key === "Escape") {
    selectHold(null);
  }
});

/* =====================================================
   RESIZE
===================================================== */

window.addEventListener("resize", resize);

new ResizeObserver(resize).observe(canvas);

/* =====================================================
   INIT
===================================================== */

refreshAssignments();

refreshDeleteButton();

refreshSelectionInfo();

renderRouteLibrary();

resize();
