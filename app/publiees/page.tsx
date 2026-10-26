import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { listAccounts, type AccountInfo } from "@/lib/accounts";
import { DbNotConfiguredError } from "@/lib/db";
import type { Platform } from "@/lib/db";
import { isDryRun } from "@/lib/social";
import { listVideos, PLATFORMS, type VideoWithPublications } from "@/lib/videos";
import SubmitButton from "../videos/submit-button";
import VideoGrid from "../videos/video-grid";
import { signOut } from "../login/actions";
import { disconnectAccount } from "./actions";
import ConnectButton from "./connect-button";

export const metadata: Metadata = { title: "Publiées · vertical" };

export default function PublishedPage({ searchParams }: PageProps<"/publiees">) {
  return (
    <main className="mx-auto w-full max-w-md flex-1 pb-12">
      <h1 className="p-4 pb-2 text-2xl font-bold">Publiées</h1>
      <Suspense fallback={<p className="px-4 text-zinc-400">Chargement…</p>}>
        <Notice searchParams={searchParams} />
        <PublishedContent />
      </Suspense>
      <form action={signOut} className="mt-10 px-4">
        <SubmitButton className="min-h-12 w-full rounded-xl bg-zinc-900 text-sm text-zinc-400">
          Se déconnecter de vertical
        </SubmitButton>
      </form>
    </main>
  );
}

/** Retour de connexion : « ?connecte=instagram » ou « ?erreur=… ». */
async function Notice({ searchParams }: { searchParams: PageProps<"/publiees">["searchParams"] }) {
  const params = await searchParams;
  const error = typeof params.erreur === "string" ? params.erreur : null;
  const connected = PLATFORMS.find((p) => p.id === params.connecte);
  if (!error && !connected) return null;
  return (
    <p role="status" className={`mx-4 mb-3 rounded-xl px-4 py-3 ${error ? "bg-red-950 text-red-200" : "bg-green-950 text-green-200"}`}>
      {error ?? `Compte ${connected?.label} connecté ✓`}
    </p>
  );
}

async function PublishedContent() {
  await connection();
  let items: VideoWithPublications[];
  let accounts: Partial<Record<Platform, AccountInfo>>;
  try {
    [items, accounts] = await Promise.all([listVideos(), listAccounts()]);
  } catch (error) {
    console.error("Lecture des publications impossible", error);
    return (
      <p role="alert" className="mx-4 rounded-xl bg-red-950 px-4 py-3 text-red-200">
        {error instanceof DbNotConfiguredError ? error.message : "Impossible de lire les publications."}
      </p>
    );
  }

  const published = items.filter((v) => PLATFORMS.some((p) => v.publications[p.id]?.status === "published"));
  const count = (platform: Platform) =>
    published.filter((v) => v.publications[platform]?.status === "published").length;

  return (
    <>
      {/* En-tête façon profil : comptes connectés et compteurs. */}
      <section aria-label="Comptes" className="mx-4 mb-4 flex flex-col gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
        <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-zinc-400">Comptes</h2>
        {isDryRun() && (
          <p className="rounded-lg bg-amber-950 px-3 py-2 text-sm text-amber-200">
            Mode simulation : connexions et publications sont simulées, rien n&apos;est envoyé aux réseaux.
            Pour publier pour de vrai : variable DRY_RUN=false sur Vercel (voir README).
          </p>
        )}
        {PLATFORMS.map((p) => (
          <AccountRow key={p.id} platform={p.id} label={p.label} account={accounts[p.id]} published={count(p.id)} />
        ))}
      </section>

      <VideoGrid
        items={published}
        showNew={false}
        empty={
          <p className="px-4 text-zinc-400">
            Aucune vidéo publiée pour l&apos;instant. Dans{" "}
            <Link href="/videos" className="text-sky-400 underline">Mes vidéos</Link>, ouvre une vidéo et
            touche « Marquer publiée », ou publie-la une fois les comptes connectés.
          </p>
        }
      />
    </>
  );
}

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "Europe/Paris" });

function AccountRow({
  platform,
  label,
  account,
  published,
}: {
  platform: Platform;
  label: string;
  account?: AccountInfo;
  published: number;
}) {
  // Compte connecté en simulation alors que le site publie pour de vrai (ou l'inverse) : à refaire.
  const otherMode = account ? account.simulated !== isDryRun() : false;
  const expired = (account?.expired ?? false) || otherMode;
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-xl bg-zinc-950 px-3 py-2">
      <span
        aria-hidden
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          platform === "instagram" ? "bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600" : "bg-zinc-100 text-black"
        }`}
      >
        {platform === "instagram" ? "IG" : "TT"}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold">{label}</span>
        <span className={`truncate text-sm ${account && !expired ? "text-green-400" : expired ? "text-amber-300" : "text-zinc-500"}`}>
          {!account
            ? "Non connecté"
            : otherMode
              ? account.simulated ? "Connecté en simulation : reconnecte-le" : "Vrai compte : reconnecte-le pour simuler"
              : expired
                ? "Connexion expirée"
              : (account.accountName ?? account.accountId)}
        </span>
        <span className="text-xs text-zinc-500">
          {published} vidéo{published > 1 ? "s" : ""} publiée{published > 1 ? "s" : ""}
          {account?.validUntil && !expired ? ` · connexion valable jusqu'au ${dateFormat.format(account.validUntil)}` : ""}
        </span>
      </div>
      {account && !expired ? (
        <form action={disconnectAccount.bind(null, platform)}>
          <SubmitButton className="min-h-11 rounded-lg bg-zinc-800 px-3 text-sm">Déconnecter</SubmitButton>
        </form>
      ) : (
        <ConnectButton platform={platform} again={expired} />
      )}
    </div>
  );
}
