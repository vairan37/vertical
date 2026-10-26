"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { signIn } from "./actions";

export default function LoginForm() {
  const next = useSearchParams().get("next") ?? "/";
  const [error, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-2">
        <span className="font-semibold">Mot de passe</span>
        <input
          type="password"
          name="password"
          required
          autoFocus
          autoComplete="current-password"
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-base"
        />
      </label>
      {error && (
        <p role="alert" className="rounded-xl bg-red-950 px-4 py-3 text-red-200">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className="min-h-12 rounded-xl bg-white font-semibold text-black disabled:opacity-50">
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
