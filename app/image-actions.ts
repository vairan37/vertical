"use server";

import { requireAuth } from "@/lib/auth";
import { removeLibraryImage } from "@/lib/image-library";
import { UUID } from "@/lib/videos";

/** Retire une image de la bibliothèque (les vidéos déjà créées ne changent pas). */
export async function removeImage(id: string) {
  await requireAuth();
  if (!UUID.test(id)) throw new Error("Image introuvable.");
  await removeLibraryImage(id);
}
