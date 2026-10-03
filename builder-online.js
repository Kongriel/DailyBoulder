(() => {
  const online = window.DailyClimbOnline;

  const panelHost = document.querySelector(".editor-panel");

  const headerActions = document.querySelector(".header-actions");

  if (!panelHost || !headerActions) {
    return;
  }

  const publishBtn = document.createElement("button");

  publishBtn.type = "button";

  publishBtn.className = "test-btn";

  publishBtn.textContent = "🌍 PUBLICÉR";

  headerActions.insertBefore(publishBtn, document.getElementById("testBtn"));

  const panel = document.createElement("div");

  panel.className = "panel-section";

  panel.innerHTML = `
    <div class="library-heading">
      <div class="panel-title">
        ONLINE
      </div>

      <a
        href="admin.html"
        class="new-route-btn"
        id="onlineAdminLink"
      >
        ADMIN
      </a>
    </div>

    <div
      id="onlineBuilderNotice"
      class="builder-message"
    >
      Starter online…
    </div>

    <label
      class="field-label"
      for="onlineUsername"
    >
      KLATRERNAVN
    </label>

    <div
      style="
        display:grid;
        grid-template-columns:1fr auto;
        gap:6px;
      "
    >
      <input
        id="onlineUsername"
        class="text-input"
        maxlength="24"
        autocomplete="nickname"
      />

      <button
        id="saveOnlineUsername"
        class="new-route-btn"
        type="button"
      >
        GEM
      </button>
    </div>

    <div
      id="dailyAdminBox"
      class="hidden"
      style="margin-top:12px"
    >
      <div class="panel-title">
        👑 DAGENS BANE
      </div>

      <label
        class="field-label"
        for="dailyRouteDate"
      >
        DATO
      </label>

      <input
        id="dailyRouteDate"
        class="text-input"
        type="date"
      />

      <p class="capacity-note">
        Som admin får dine online-baner
        en ⭐ DAGENS-knap.
      </p>
    </div>

    <div
      class="library-heading"
      style="margin-top:14px"
    >
      <div class="panel-title">
        MINE ONLINE BANER
      </div>

      <button
        id="refreshOnlineRoutes"
        class="new-route-btn"
        type="button"
      >
        ↻
      </button>
    </div>

    <div
      id="onlineBuilderRoutes"
      class="route-library"
    ></div>
  `;

  const statusSection = [...panelHost.querySelectorAll(".panel-section")].find((section) => section.textContent.includes("STATUS"));

  if (statusSection) {
    panelHost.insertBefore(panel, statusSection);
  } else {
    panelHost.appendChild(panel);
  }

  const notice = document.getElementById("onlineBuilderNotice");

  const usernameInput = document.getElementById("onlineUsername");

  const saveUsernameBtn = document.getElementById("saveOnlineUsername");

  const routeList = document.getElementById("onlineBuilderRoutes");

  const refreshBtn = document.getElementById("refreshOnlineRoutes");

  const adminBox = document.getElementById("dailyAdminBox");

  const dailyDate = document.getElementById("dailyRouteDate");

  const adminLink = document.getElementById("onlineAdminLink");

  let admin = false;

  function setNotice(text, type = "") {
    notice.className = `builder-message${type ? ` ${type}` : ""}`;

    notice.textContent = text;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function currentRouteForPublish() {
    route.name = document.getElementById("routeName").value.trim() || "Custom Boulder";

    return clone(route);
  }

  function formatBest(best) {
    if (!best) {
      return "Ingen highscore endnu";
    }

    const total = Math.max(0, best.timeMs / 1000);

    const min = Math.floor(total / 60);

    const sec = Math.floor(total % 60);

    const tenth = Math.floor((total % 1) * 10);

    const time = `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${tenth}`;

    return `🏆 ${best.moves} moves · ${best.falls} falls · ${time}`;
  }

  async function publishCurrentRoute() {
    const error = validateRoute();

    if (error) {
      setNotice(error, "error");

      return;
    }

    try {
      publishBtn.disabled = true;

      setNotice("Publicerer bane…");

      const saved = await online.publishRoute(currentRouteForPublish(), route.onlineId || null);

      route.onlineId = saved.onlineId;

      saveDraft();

      setNotice(`🌍 “${saved.name}” er publiceret.`, "success");

      await renderMyRoutes();
    } catch (error) {
      setNotice(
        error.message || "Kunne ikke publicere banen.",

        "error",
      );
    } finally {
      publishBtn.disabled = false;
    }
  }

  async function editOnlineRoute(id) {
    try {
      const saved = await online.fetchRoute(id);

      if (!saved?.canEdit) {
        throw new Error("Du kan ikke redigere den bane.");
      }

      const draft = clone(saved);

      delete draft.ownerId;
      delete draft.authorName;
      delete draft.canEdit;
      delete draft.plays;
      delete draft.isPublic;

      draft.onlineId = id;

      route = draft;

      document.getElementById("routeName").value = route.name || "Custom Boulder";

      state.selectedId = null;

      selectedEditor.classList.add("hidden");

      resetHoldCounter();

      refreshAssignments();

      saveDraft();

      draw();

      setNotice(`Redigerer online-banen “${route.name}”.`, "success");
    } catch (error) {
      setNotice(
        error.message || "Kunne ikke hente banen.",

        "error",
      );
    }
  }

  async function removeOnlineRoute(id, name) {
    if (!confirm(`Slet “${name}” online?`)) {
      return;
    }

    try {
      await online.deleteRoute(id);

      if (route.onlineId === id) {
        delete route.onlineId;

        saveDraft();
      }

      setNotice("Online-banen blev slettet.", "success");

      await renderMyRoutes();
    } catch (error) {
      setNotice(
        error.message || "Kunne ikke slette banen.",

        "error",
      );
    }
  }

  async function makeDaily(id, name) {
    const day = dailyDate.value;

    if (!day) {
      return;
    }

    try {
      await online.setDailyRoute(day, id);

      setNotice(`⭐ “${name}” er dagens bane ${day}.`, "success");

      await renderMyRoutes();
    } catch (error) {
      setNotice(
        error.message || "Kunne ikke sætte dagens bane.",

        "error",
      );
    }
  }

  async function renderMyRoutes() {
    if (!online?.configured) {
      routeList.innerHTML = `<div class="library-empty">
          Supabase er ikke sat op endnu.
        </div>`;

      return;
    }

    try {
      const [items, today] = await Promise.all([
        online.listRoutes({
          mine: true,
        }),

        dailyDate.value ? online.getDailySelection(dailyDate.value) : Promise.resolve(null),
      ]);

      routeList.innerHTML = "";

      if (!items.length) {
        routeList.innerHTML = `<div class="library-empty">
            Du har ingen online-baner endnu.
          </div>`;

        return;
      }

      for (const item of items) {
        const card = document.createElement("div");

        const isCurrent = route.onlineId === item.id;

        const isDaily = today?.route_id === item.id;

        card.className = `route-card${isCurrent ? " current" : ""}`;

        card.innerHTML = `
          <div class="route-card-top">

            <div class="route-card-name">
            </div>

            <div class="route-card-count">
              ${item.routeData?.holds?.length || 0}
              greb
            </div>

          </div>

          <div class="route-card-best">
            ${formatBest(item.best)}
            ${isDaily ? " · ⭐ DAGENS" : ""}
          </div>

          <div
            class="route-card-actions"
            style="
              grid-template-columns:
              1fr 1fr auto
              ${admin ? " 1fr" : ""};
            "
          >

            <button
              class="online-edit"
              type="button"
            >
              REDIGER
            </button>

            <button
              class="online-play library-play"
              type="button"
            >
              ▶ SPIL
            </button>

            <button
              class="online-delete library-delete"
              type="button"
            >
              ✕
            </button>

            ${
              admin
                ? `<button
                  class="online-daily"
                  type="button"
                >
                  ⭐ DAGENS
                </button>`
                : ""
            }

          </div>
        `;

        card.querySelector(".route-card-name").textContent = item.name || "Uden navn";

        card.querySelector(".online-edit").addEventListener("click", () => editOnlineRoute(item.id));

        card.querySelector(".online-play").addEventListener("click", () => {
          location.href = `index.html?route=${encodeURIComponent(item.id)}`;
        });

        card.querySelector(".online-delete").addEventListener("click", () => removeOnlineRoute(item.id, item.name));

        card.querySelector(".online-daily")?.addEventListener("click", () => makeDaily(item.id, item.name));

        routeList.appendChild(card);
      }
    } catch (error) {
      routeList.innerHTML = `<div class="library-empty">
          ${error.message || "Kunne ikke hente baner."}
        </div>`;
    }
  }

  async function init() {
    if (!online?.configured) {
      publishBtn.disabled = true;

      setNotice("Online er ikke sat op endnu. Udfyld supabase-config.js først.", "error");

      return;
    }

    try {
      await online.ensureSession();

      const profile = await online.ensureProfile();

      admin = await online.isAdmin();

      usernameInput.value = profile?.username || "";

      dailyDate.value = online.localDateKey();

      adminBox.classList.toggle("hidden", !admin);

      adminLink.textContent = admin ? "👑 ADMIN" : "ADMIN LOGIN";

      setNotice("Online klar ✓", "success");

      await renderMyRoutes();
    } catch (error) {
      setNotice(
        error.message || "Online kunne ikke starte.",

        "error",
      );
    }
  }

  publishBtn.addEventListener("click", publishCurrentRoute);

  refreshBtn.addEventListener("click", renderMyRoutes);

  dailyDate.addEventListener("change", renderMyRoutes);

  saveUsernameBtn.addEventListener("click", async () => {
    try {
      const profile = await online.setUsername(usernameInput.value);

      usernameInput.value = profile.username;

      setNotice(`Navn gemt som ${profile.username}.`, "success");
    } catch (error) {
      setNotice(
        error.message || "Kunne ikke gemme navnet.",

        "error",
      );
    }
  });

  usernameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      saveUsernameBtn.click();
    }
  });

  init();
})();
