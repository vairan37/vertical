import type { Metadata } from "next";

export const metadata: Metadata = { title: "Politique de confidentialité · vertical" };

/** Page publique (exigée par TikTok et Meta pour les apps de publication). */
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4 pb-12 text-zinc-300">
      <h1 className="text-2xl font-bold text-foreground">Politique de confidentialité</h1>
      <p>Dernière mise à jour : 26 octobre 2026.</p>
      <p>
        vertical est un outil personnel utilisé par une seule personne, son propriétaire. Il ne collecte
        aucune donnée sur d&apos;autres personnes et n&apos;affiche aucune publicité.
      </p>
      <h2 className="font-semibold text-foreground">Données conservées</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Les vidéos créées, leurs images et leurs textes.</li>
        <li>
          Pour les comptes Instagram et TikTok connectés : l&apos;identifiant et le nom du compte, et
          les jetons d&apos;accès, chiffrés, servant uniquement à publier les vidéos et à lire leurs
          statistiques de vues.
        </li>
        <li>Le statut et les statistiques de vues des vidéos publiées.</li>
      </ul>
      <h2 className="font-semibold text-foreground">Partage et suppression</h2>
      <p>
        Aucune donnée n&apos;est vendue ni partagée, sauf l&apos;envoi des vidéos à Instagram et TikTok
        à la demande du propriétaire. Les données sont hébergées chez Vercel et Neon. « Déconnecter »
        supprime les jetons d&apos;un compte ; supprimer une vidéo efface ses fichiers.
      </p>
      <p lang="en" className="text-sm text-zinc-500">
        English summary: private, single-user tool. Only the owner&apos;s own videos and connected
        account tokens (encrypted) are stored, used solely to publish his videos and read their view
        counts. No data is sold or shared.
      </p>
    </main>
  );
}
