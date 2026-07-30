import { createAsyncRouter } from "../lib/asyncHandler.js";
import {
  createSession,
  getRequestCsrfToken,
  getSessionUser,
  clearSession,
  setSessionCookie
} from "../lib/sessionStore.js";
import {
  clearOAuthStateCookie,
  consumeOAuthState,
  createOAuthState,
  OAuthStateCapacityError
} from "../lib/oauthStateStore.js";
import { createOAuthLoginRateLimiter } from "../lib/loginRateLimiter.js";
import { exchangeGithubCode, fetchGithubUser, persistGithubUser } from "../services/authService.js";
import { setPrivateNoStore } from "../lib/cacheControl.js";

const router = createAsyncRouter();
const oauthLoginRateLimiter = createOAuthLoginRateLimiter();

function privateNoStore(_req, res, next) {
  setPrivateNoStore(res);
  next();
}

router.get("/github/login", privateNoStore, oauthLoginRateLimiter, async (_req, res, next) => {
  try {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      res.status(500).send("Missing GITHUB_CLIENT_ID.");
      return;
    }

    const redirectUri = `${process.env.BACKEND_BASE_URL || "http://localhost:3000"}/auth/github/callback`;
    const url = new URL("https://github.com/login/oauth/authorize");
    const state = await createOAuthState(res);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "read:user public_repo");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  } catch (error) {
    if (error instanceof OAuthStateCapacityError) {
      res.set("Retry-After", "30");
      res.status(429).json({
        error: "OAuth login is temporarily at capacity. Try again later.",
        code: error.code
      });
      return;
    }
    next(error);
  }
});

router.get("/github/callback", async (req, res) => {
  setPrivateNoStore(res);
  try {
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const stateIsValid = await consumeOAuthState(req, state);
    clearOAuthStateCookie(res);
    if (!stateIsValid) {
      res.status(400).send("Invalid or expired OAuth state.");
      return;
    }
    const code = req.query.code;
    if (typeof code !== "string" || !code) {
      throw new Error("Missing GitHub OAuth code.");
    }

    const tokenData = await exchangeGithubCode(code);
    const profile = await fetchGithubUser(tokenData.accessToken);
    const user = await persistGithubUser(profile, tokenData.scope);
    const sessionToken = await createSession(user);
    setSessionCookie(res, sessionToken);
    res.redirect(process.env.APP_BASE_URL || process.env.CLIENT_ORIGIN || "http://localhost:5173");
  } catch (error) {
    clearOAuthStateCookie(res);
    res.status(400).send("GitHub login failed.");
  }
});

router.get("/me", async (req, res, next) => {
  try {
    setPrivateNoStore(res);
    const user = await getSessionUser(req);
    if (!user) {
      res.json({ user: null, csrfToken: null });
      return;
    }

    res.json({
      csrfToken: await getRequestCsrfToken(req),
      user: {
        id: user.id,
        login: user.login,
        name: user.name,
        avatarUrl: user.avatarUrl,
        profileUrl: user.profileUrl,
        githubScope: user.githubScope || "",
        grantedScopes: user.grantedScopes || [],
        canManageStars: Boolean(user.canManageStars)
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    await clearSession(req, res);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
