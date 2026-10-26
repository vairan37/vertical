import type { Platform } from "@/lib/db";

/** « Connecter » : part vers l'autorisation du réseau (ou la simulation, en DRY_RUN). */
export default function ConnectButton({ platform, again = false }: { platform: Platform; again?: boolean }) {
  return (
    // Lien classique (pas <Link>) : la route redirige vers un autre site.
    <a
      href={`/api/social/${platform}/connect`}
      className="flex min-h-11 items-center rounded-lg bg-white px-4 text-sm font-semibold text-black"
    >
      {again ? "Reconnecter" : "Connecter"}
    </a>
  );
}
