(() => {
  const body = document.body;

  const homeScreen = document.getElementById("homeScreen");

  const dailyMenuBtn = document.getElementById("dailyMenuBtn");

  const howToBtn = document.getElementById("howToBtn");

  const startOverlay = document.getElementById("startOverlay");

  const dailyModalClose = document.getElementById("dailyModalClose");

  const howToOverlay = document.getElementById("howToOverlay");

  const howToClose = document.getElementById("howToClose");

  const playBtn = document.getElementById("playBtn");

  /* =====================================================
     URL MODE
  ===================================================== */

  const params = new URLSearchParams(window.location.search);

  const isCommunityRoute = params.has("route");

  const isBuilderTest = params.get("custom") === "1";

  const isDirectGame = isCommunityRoute || isBuilderTest;

  /* =====================================================
     HOME
  ===================================================== */

  function showHome() {
    body.classList.add("home-mode");

    homeScreen?.setAttribute("aria-hidden", "false");

    startOverlay?.classList.add("hidden");

    window.dispatchEvent(new Event("resize"));
  }

  /* =====================================================
     GAME
  ===================================================== */

  function enterGame() {
    body.classList.remove("home-mode");

    homeScreen?.setAttribute("aria-hidden", "true");

    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
  }

  /* =====================================================
     DAILY / ROUTE POPUP
  ===================================================== */

  function openDaily() {
    /*
      Hvis vi er kommet direkte
      fra baneoversigten eller builder,
      skal forsiden IKKE være aktiv.
    */

    if (isDirectGame) {
      enterGame();
    }

    startOverlay?.classList.remove("hidden");
  }

  function closeDaily() {
    startOverlay?.classList.add("hidden");

    /*
      Community route:
      tilbage til baneoversigten.
    */

    if (isCommunityRoute) {
      window.location.href = "routes.html";

      return;
    }

    /*
      Builder test:
      tilbage til builder.
    */

    if (isBuilderTest) {
      window.location.href = "builder.html";

      return;
    }

    /*
      Dagens bane fra forsiden:
      bare tilbage til forsiden.
    */

    showHome();
  }

  /* =====================================================
     HOW TO
  ===================================================== */

  function openHowTo() {
    howToOverlay?.classList.remove("hidden");
  }

  function closeHowTo() {
    howToOverlay?.classList.add("hidden");
  }

  /* =====================================================
     EVENTS
  ===================================================== */

  dailyMenuBtn?.addEventListener("click", openDaily);

  dailyModalClose?.addEventListener("click", closeDaily);

  howToBtn?.addEventListener("click", openHowTo);

  howToClose?.addEventListener("click", closeHowTo);

  playBtn?.addEventListener("click", enterGame);

  startOverlay?.addEventListener("click", (event) => {
    if (event.target === startOverlay) {
      closeDaily();
    }
  });

  howToOverlay?.addEventListener("click", (event) => {
    if (event.target === howToOverlay) {
      closeHowTo();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    if (howToOverlay && !howToOverlay.classList.contains("hidden")) {
      closeHowTo();

      return;
    }

    if (startOverlay && !startOverlay.classList.contains("hidden")) {
      closeDaily();
    }
  });

  /* =====================================================
     INITIAL STATE
  ===================================================== */

  if (isDirectGame) {
    /*
      VIGTIGT:
      Forsiden bliver aldrig vist,
      hvis URL'en indeholder
      ?route= eller ?custom=1.
    */

    enterGame();

    openDaily();
  } else {
    showHome();
  }

  /* =====================================================
     API
  ===================================================== */

  window.DailyBoulderHome = {
    showHome,

    enterGame,

    openDaily,

    closeDaily,

    openHowTo,

    closeHowTo,
  };
})();
