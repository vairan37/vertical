import type { Metadata } from "next";

export const metadata: Metadata = { title: "Conditions d'utilisation · vertical" };

/** Page publique (exigée par TikTok et Meta pour les apps de publication). */
export default function TermsPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4 pb-12 text-zinc-300">
      <h1 className="text-2xl font-bold text-foreground">Conditions d&apos;utilisation</h1>
      <p>Dernière mise à jour : 26 octobre 2026.</p>
      <p>
        vertical est un outil personnel et privé, utilisé par une seule personne (son propriétaire) pour
        créer des vidéos verticales et les publier sur ses propres comptes Instagram et TikTok. Le
        service n&apos;est pas ouvert au public : l&apos;accès est protégé par un mot de passe.
      </p>
      <p>
        L&apos;utilisateur est seul responsable des contenus qu&apos;il crée et publie, et du respect
        des conditions d&apos;Instagram, de TikTok et des droits des tiers (musiques, images).
      </p>
      <p>
        La connexion à un compte Instagram ou TikTok peut être retirée à tout moment depuis le site
        (« Déconnecter ») ou depuis les réglages de l&apos;application concernée. Le service est fourni
        tel quel, sans garantie.
      </p>
      <p lang="en" className="text-sm text-zinc-500">
        English summary: vertical is a private, single-user tool used by its owner to create vertical
        videos and post them to his own Instagram and TikTok accounts. Access is password-protected.
      </p>
    </main>
  );
}
