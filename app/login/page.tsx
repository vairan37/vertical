import type { Metadata } from "next";
import { Suspense } from "react";
import LoginForm from "./login-form";

export const metadata: Metadata = { title: "Connexion · vertical" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-4">
      <h1 className="text-3xl font-bold">vertical</h1>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
