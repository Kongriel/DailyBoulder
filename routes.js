const online = window.DailyClimbOnline;

const routeGrid = document.getElementById("routeGrid");

const emptyState = document.getElementById("emptyState");

const setupNotice = document.getElementById("setupNotice");

const routeSearch = document.getElementById("routeSearch");

const routeCount = document.getElementById("routeCount");

let catalog = [];

let user = null;

let dailyRouteId = null;

let activeFilter = "all";

/* =====================================================
   HELPERS
===================================================== */

function formatTime(ms) {
  const total = Math.max(0, Number(ms || 0) / 1000);

  const min = Math.floor(total / 60);

  const sec = Math.floor(total % 60);

  const tenth = Math.floor((total % 1) * 10);

  return `${String(min).padStart(2, "0")}:` + `${String(sec).padStart(2, "0")}.` + `${tenth}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")

    .replaceAll("<", "&lt;")

    .replaceAll(">", "&gt;")

    .replaceAll('"', "&quot;")

    .replaceAll("'", "&#039;");
}

function routeIsMine(route) {
  return Boolean(user && route.ownerId === user.id);
}

function routeIsDaily(route) {
  return Boolean(dailyRouteId && route.id === dailyRouteId);
}

function getHoldCount(route) {
  return Array.isArray(route.routeData?.holds) ? route.routeData.holds.length : 0;
}

/* =====================================================
   FILTER
===================================================== */

function matchesFilter(route) {
  if (activeFilter === "daily") {
    return routeIsDaily(route);
  }

  if (activeFilter === "mine") {
    return routeIsMine(route);
  }

  return true;
}

function getVisibleRoutes() {
  const query = routeSearch.value.trim().toLowerCase();

  let items = catalog.filter(matchesFilter);

  if (activeFilter === "new") {
    items = items.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  } else if (activeFilter === "all") {
    /*
    Dagens bane kommer øverst
    på ALLE.
  */
    items = items.slice().sort((a, b) => {
      const aDaily = routeIsDaily(a) ? 1 : 0;

      const bDaily = routeIsDaily(b) ? 1 : 0;

      if (aDaily !== bDaily) {
        return bDaily - aDaily;
      }

      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });
  }

  if (query) {
    items = items.filter((route) => {
      const name = String(route.name || "").toLowerCase();

      const author = String(route.authorName || "").toLowerCase();

      return name.includes(query) || author.includes(query);
    });
  }

  return items;
}

/* =====================================================
   CARD
===================================================== */

function createRouteCard(route) {
  const daily = routeIsDaily(route);

  const mine = routeIsMine(route);

  const holdCount = getHoldCount(route);

  const best = route.best;

  const card = document.createElement("article");

  card.className = `route-card${daily ? " daily" : ""}`;

  const bestMarkup = best
    ? `
        <small>BEDSTE RESULTAT</small>

        <strong>
          ${best.moves} moves
          · ${best.falls} falls
          · ${formatTime(best.timeMs)}
        </strong>
      `
    : `
        <small>BEDSTE RESULTAT</small>

        <strong>
          Ingen score endnu
        </strong>
      `;

  card.innerHTML = `

    <div class="card-badges">

      ${
        daily
          ? `
            <span class="badge daily">
              DAGENS BANE
            </span>
          `
          : ""
      }


      ${
        mine
          ? `
            <span class="badge mine">
              DIN BANE
            </span>
          `
          : ""
      }

    </div>


    <h2>
      ${escapeHtml(route.name)}
    </h2>


    <p class="author">
      af ${escapeHtml(route.authorName || "Climber")}
    </p>


    <div class="best-line">
      ${bestMarkup}
    </div>


    <div class="card-bottom">

      <div class="card-meta">

        <div>

          <small>
            GREB
          </small>

          <strong>
            ${holdCount}
          </strong>

        </div>


        <div>

          <small>
            SPILLET
          </small>

          <strong>
            ${Number(route.plays || 0)}
          </strong>

        </div>

      </div>


      <button
        class="play-btn"
        type="button"
      >
        SPIL →
      </button>

    </div>

  `;

  card.querySelector(".play-btn").addEventListener("click", () => {
    window.location.href = `index.html?route=${encodeURIComponent(route.id)}`;
  });

  return card;
}

/* =====================================================
   RENDER
===================================================== */

function renderRoutes() {
  const items = getVisibleRoutes();

  routeGrid.innerHTML = "";

  routeCount.textContent = items.length;

  emptyState.classList.toggle("hidden", items.length > 0);

  for (const route of items) {
    routeGrid.appendChild(createRouteCard(route));
  }
}

/* =====================================================
   LOAD
===================================================== */

async function loadCatalog() {
  catalog = await online.listRoutes({
    limit: 200,
  });

  try {
    const daily = await online.getDailySelection();

    dailyRouteId = daily?.route_id || null;
  } catch (error) {
    console.warn("Kunne ikke hente dagens bane:", error);

    dailyRouteId = null;
  }
}

/* =====================================================
   INIT
===================================================== */

async function init() {
  if (!online?.configured) {
    setupNotice.classList.remove("hidden");

    setupNotice.innerHTML = `
      <strong>Online-delen er ikke forbundet.</strong>
      Kontrollér supabase-config.js.
    `;

    return;
  }

  try {
    await online.ensureSession();

    user = await online.getUser();

    await online.ensureProfile();

    await loadCatalog();

    renderRoutes();
  } catch (error) {
    console.error(error);

    setupNotice.classList.remove("hidden");

    setupNotice.textContent = error.message || "Kunne ikke hente banerne.";
  }
}

/* =====================================================
   EVENTS
===================================================== */

document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;

    document.querySelectorAll(".filter").forEach((item) => {
      item.classList.toggle("active", item === button);
    });

    renderRoutes();
  });
});

routeSearch.addEventListener("input", renderRoutes);

init();
