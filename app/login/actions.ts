"use server";

import { redirect } from "next/navigation";
import { login, logout } from "@/lib/auth";

/** Renvoie un message d'erreur, ou redirige vers la page demandée une fois connecté. */
export async function signIn(_previous: string | null, form: FormData): Promise<string | null> {
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "");
  let error: string | null;
  try {
    error = await login(password);
  } catch (e) {
    console.error("Connexion impossible", e);
    return "Connexion impossible pour le moment (base de données injoignable ?).";
  }
  if (error) return error;
  // Uniquement un chemin interne (pas de redirection vers un autre site).
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function signOut() {
  await logout();
  redirect("/login");
}
