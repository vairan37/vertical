"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { signIn } from "./actions";
import { ui } from "../ui";

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
          className={ui.field}
        />
      </label>
      {error && (
        <p role="alert" className={ui.error}>
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className={ui.primary}>
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
