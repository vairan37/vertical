/*
 * Styles partagés : la traduction des règles de design (voir CLAUDE.md, « Design »).
 * Une seule action principale par écran, des blocs simples, la couleur réservée au sens.
 */

export const ui = {
  /** Page : une colonne, marges de 16 px, place en bas pour la barre d'onglets. */
  page: "mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pt-6 pb-28",
  title: "text-2xl font-bold",
  /** Bloc de contenu. */
  card: "flex flex-col gap-3 rounded-2xl bg-zinc-900 p-4",
  /** Titre de bloc, discret. */
  label: "text-xs font-semibold uppercase tracking-wider text-zinc-400",
  field:
    "w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-base placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none",
  hint: "text-sm text-zinc-500",
  /** L'action principale de l'écran (une seule). */
  primary:
    "flex min-h-12 w-full items-center justify-center rounded-xl bg-white px-4 text-base font-semibold text-black active:bg-zinc-200 disabled:opacity-50",
  secondary:
    "flex min-h-11 items-center justify-center rounded-xl bg-zinc-800 px-4 text-sm font-semibold active:bg-zinc-700 disabled:opacity-50",
  danger:
    "flex min-h-11 items-center justify-center rounded-xl bg-red-950 px-4 text-sm font-semibold text-red-200 disabled:opacity-50",
  link: "text-sky-400 underline underline-offset-2",
  /** Choix parmi quelques options (puces). */
  chip: "flex min-h-10 shrink-0 items-center rounded-full border border-zinc-700 px-4 text-sm",
  chipOn: "flex min-h-10 shrink-0 items-center rounded-full border border-white bg-white px-4 text-sm font-semibold text-black",
  /** Messages : vert = réussi, rouge = erreur, ambre = attention. */
  ok: "rounded-xl bg-green-950 px-4 py-3 text-sm text-green-200",
  error: "rounded-xl bg-red-950 px-4 py-3 text-sm text-red-200",
  warn: "rounded-xl bg-amber-950 px-4 py-3 text-sm text-amber-200",
} as const;
