import type { Platform } from "../db";
import { instagram } from "./instagram";
import { simulation } from "./simulation";
import { tiktok } from "./tiktok";
import type { SocialProvider } from "./types";

export { SocialError } from "./types";
export type { PublishInput, PublishState, SocialProvider, StartResult, Tokens } from "./types";

/** Simulation par défaut : rien n'est publié tant que DRY_RUN ne vaut pas exactement « false ». */
export function isDryRun() {
  return process.env.DRY_RUN !== "false";
}

export function getProvider(platform: Platform): SocialProvider {
  if (isDryRun()) return simulation(platform);
  return platform === "instagram" ? instagram : tiktok;
}

/** Identifiants « sim_ » : compte ou publication faits en simulation. */
export function isSimulated(id: string | null | undefined) {
  return Boolean(id?.startsWith("sim_"));
}
