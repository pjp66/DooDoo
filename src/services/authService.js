import { isSupabaseConfigured, supabase } from "../lib/supabase";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value) {
  return EMAIL_PATTERN.test(String(value || "").trim());
}

export function getAuthErrorMessage(error) {
  const message = error?.message || "";

  if (!message) return "요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.";
  if (message.includes("GOOGLE_AUTH_CANCELLED")) return "Google 로그인을 완료하지 않았어요.";
  if (message.includes("Invalid login credentials")) return "이메일 또는 비밀번호를 확인해주세요.";
  if (message.includes("Email not confirmed")) return "이메일 인증이 필요해요. 메일함을 확인해주세요.";
  if (message.includes("User already registered") || message.includes("already registered")) return "이미 가입된 이메일이에요.";
  if (message.includes("Password should be at least")) return "비밀번호는 6자 이상 입력해주세요.";
  if (message.includes("Invalid API key")) return "Supabase 키가 올바르지 않아요. .env 값을 확인해주세요.";
  if (message.includes("Invalid URL")) return "Supabase URL 형식이 올바르지 않아요. .env 값을 확인해주세요.";
  if (message.includes("Network request failed") || message.includes("fetch")) return "네트워크 연결을 확인해주세요.";
  if (message.includes("provider is not enabled") || message.includes("Unsupported provider")) return "Supabase에서 Google Provider 설정을 확인해주세요.";

  return "처리에 실패했어요. 입력값을 확인하고 다시 시도해주세요.";
}

function getUserProvider(user, profile) {
  return profile?.provider || user?.app_metadata?.provider || user?.user_metadata?.provider || "email";
}

function getUserNickname(user, profile) {
  return (
    profile?.nickname ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.user_metadata?.nickname ||
    user?.email?.split("@")[0] ||
    "DooDoo User"
  );
}

export function makeAppSession(user, profile) {
  const email = user?.email || profile?.email || "";
  const provider = getUserProvider(user, profile);
  const nickname = getUserNickname(user, profile);

  return {
    userId: user?.id || profile?.id || null,
    username: email,
    nickname,
    email,
    loginType: provider,
    provider
  };
}

function getOAuthRedirectUrl() {
  return AuthSession.makeRedirectUri({
    scheme: "doodoo",
    path: "auth/callback"
  });
}

export async function ensureProfile(user, nickname, providerOverride) {
  if (!isSupabaseConfigured || !supabase || !user?.id) {
    return { profile: null, error: null };
  }

  const provider = providerOverride || getUserProvider(user);
  const nextProfile = {
    id: user.id,
    email: user.email,
    nickname: nickname || getUserNickname(user),
    avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
    provider,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("profiles")
    .upsert(nextProfile, { onConflict: "id" })
    .select()
    .single();

  return { profile: data, error };
}

function getParamsFromUrl(url) {
  const query = url.includes("?") ? url.split("?")[1].split("#")[0] : "";
  const hash = url.includes("#") ? url.split("#")[1] : "";
  return new URLSearchParams(`${query}&${hash}`);
}

async function createOAuthSessionFromUrl(url) {
  const params = getParamsFromUrl(url);
  const errorDescription = params.get("error_description") || params.get("error");
  if (errorDescription) throw new Error(errorDescription);

  const code = params.get("code");
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    const { profile, error: profileError } = await ensureProfile(data.user, null, "google");
    return {
      authSession: data.session,
      user: data.user,
      appSession: makeAppSession(data.user, profile),
      profileError
    };
  }

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) {
    throw new Error("Google 로그인 응답에서 세션 정보를 찾지 못했어요.");
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken
  });
  if (error) throw error;

  const { profile, error: profileError } = await ensureProfile(data.user, null, "google");
  return {
    authSession: data.session,
    user: data.user,
    appSession: makeAppSession(data.user, profile),
    profileError
  };
}

export async function getCurrentAuthSession() {
  if (!isSupabaseConfigured || !supabase) {
    return { authSession: null, user: null, appSession: null, error: null };
  }

  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.user) {
    return { authSession: null, user: null, appSession: null, error };
  }

  const { profile } = await ensureProfile(data.session.user);
  return {
    authSession: data.session,
    user: data.session.user,
    appSession: makeAppSession(data.session.user, profile),
    error: null
  };
}

export function subscribeAuthStateChange(callback) {
  if (!isSupabaseConfigured || !supabase) return () => {};

  const { data } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
    if (!nextSession?.user) {
      callback({ authSession: null, user: null, appSession: null });
      return;
    }

    const { profile } = await ensureProfile(nextSession.user);
    callback({
      authSession: nextSession,
      user: nextSession.user,
      appSession: makeAppSession(nextSession.user, profile)
    });
  });

  return () => data.subscription.unsubscribe();
}

export async function signInWithEmail({ email, password }) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase 환경변수가 설정되지 않았어요. .env 파일을 확인해주세요.");
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password
  });

  if (error) throw error;

  const { profile, error: profileError } = await ensureProfile(data.user);
  return {
    authSession: data.session,
    user: data.user,
    appSession: makeAppSession(data.user, profile),
    profileError
  };
}

export async function signUpWithEmail({ email, password, nickname }) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase 환경변수가 설정되지 않았어요. .env 파일을 확인해주세요.");
  }

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        nickname: nickname?.trim() || email.trim().split("@")[0],
        provider: "email"
      }
    }
  });

  if (error) throw error;

  let profile = null;
  let profileError = null;
  if (data.session?.user || data.user) {
    const result = await ensureProfile(data.session?.user || data.user, nickname?.trim());
    profile = result.profile;
    profileError = result.error;
  }

  return {
    authSession: data.session,
    user: data.user,
    appSession: data.user ? makeAppSession(data.user, profile) : null,
    needsEmailConfirmation: !data.session,
    profileError
  };
}

export async function signInWithGoogle() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase 환경변수가 설정되지 않았어요. .env 파일을 확인해주세요.");
  }

  const redirectTo = getOAuthRedirectUrl();
  if (__DEV__) {
    console.log("[DooDoo] Google OAuth redirect:", redirectTo);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true
    }
  });

  if (error) throw error;
  if (!data?.url) throw new Error("Google 로그인 주소를 만들지 못했어요.");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success" || !result.url) {
    throw new Error("GOOGLE_AUTH_CANCELLED");
  }

  return createOAuthSessionFromUrl(result.url);
}

export async function signOutFromSupabase() {
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
