"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function Logo({ size = 44 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-xl bg-brand font-bold tracking-tight text-white"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      LC
    </div>
  );
}

const errorText = (msg: string) => {
  if (/invalid login credentials/i.test(msg)) return "Неверная почта или пароль.";
  if (/email not confirmed/i.test(msg)) return "Подтвердите почту: письмо со ссылкой уже отправлено.";
  if (/already registered/i.test(msg)) return "Этот email уже зарегистрирован. Войдите.";
  if (/password should be at least/i.test(msg)) return "Пароль должен содержать минимум 8 символов.";
  if (/rate limit/i.test(msg)) return "Слишком много попыток. Подождите немного и повторите.";
  return msg;
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();

    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(errorText(error.message));
        setBusy(false);
        return;
      }
      router.replace("/");
      router.refresh();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(errorText(error.message));
      setBusy(false);
      return;
    }
    if (data.session) {
      router.replace("/");
      router.refresh();
      return;
    }
    setInfo("Мы отправили письмо со ссылкой подтверждения. Перейдите по ней, затем войдите.");
    setMode("in");
    setBusy(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="lc-pop w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={52} />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Leadership Council Cloud</h1>
          <p className="mt-1 text-sm text-muted">Общее хранилище Совета лидеров</p>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <div className="mb-5 grid grid-cols-2 rounded-lg bg-surface p-1 text-sm font-medium">
            {(["in", "up"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`rounded-md py-1.5 transition ${
                  mode === m ? "bg-white shadow-sm" : "text-muted hover:text-ink"
                }`}
              >
                {m === "in" ? "Вход" : "Регистрация"}
              </button>
            ))}
          </div>

          {mode === "up" && (
            <label className="mb-3 block text-sm">
              <span className="mb-1 block font-medium">Имя</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                className="w-full rounded-lg border border-line px-3 py-2 outline-none transition focus:border-brand"
                placeholder="Как вас зовут"
              />
            </label>
          )}

          <label className="mb-3 block text-sm">
            <span className="mb-1 block font-medium">Почта</span>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full rounded-lg border border-line px-3 py-2 outline-none transition focus:border-brand"
              placeholder="you@example.com"
            />
          </label>

          <label className="mb-4 block text-sm">
            <span className="mb-1 block font-medium">Пароль</span>
            <input
              required
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "in" ? "current-password" : "new-password"}
              className="w-full rounded-lg border border-line px-3 py-2 outline-none transition focus:border-brand"
              placeholder="Минимум 8 символов"
            />
          </label>

          {error && (
            <p role="alert" className="mb-3 rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand-dark">
              {error}
            </p>
          )}
          {info && (
            <p role="status" className="mb-3 rounded-lg bg-surface px-3 py-2 text-sm text-ink">
              {info}
            </p>
          )}

          <button
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "in" ? "Войти" : "Создать аккаунт"}
          </button>
        </form>
      </div>
    </main>
  );
}
