import { getPrisma } from "../lib/prisma.js";

export async function exchangeGithubCode(code) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing GitHub OAuth config.");
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "github-star-show"
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code
    })
  });

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || "GitHub OAuth exchange failed.");
  }

  return {
    accessToken: data.access_token,
    scope: data.scope || ""
  };
}

export async function fetchGithubUser(accessToken) {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "github-star-show"
    }
  });

  if (!response.ok) {
    throw new Error("Unable to fetch GitHub user profile.");
  }

  const data = await response.json();
  return {
    githubUserId: String(data.id),
    login: data.login,
    name: data.name || data.login,
    avatarUrl: data.avatar_url,
    profileUrl: data.html_url,
    accessToken
  };
}

export async function persistGithubUser(profile, scope = "") {
  const prisma = getPrisma();

  if (!prisma) {
    return {
      id: profile.githubUserId,
      dbUserId: Number(profile.githubUserId),
      login: profile.login,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      profileUrl: profile.profileUrl,
      accessToken: profile.accessToken
    };
  }

  const account = await prisma.githubAccount.upsert({
    where: { githubUserId: profile.githubUserId },
    update: {
      login: profile.login,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      profileUrl: profile.profileUrl,
      accessToken: profile.accessToken,
      scope,
      user: {
        update: {
          githubLogin: profile.login,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          profileUrl: profile.profileUrl
        }
      }
    },
    create: {
      githubUserId: profile.githubUserId,
      login: profile.login,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      profileUrl: profile.profileUrl,
      accessToken: profile.accessToken,
      scope,
      user: {
        create: {
          githubLogin: profile.login,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          profileUrl: profile.profileUrl
        }
      }
    },
    include: {
      user: true
    }
  });

  return {
    id: String(account.user.id),
    dbUserId: account.user.id,
    login: account.login,
    name: account.user.name || account.name || account.login,
    avatarUrl: account.user.avatarUrl || account.avatarUrl,
    profileUrl: account.user.profileUrl || account.profileUrl,
    accessToken: account.accessToken
  };
}
