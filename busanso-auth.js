/* BUSANSO AUTH COMPATIBILITY BRIDGE
   Supports:
   1) Existing legacy localStorage users
   2) New Supabase/Google Auth users

   It never signs users out and never deletes legacy credentials.
*/
(function () {
  "use strict";

  const SUPABASE_URL =
    "https://dhkfhhybzcxdeoalcfqx.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_Rjm3T44VKTeuOF2yJS5rMw_xDfwPjuG";

  function getLocal(key) {
    try {
      return localStorage.getItem(key) || "";
    } catch (_) {
      return "";
    }
  }

  function setLocal(key, value) {
    try {
      if (
        value === null ||
        value === undefined ||
        value === ""
      ) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, String(value));
      }
    } catch (_) {}
  }

  function saveProfile(profile, authUserId) {
    if (!profile) return;

    if (authUserId) {
      setLocal("auth_user_id", authUserId);
      setLocal("supabase_auth_user_id", authUserId);
    }

    if (profile.id != null) {
      setLocal("user_id", profile.id);
      setLocal("profile_id", profile.id);
    }

    if (profile.name) {
      setLocal("name", profile.name);
      setLocal("username", profile.name);
    }

    if (profile.whatsapp_number != null) {
      setLocal(
        "whatsapp_number",
        profile.whatsapp_number
      );
    }

    setLocal(
      "account_status",
      profile.account_status || "active"
    );

    setLocal(
      "membership",
      profile.membership || "free"
    );

    setLocal(
      "package_type",
      profile.package_type || ""
    );

    setLocal(
      "expires_at",
      profile.expires_at || ""
    );

    setLocal(
      "activated_at",
      profile.activated_at || ""
    );

    setLocal(
      "paid_status",
      profile.paid_status === true
        ? "true"
        : "false"
    );

    setLocal("loggedIn", "true");
    setLocal("isLoggedIn", "true");

    try {
      localStorage.setItem(
        "profile",
        JSON.stringify(profile)
      );

      localStorage.setItem(
        "busanso_profile",
        JSON.stringify(profile)
      );
    } catch (_) {}
  }

  function getStoredProfile() {
    try {
      return JSON.parse(
        getLocal("profile") ||
        getLocal("busanso_profile") ||
        "null"
      );
    } catch (_) {
      return null;
    }
  }

  function hasLegacyIdentity() {
    return !!(
      getLocal("user_id") ||
      getLocal("profile_id") ||
      (
        getLocal("name") &&
        (
          getLocal("loggedIn") === "true" ||
          getLocal("isLoggedIn") === "true"
        )
      ) ||
      getLocal("device_id")
    );
  }

  async function getClient() {

    if (
      window.supabase &&
      typeof window.supabase.createClient ===
        "function"
    ) {

      if (
        !window.__BUSANSO_SUPABASE_CLIENT__
      ) {

        window.__BUSANSO_SUPABASE_CLIENT__ =
          window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_KEY
          );
      }

      return window.__BUSANSO_SUPABASE_CLIENT__;
    }

    return null;
  }

  async function getSession() {

    const client = await getClient();

    if (!client) return null;

    const result =
      await client.auth.getSession();

    if (result.error) {
      throw result.error;
    }

    return (
      result.data &&
      result.data.session
    )
      ? result.data.session
      : null;
  }

  async function getProfileByAuthId(
    authUserId
  ) {

    const client = await getClient();

    if (!client || !authUserId) {
      return null;
    }

    const result = await client
      .from("profiles")
      .select("*")
      .eq(
        "auth_user_id",
        authUserId
      )
      .maybeSingle();

    if (result.error) {
      throw result.error;
    }

    return result.data || null;
  }

  async function sync() {

    try {

      const session =
        await getSession();

      /* =========================
         GOOGLE / SUPABASE AUTH
         ========================= */

      if (
        session &&
        session.user
      ) {

        const profile =
          await getProfileByAuthId(
            session.user.id
          );

        if (profile) {

          saveProfile(
            profile,
            session.user.id
          );

          window.BusansoAuth.user =
            session.user;

          window.BusansoAuth.profile =
            profile;

        } else {

          /*
            Valid Google session but
            no profile found.

            NEVER sign out.
            NEVER clear localStorage.
          */

          window.BusansoAuth.user =
            session.user;

          window.BusansoAuth.profile =
            null;
        }

        window.BusansoAuth.authenticated =
          true;

        window.BusansoAuth.type =
          "supabase";

        return {
          authenticated: true,
          type: "supabase",
          user: session.user,
          profile: profile
        };
      }

      /* =========================
         LEGACY AUTH
         ========================= */

      if (
        hasLegacyIdentity()
      ) {

        const stored =
          getStoredProfile();

        if (stored) {

          saveProfile(
            stored,
            getLocal(
              "auth_user_id"
            )
          );
        }

        window.BusansoAuth.authenticated =
          true;

        window.BusansoAuth.type =
          "legacy";

        return {
          authenticated: true,
          type: "legacy",
          profile: stored
        };
      }

      /* =========================
         NO AUTH
         ========================= */

      window.BusansoAuth.authenticated =
        false;

      window.BusansoAuth.type =
        "none";

      return {
        authenticated: false,
        type: "none",
        profile: null
      };

    } catch (error) {

      console.warn(
        "BUSANSO auth bridge: session check failed.",
        error
      );

      /*
        NEVER log out a legacy user because
        Supabase temporarily fails.
      */

      if (
        hasLegacyIdentity()
      ) {

        window.BusansoAuth.authenticated =
          true;

        window.BusansoAuth.type =
          "legacy";

        return {
          authenticated: true,
          type: "legacy",
          profile:
            getStoredProfile(),
          error: error
        };
      }

      return {
        authenticated: false,
        type: "unknown",
        profile: null,
        error: error
      };
    }
  }

  async function logout() {

    const client =
      await getClient();

    if (client) {
      return client.auth.signOut();
    }
  }

  window.BusansoAuth = {

    authenticated: false,

    type: "unknown",

    user: null,

    profile: null,

    ready: null,

    sync: sync,

    getSession: getSession,

    getProfileByAuthId:
      getProfileByAuthId,

    saveProfile:
      saveProfile,

    logout:
      logout,

    hasLegacyIdentity:
      hasLegacyIdentity
  };

  /*
    Start immediately.
  */

  window.BusansoAuth.ready =
    sync();

})();
