const menuTriggers = document.querySelectorAll(".menu-trigger");
const themeToggle = document.querySelector(".theme-toggle");
const modalOpeners = document.querySelectorAll("[data-open-modal]");
const modalClosers = document.querySelectorAll("[data-close-modal]");
const appShell = document.querySelector(".app-shell");
const authLanding = document.querySelector(".auth-landing");
const authForm = document.querySelector(".auth-form");
const authStatus = document.querySelector("[data-auth-status]");
const universeStatus = document.querySelector("[data-universe-status]");
const universeList = document.querySelector("[data-universe-list]");
const googleAuthButton = document.querySelector("[data-auth-google]");
const signOutButtons = document.querySelectorAll("[data-sign-out]");
const createUniverseButtons = document.querySelectorAll("[data-create-universe]");
const UNIVERSE_TABLE = "universes";
const SUPABASE_TIMEOUT_MS = 15000;
const DEFAULT_UNIVERSE_POSITION = { x: 120, y: 120 };
let activeModal = null;
let supabaseClient = null;
let currentAppUser = null;
let currentUserSettings = null;
let profileLoadPromise = null;

if (window.supabase && window.CENTRALIS_SUPABASE_CONFIG) {
  const { url, publishableKey } = window.CENTRALIS_SUPABASE_CONFIG;
  supabaseClient = window.supabase.createClient(url, publishableKey);
  window.centralisSupabase = supabaseClient;
} else {
  console.warn("Supabase client was not initialized.");
}

function setAuthStatus(message, type) {
  if (!authStatus) {
    return;
  }

  authStatus.textContent = message || "";
  authStatus.classList.toggle("is-error", type === "error");
  authStatus.classList.toggle("is-success", type === "success");
}

function setUniverseStatus(message, type) {
  if (!universeStatus) {
    return;
  }

  universeStatus.textContent = message || "";
  universeStatus.classList.toggle("is-error", type === "error");
  universeStatus.classList.toggle("is-success", type === "success");
}

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `universe-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createBlurb(description) {
  if (!description) {
    return "No description yet.";
  }

  const trimmed = description.trim();
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

function getReadableError(error) {
  return error?.message || error?.details || error?.hint || "Unknown error";
}

function withTimeout(promise, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${SUPABASE_TIMEOUT_MS / 1000} seconds.`));
    }, SUPABASE_TIMEOUT_MS);
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

function getAuthUrlMessage() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("error_description")) {
    return params.get("error_description");
  }

  if (params.get("error")) {
    return params.get("error");
  }

  if (window.location.hash) {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    if (hashParams.get("error_description")) {
      return hashParams.get("error_description");
    }

    if (hashParams.get("error")) {
      return hashParams.get("error");
    }
  }

  return "";
}

function cleanAuthUrl() {
  if (!window.location.search && !window.location.hash) {
    return;
  }

  const authParamNames = new Set([
    "access_token",
    "code",
    "error",
    "error_code",
    "error_description",
    "expires_at",
    "expires_in",
    "provider_token",
    "refresh_token",
    "token_type",
    "type"
  ]);
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  let removedAuthParam = false;

  authParamNames.forEach((name) => {
    if (searchParams.has(name)) {
      searchParams.delete(name);
      removedAuthParam = true;
    }

    if (hashParams.has(name)) {
      hashParams.delete(name);
      removedAuthParam = true;
    }
  });

  if (!removedAuthParam) {
    return;
  }

  const queryString = searchParams.toString();
  const hashString = hashParams.toString();
  const nextUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ""}${hashString ? `#${hashString}` : ""}`;
  window.history.replaceState({}, document.title, nextUrl);
}

function showSignedInApp() {
  if (authLanding) {
    authLanding.hidden = true;
  }

  if (appShell) {
    appShell.hidden = false;
  }
}

function showSignedOutLanding() {
  if (document.body.dataset.authRequired === "true") {
    window.location.href = "index.html";
    return;
  }

  if (appShell) {
    appShell.hidden = true;
  }

  if (authLanding) {
    authLanding.hidden = false;
  }
}

async function ensureUserProfile(authUser) {
  if (!supabaseClient || !authUser) {
    return null;
  }

  const displayName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || null;
  const avatarUrl = authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || null;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const { data: existingUser, error: findError } = await withTimeout(supabaseClient
    .from("users")
    .select("*")
    .eq("clerk_user_id", authUser.id)
    .maybeSingle(), "Loading user profile");

  if (findError) {
    throw findError;
  }

  if (existingUser) {
    const { data: updatedUser, error: updateError } = await withTimeout(supabaseClient
      .from("users")
      .update({
        email: authUser.email,
        display_name: displayName,
        avatar_url: avatarUrl,
        timezone,
        updated_at: new Date().toISOString()
      })
      .eq("id", existingUser.id)
      .select()
      .single(), "Updating user profile");

    if (updateError) {
      throw updateError;
    }

    return updatedUser;
  }

  const { data: newUser, error: createError } = await withTimeout(supabaseClient
    .from("users")
    .insert({
      clerk_user_id: authUser.id,
      email: authUser.email,
      display_name: displayName,
      avatar_url: avatarUrl,
      timezone
    })
    .select()
    .single(), "Creating user profile");

  if (createError) {
    throw createError;
  }

  return newUser;
}

async function ensureUserSettings(userId) {
  if (!supabaseClient || !userId) {
    return null;
  }

  const { data: existingSettings, error: findError } = await withTimeout(supabaseClient
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle(), "Loading user settings");

  if (findError) {
    throw findError;
  }

  if (existingSettings) {
    return existingSettings;
  }

  const { data: newSettings, error: createError } = await withTimeout(supabaseClient
    .from("user_settings")
    .insert({ user_id: userId })
    .select()
    .single(), "Creating user settings");

  if (createError) {
    throw createError;
  }

  return newSettings;
}

function applyUserSettings(settings) {
  if (!settings?.theme) {
    return;
  }

  document.body.classList.toggle("dark-mode", settings.theme === "dark");
  localStorage.setItem("centralis-theme", settings.theme);
  updateThemeLabel();
}

async function prepareSignedInUser(authUser) {
  if (profileLoadPromise) {
    return withTimeout(profileLoadPromise, "Loading user profile");
  }

  profileLoadPromise = (async () => {
  currentAppUser = await ensureUserProfile(authUser);
  currentUserSettings = await ensureUserSettings(currentAppUser.id);
  applyUserSettings(currentUserSettings);
  await loadUniverseCards();
  return currentAppUser;
  })();

  try {
    return await profileLoadPromise;
  } finally {
    profileLoadPromise = null;
  }
}

async function loadUniverseCards() {
  if (!universeList || !supabaseClient || !currentAppUser) {
    return;
  }

  universeList.innerHTML = '<p class="empty-state">Loading universes...</p>';

  try {
  const { data, error } = await withTimeout(supabaseClient
    .from(UNIVERSE_TABLE)
    .select("id,name,description,updated_at")
    .eq("user_id", currentAppUser.id)
    .order("updated_at", { ascending: false }), "Loading universes");

  if (error) {
    universeList.innerHTML = `<p class="empty-state is-error">Could not load universes: ${getReadableError(error)}</p>`;
    return;
  }

  if (!data?.length) {
    universeList.innerHTML = '<p class="empty-state">No universes yet.</p>';
    return;
  }

  universeList.innerHTML = data.map((universe) => `
    <a class="universe-card" href="universe-canvas.html?universe_id=${encodeURIComponent(universe.id)}">
      <span class="card-icon" aria-hidden="true">
        <ph-planet weight="duotone"></ph-planet>
      </span>
      <strong>${escapeHtml(universe.name || "Untitled Universe")}</strong>
      <span>${escapeHtml(createBlurb(universe.description))}</span>
    </a>
  `).join("");
  } catch (error) {
    universeList.innerHTML = `<p class="empty-state is-error">Could not load universes: ${getReadableError(error)}</p>`;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function getCurrentAppUser() {
  if (currentAppUser) {
    return currentAppUser;
  }

  if (profileLoadPromise) {
    return profileLoadPromise;
  }

  if (!supabaseClient) {
    return null;
  }

  const { data, error } = await withTimeout(supabaseClient.auth.getSession(), "Loading auth session");
  if (error || !data.session?.user) {
    return null;
  }

  return prepareSignedInUser(data.session.user);
}

async function refreshAuthView() {
  const authUrlMessage = getAuthUrlMessage();

  if (!supabaseClient) {
    if (document.body.dataset.authRequired === "true" && appShell) {
      appShell.hidden = false;
    } else {
      showSignedOutLanding();
    }
    setAuthStatus("Supabase is not available yet. Refresh the page and try again.", "error");
    return;
  }

  const { data, error } = await withTimeout(supabaseClient.auth.getSession(), "Loading auth session");
  if (error) {
    if (document.body.dataset.authRequired === "true") {
      window.location.href = "index.html";
      return;
    }

    showSignedOutLanding();
    if (authUrlMessage) {
      setAuthStatus(authUrlMessage, "error");
      openModal(document.getElementById("auth-modal"));
      cleanAuthUrl();
    }
    return;
  }

  if (data.session) {
    try {
      await prepareSignedInUser(data.session.user);
      showSignedInApp();
      cleanAuthUrl();
    } catch (profileError) {
      console.error(profileError);
      if (document.body.dataset.authRequired === "true" && appShell) {
        appShell.hidden = false;
      } else {
        showSignedOutLanding();
      }
      setAuthStatus(`Login worked, but loading your profile failed: ${getReadableError(profileError)}`, "error");
    }
    return;
  }

  if (document.body.dataset.authRequired === "true") {
    window.location.href = "index.html";
    return;
  }

  showSignedOutLanding();

  if (authUrlMessage) {
    setAuthStatus(authUrlMessage, "error");
    openModal(document.getElementById("auth-modal"));
    cleanAuthUrl();
  }
}

const savedTheme = localStorage.getItem("centralis-theme");
if (savedTheme === "dark") {
  document.body.classList.add("dark-mode");
}

function updateThemeLabel() {
  if (!themeToggle) {
    return;
  }

  const isDark = document.body.classList.contains("dark-mode");
  themeToggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
}

function closeMenus(except) {
  menuTriggers.forEach((trigger) => {
    if (trigger !== except) {
      trigger.setAttribute("aria-expanded", "false");
    }
  });
}

menuTriggers.forEach((trigger) => {
  trigger.addEventListener("click", () => {
    const isOpen = trigger.getAttribute("aria-expanded") === "true";
    closeMenus(trigger);
    trigger.setAttribute("aria-expanded", String(!isOpen));
  });
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".menu-wrap")) {
    closeMenus();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenus();
    closeModal();
  }
});

function openModal(modal) {
  if (!modal) {
    return;
  }

  activeModal = modal;
  modal.hidden = false;
  closeMenus();

  const focusTarget = modal.querySelector("input, textarea, button");
  if (focusTarget) {
    focusTarget.focus();
  }
}

function closeModal() {
  if (!activeModal) {
    return;
  }

  activeModal.hidden = true;
  activeModal = null;
}

modalOpeners.forEach((opener) => {
  opener.addEventListener("click", () => {
    openModal(document.getElementById(opener.dataset.openModal));
  });
});

modalClosers.forEach((closer) => {
  closer.addEventListener("click", closeModal);
});

document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      closeModal();
    }
  });
});

async function createUniverseFromForm(form, submitButton) {
  if (!form) {
    return;
  }

  if (submitButton) {
    submitButton.disabled = true;
  }

  setUniverseStatus("Creating universe...");

  try {
    if (!supabaseClient) {
      setUniverseStatus("Supabase is not available yet. Refresh the page and try again.", "error");
      return;
    }

    let appUser = null;
    try {
      appUser = await getCurrentAppUser();
    } catch (profileError) {
      setUniverseStatus(`Could not load your user profile: ${getReadableError(profileError)}`, "error");
      return;
    }

    if (!appUser) {
      setUniverseStatus("You need to be logged in before creating a universe.", "error");
      return;
    }

    const formData = new FormData(form);
    const name = String(formData.get("universe-name") || "").trim();
    const description = String(formData.get("universe-description") || "").trim();

    if (!name) {
      setUniverseStatus("Name is required.", "error");
      form.querySelector('[name="universe-name"]')?.focus();
      return;
    }

    const universeId = createId();
    const { error } = await withTimeout(supabaseClient
      .from(UNIVERSE_TABLE)
      .insert({
        id: universeId,
        user_id: appUser.id,
        name,
        description: description || null,
        canvas_position_x: DEFAULT_UNIVERSE_POSITION.x,
        canvas_position_y: DEFAULT_UNIVERSE_POSITION.y
      })
      , "Creating universe");

    if (error) {
      setUniverseStatus(`Could not create universe: ${getReadableError(error)}`, "error");
      return;
    }

    setUniverseStatus("Universe created.", "success");
    window.location.href = `universe-canvas.html?universe_id=${encodeURIComponent(universeId)}`;
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}

document.querySelectorAll(".universe-form").forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createUniverseFromForm(form, event.submitter);
  });
});

createUniverseButtons.forEach((button) => {
  button.addEventListener("click", async (event) => {
    event.preventDefault();

    const form = event.currentTarget.closest("form");
    if (!form) {
      return;
    }

    await createUniverseFromForm(form, event.currentTarget);
  });
});

updateThemeLabel();

if (themeToggle) {
  themeToggle.addEventListener("click", async () => {
    const isDark = document.body.classList.toggle("dark-mode");
    const theme = isDark ? "dark" : "light";
    localStorage.setItem("centralis-theme", isDark ? "dark" : "light");
    updateThemeLabel();

    if (supabaseClient && currentUserSettings) {
      const { error } = await withTimeout(supabaseClient
        .from("user_settings")
        .update({
          theme,
          updated_at: new Date().toISOString()
        })
        .eq("id", currentUserSettings.id), "Saving theme preference");

      if (!error) {
        currentUserSettings.theme = theme;
      }
    }
  });
}

if (authForm) {
  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!supabaseClient) {
      setAuthStatus("Supabase is not available yet. Refresh the page and try again.", "error");
      return;
    }

    const formData = new FormData(authForm);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const mode = event.submitter?.dataset.authMode || "login";

    setAuthStatus(mode === "signup" ? "Creating account..." : "Logging in...");

    const response = mode === "signup"
      ? await supabaseClient.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/index.html`
          }
        })
      : await supabaseClient.auth.signInWithPassword({ email, password });

    if (response.error) {
      setAuthStatus(response.error.message, "error");
      return;
    }

    if (mode === "signup" && !response.data.session) {
      setAuthStatus("Account created. Check your email to confirm your login.", "success");
      return;
    }

    try {
      await prepareSignedInUser(response.data.user);
      closeModal();
      showSignedInApp();
      setAuthStatus("");
    } catch (profileError) {
      console.error(profileError);
      setAuthStatus(`Login worked, but creating your profile/settings failed: ${getReadableError(profileError)}`, "error");
    }
  });
}

if (googleAuthButton) {
  googleAuthButton.addEventListener("click", async () => {
    if (!supabaseClient) {
      setAuthStatus("Supabase is not available yet. Refresh the page and try again.", "error");
      return;
    }

    setAuthStatus("Opening Google login...");

    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/index.html`,
        queryParams: {
          prompt: "select_account"
        },
        skipBrowserRedirect: true
      }
    });

    if (error) {
      setAuthStatus(error.message, "error");
      return;
    }

    if (!data?.url) {
      setAuthStatus("Google did not return a login URL. Check the Google provider settings in Supabase.", "error");
      return;
    }

    const authWindow = window.open(data.url, "_blank", "noopener,noreferrer");
    if (!authWindow) {
      window.location.href = data.url;
      return;
    }

    setAuthStatus("Google login opened in a new tab. Return here after signing in.", "success");
  });
}

signOutButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    }

    currentAppUser = null;
    currentUserSettings = null;
    window.location.href = "index.html";
  });
});

if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (session) {
      showSignedInApp();
      window.setTimeout(() => {
        prepareSignedInUser(session.user).catch((profileError) => {
          console.error(profileError);
          setAuthStatus(`Login worked, but loading your profile failed: ${getReadableError(profileError)}`, "error");
        });
      }, 0);
      return;
    }

    if (document.body.dataset.authRequired === "true") {
      window.location.href = "index.html";
      return;
    }

    showSignedOutLanding();
  });
}

refreshAuthView();
