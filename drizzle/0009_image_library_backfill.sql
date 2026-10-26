-- Bibliothèque d'images : reprend les photos des vidéos déjà créées (pas les clips, dont
-- l'« image source » est la couverture). Date = celle de la vidéo la plus récente.
INSERT INTO "images" ("url", "created_at", "last_used_at")
SELECT "image_url", MIN("created_at"), MAX("created_at")
FROM "videos"
WHERE "source_video_url" IS NULL
GROUP BY "image_url"
ON CONFLICT ("url") DO NOTHING;
