import { Router } from "express";
import { createSession, getSessionUser, clearSession, setSessionCookie } from "../lib/sessionStore.js";
import { exchangeGithubCode, fetchGithubUser, persistGithubUser } from "../services/authService.js";

const router = Router();

router.get("/github/login", (_req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;

  if (!clientId) {
    res.status(500).send("Missing GITHUB_CLIENT_ID.");
    return;
  }

  const redirectUri = `${process.env.BACKEND_BASE_URL || "http://localhost:3000"}/auth/github/callback`;
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "read:user public_repo");
  res.redirect(url.toString());
});

router.get("/github/callback", async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) {
      throw new Error("Missing GitHub OAuth code.");
    }

    const tokenData = await exchangeGithubCode(String(code));
    const profile = await fetchGithubUser(tokenData.accessToken);
    const user = await persistGithubUser(profile, tokenData.scope);
    const sessionToken = await createSession(user);
    setSessionCookie(res, sessionToken);
    res.redirect(process.env.APP_BASE_URL || process.env.CLIENT_ORIGIN || "http://localhost:5173");
  } catch (error) {
    res.status(400).send(error.message || "GitHub login failed.");
  }
});

router.get("/me", async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) {
    res.json({ user: null });
    return;
  }

  res.json({
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
});

router.post("/logout", async (req, res) => {
  await clearSession(req, res);
  res.status(204).send();
});

export default router;
