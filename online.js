(() => {
  const config = window.DAILY_CLIMB_CONFIG || {};

  const configured = Boolean(config.supabaseUrl && config.supabaseKey && !config.supabaseUrl.includes("YOUR_PROJECT") && !config.supabaseKey.includes("YOUR_") && window.supabase);

  const client = configured
    ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

  let sessionPromise = null;
  let profilePromise = null;
  let adminPromise = null;

  let preparedRoute = null;
  let preparedPersonalBest = null;
  let preparedGlobalBest = null;

  const countedPlays = new Set();

  function localDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");

    return `${y}-${m}-${d}`;
  }

  function isBetter(a, b) {
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

  function randomUsername(userId = "") {
    const suffix = userId.replace(/-/g, "").slice(-5).toUpperCase() || Math.random().toString(36).slice(2, 7).toUpperCase();

    return `Climber-${suffix}`;
  }

  async function ensureSession() {
    if (!client) {
      return null;
    }

    if (sessionPromise) {
      return sessionPromise;
    }

    sessionPromise = (async () => {
      const { data, error } = await client.auth.getSession();

      if (error) {
        throw error;
      }

      if (data.session) {
        return data.session;
      }

      const anon = await client.auth.signInAnonymously();

      if (anon.error) {
        throw anon.error;
      }

      return anon.data.session;
    })().catch((error) => {
      sessionPromise = null;
      throw error;
    });

    return sessionPromise;
  }

  async function getUser() {
    const session = await ensureSession();

    return session?.user || null;
  }

  async function ensureProfile() {
    if (!client) {
      return null;
    }

    if (profilePromise) {
      return profilePromise;
    }

    profilePromise = (async () => {
      const user = await getUser();

      if (!user) {
        return null;
      }

      const existing = await client.from("profiles").select("id, username").eq("id", user.id).maybeSingle();

      if (existing.error) {
        throw existing.error;
      }

      if (existing.data) {
        return existing.data;
      }

      for (let attempt = 0; attempt < 5; attempt++) {
        const username = attempt === 0 ? randomUsername(user.id) : `${randomUsername(user.id)}-${Math.floor(Math.random() * 90 + 10)}`;

        const inserted = await client
          .from("profiles")
          .insert({
            id: user.id,
            username,
          })
          .select("id, username")
          .single();

        if (!inserted.error) {
          return inserted.data;
        }

        if (inserted.error.code !== "23505") {
          throw inserted.error;
        }
      }

      throw new Error("Kunne ikke oprette en profil.");
    })().catch((error) => {
      profilePromise = null;
      throw error;
    });

    return profilePromise;
  }

  async function setUsername(username) {
    if (!client) {
      throw new Error("Supabase er ikke sat op endnu.");
    }

    const user = await getUser();

    if (!user) {
      throw new Error("Ingen bruger-session.");
    }

    const clean = String(username || "")
      .trim()
      .replace(/\s+/g, " ");

    if (clean.length < 2 || clean.length > 24) {
      throw new Error("Navnet skal være 2–24 tegn.");
    }

    const result = await client
      .from("profiles")
      .upsert(
        {
          id: user.id,
          username: clean,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "id",
        },
      )
      .select("id, username")
      .single();

    if (result.error) {
      throw result.error;
    }

    profilePromise = Promise.resolve(result.data);

    return result.data;
  }

  async function isAdmin() {
    if (!client) {
      return false;
    }

    if (adminPromise) {
      return adminPromise;
    }

    adminPromise = (async () => {
      await ensureSession();

      const result = await client.rpc("is_admin");

      if (result.error) {
        console.warn("Kunne ikke kontrollere admin:", result.error);

        return false;
      }

      return result.data === true;
    })();

    return adminPromise;
  }

  async function signInAdmin(email, password) {
    if (!client) {
      throw new Error("Supabase er ikke sat op endnu.");
    }

    const result = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (result.error) {
      throw result.error;
    }

    sessionPromise = Promise.resolve(result.data.session);
    profilePromise = null;
    adminPromise = null;

    preparedRoute = null;
    preparedPersonalBest = null;
    preparedGlobalBest = null;

    await ensureProfile();

    return isAdmin();
  }

  async function signOut() {
    if (!client) {
      return;
    }

    await client.auth.signOut();

    sessionPromise = null;
    profilePromise = null;
    adminPromise = null;

    preparedRoute = null;
    preparedPersonalBest = null;
    preparedGlobalBest = null;
  }

  async function fetchProfiles(ids) {
    const unique = [...new Set(ids.filter(Boolean))];

    if (!unique.length) {
      return new Map();
    }

    const result = await client.from("profiles").select("id, username").in("id", unique);

    if (result.error) {
      throw result.error;
    }

    return new Map((result.data || []).map((profile) => [profile.id, profile.username]));
  }

  async function fetchBestScores(routeIds) {
    const ids = [...new Set(routeIds.filter(Boolean))];

    if (!ids.length) {
      return new Map();
    }

    const result = await client.from("scores").select("route_id, moves, falls, time_ms").in("route_id", ids);

    if (result.error) {
      throw result.error;
    }

    const best = new Map();

    for (const row of result.data || []) {
      const candidate = {
        moves: Number(row.moves),
        falls: Number(row.falls),
        timeMs: Number(row.time_ms),
      };

      if (isBetter(candidate, best.get(row.route_id))) {
        best.set(row.route_id, candidate);
      }
    }

    return best;
  }

  async function listRoutes({ mine = false, limit = 200 } = {}) {
    if (!client) {
      return [];
    }

    const user = await getUser();

    await ensureProfile();

    let query = client
      .from("routes")
      .select("id, owner_id, name, route_data, plays, is_public, created_at, updated_at")
      .order("updated_at", {
        ascending: false,
      })
      .limit(limit);

    if (mine) {
      query = query.eq("owner_id", user.id);
    } else {
      query = query.eq("is_public", true);
    }

    const result = await query;

    if (result.error) {
      throw result.error;
    }

    const rows = result.data || [];

    const profiles = await fetchProfiles(rows.map((row) => row.owner_id));

    const bestScores = await fetchBestScores(rows.map((row) => row.id));

    return rows.map((row) => ({
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      routeData: row.route_data,
      plays: Number(row.plays || 0),
      isPublic: Boolean(row.is_public),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      authorName: profiles.get(row.owner_id) || "Climber",
      best: bestScores.get(row.id) || null,
      canEdit: Boolean(user && row.owner_id === user.id),
    }));
  }

  async function fetchRoute(routeId) {
    if (!client || !routeId) {
      return null;
    }

    const user = await getUser();
    const admin = await isAdmin();

    const result = await client.from("routes").select("id, owner_id, name, route_data, plays, is_public, created_at, updated_at").eq("id", routeId).maybeSingle();

    if (result.error) {
      throw result.error;
    }

    if (!result.data) {
      return null;
    }

    const row = result.data;

    const profiles = await fetchProfiles([row.owner_id]);

    return {
      ...(row.route_data || {}),

      name: row.name || row.route_data?.name || "Uden navn",

      onlineId: row.id,
      ownerId: row.owner_id,

      authorName: profiles.get(row.owner_id) || "Climber",

      plays: Number(row.plays || 0),

      isPublic: Boolean(row.is_public),

      canEdit: Boolean(user && (row.owner_id === user.id || admin)),
    };
  }

  async function publishRoute(routeObject, existingId = null) {
    if (!client) {
      throw new Error("Supabase er ikke sat op endnu.");
    }

    const user = await getUser();

    await ensureProfile();

    const cleanName = String(routeObject?.name || "")
      .trim()
      .slice(0, 40);

    if (!cleanName) {
      throw new Error("Banen skal have et navn.");
    }

    const routeData = JSON.parse(JSON.stringify(routeObject));

    delete routeData.onlineId;
    delete routeData.ownerId;
    delete routeData.authorName;
    delete routeData.canEdit;
    delete routeData.plays;
    delete routeData.isPublic;
    delete routeData.libraryId;

    const payload = {
      owner_id: user.id,
      name: cleanName,
      route_data: routeData,
      is_public: true,
      updated_at: new Date().toISOString(),
    };

    if (existingId) {
      const result = await client.from("routes").update(payload).eq("id", existingId).select("id").single();

      if (result.error) {
        throw result.error;
      }

      return fetchRoute(result.data.id);
    }

    const result = await client.from("routes").insert(payload).select("id").single();

    if (result.error) {
      throw result.error;
    }

    return fetchRoute(result.data.id);
  }

  async function deleteRoute(routeId) {
    if (!client) {
      throw new Error("Supabase er ikke sat op endnu.");
    }

    const result = await client.from("routes").delete().eq("id", routeId);

    if (result.error) {
      throw result.error;
    }
  }

  async function getDailySelection(day = localDateKey()) {
    if (!client) {
      return null;
    }

    await ensureSession();

    const result = await client.from("daily_routes").select("day, route_id").eq("day", day).maybeSingle();

    if (result.error) {
      throw result.error;
    }

    return result.data || null;
  }

  async function getDailyRoute(day = localDateKey()) {
    const daily = await getDailySelection(day);

    if (!daily?.route_id) {
      return null;
    }

    const route = await fetchRoute(daily.route_id);

    if (route) {
      route.dailyDay = daily.day;
    }

    return route;
  }

  async function setDailyRoute(day, routeId) {
    if (!client) {
      throw new Error("Supabase er ikke sat op endnu.");
    }

    const result = await client.rpc("set_daily_route", {
      p_day: day,
      p_route_id: routeId,
    });

    if (result.error) {
      throw result.error;
    }
  }

  async function getPersonalBest(routeId) {
    if (!client || !routeId) {
      return null;
    }

    const user = await getUser();

    const result = await client.from("scores").select("moves, falls, time_ms").eq("route_id", routeId).eq("user_id", user.id).maybeSingle();

    if (result.error) {
      throw result.error;
    }

    if (!result.data) {
      return null;
    }

    return {
      moves: Number(result.data.moves),

      falls: Number(result.data.falls),

      timeMs: Number(result.data.time_ms),
    };
  }

  async function submitScore(routeId, run) {
    if (!client || !routeId) {
      return false;
    }

    await ensureSession();

    const result = await client.rpc("submit_score", {
      p_route_id: routeId,

      p_moves: Math.max(0, Math.round(run.moves)),

      p_falls: Math.max(0, Math.round(run.falls)),

      p_time_ms: Math.max(1, Math.round(run.timeMs)),
    });

    if (result.error) {
      throw result.error;
    }

    return result.data === true;
  }

  async function countPlay(routeId) {
    if (!client || !routeId || countedPlays.has(routeId)) {
      return;
    }

    countedPlays.add(routeId);

    const result = await client.rpc("increment_route_play", {
      p_route_id: routeId,
    });

    if (result.error) {
      countedPlays.delete(routeId);
      throw result.error;
    }
  }

  async function getGlobalBest(routeId) {
    if (!client || !routeId) {
      return null;
    }

    await ensureSession();

    const scoreResult = await client
      .from("scores")
      .select("user_id, moves, falls, time_ms")
      .eq("route_id", routeId)
      .order("moves", {
        ascending: true,
      })
      .order("falls", {
        ascending: true,
      })
      .order("time_ms", {
        ascending: true,
      })
      .limit(1)
      .maybeSingle();

    if (scoreResult.error) {
      throw scoreResult.error;
    }

    if (!scoreResult.data) {
      return null;
    }

    const score = scoreResult.data;

    const profileResult = await client.from("profiles").select("username").eq("id", score.user_id).maybeSingle();

    if (profileResult.error) {
      console.warn("Kunne ikke hente navn til global rekord:", profileResult.error);
    }

    return {
      username: profileResult.data?.username || "Climber",

      moves: Number(score.moves),

      falls: Number(score.falls),

      timeMs: Number(score.time_ms),
    };
  }

  async function refreshPreparedScores(routeId = preparedRoute?.onlineId) {
    preparedPersonalBest = null;
    preparedGlobalBest = null;

    if (!routeId) {
      return {
        personalBest: null,
        globalBest: null,
      };
    }

    try {
      preparedPersonalBest = await getPersonalBest(routeId);
    } catch (error) {
      console.warn("Kunne ikke hente personlig bedste:", error);
    }

    try {
      preparedGlobalBest = await getGlobalBest(routeId);
    } catch (error) {
      console.warn("Kunne ikke hente dagens bedste:", error);
    }

    return {
      personalBest: preparedPersonalBest,

      globalBest: preparedGlobalBest,
    };
  }

  async function prepareGameRoute() {
    if (!client) {
      return null;
    }

    await ensureSession();
    await ensureProfile();

    const params = new URLSearchParams(window.location.search);

    const routeId = params.get("route");

    const isLocalCustom = params.get("custom") === "1";

    if (routeId) {
      preparedRoute = await fetchRoute(routeId);
    } else if (!isLocalCustom) {
      preparedRoute = await getDailyRoute();
    } else {
      preparedRoute = null;
    }

    await refreshPreparedScores(preparedRoute?.onlineId || null);

    return preparedRoute;
  }

  function getPreparedRoute() {
    return preparedRoute;
  }

  function getPreparedPersonalBest() {
    return preparedPersonalBest;
  }

  function getPreparedGlobalBest() {
    return preparedGlobalBest;
  }

  function setPreparedPersonalBest(run) {
    if (isBetter(run, preparedPersonalBest)) {
      preparedPersonalBest = {
        ...run,
      };

      return true;
    }

    return false;
  }

  async function getRouteLeaderboard(routeId) {
    if (!client || !routeId) {
      return [];
    }

    await ensureSession();

    const result = await client.rpc("get_route_leaderboard", {
      p_route_id: routeId,
    });

    if (result.error) {
      throw result.error;
    }

    return (result.data || []).map((row) => ({
      place: Number(row.place),

      userId: row.user_id,

      username: row.username || "Climber",

      moves: Number(row.moves),

      falls: Number(row.falls),

      timeMs: Number(row.time_ms),

      isYou: Boolean(row.is_you),

      totalPlayers: Number(row.total_players || 0),
    }));
  }

  window.DailyClimbOnline = {
    configured,
    client,

    localDateKey,
    isBetter,

    ensureSession,
    getUser,
    ensureProfile,
    setUsername,

    isAdmin,
    signInAdmin,
    signOut,

    listRoutes,
    fetchRoute,
    publishRoute,
    deleteRoute,

    getDailySelection,
    getDailyRoute,
    setDailyRoute,

    getPersonalBest,
    getGlobalBest,
    submitScore,
    getRouteLeaderboard,

    countPlay,

    prepareGameRoute,
    refreshPreparedScores,

    getPreparedRoute,
    getPreparedPersonalBest,
    getPreparedGlobalBest,
    setPreparedPersonalBest,
  };
})();
