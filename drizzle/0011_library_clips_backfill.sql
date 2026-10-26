-- Bibliothèque : reprend les clips et GIF des vidéos déjà créées.
INSERT INTO "images" ("kind", "url", "created_at", "last_used_at")
SELECT
  CASE WHEN lower("source_video_url") LIKE '%.gif' THEN 'gif' ELSE 'video' END,
  "source_video_url", MIN("created_at"), MAX("created_at")
FROM "videos"
WHERE "source_video_url" IS NOT NULL
GROUP BY "source_video_url"
ON CONFLICT ("url") DO NOTHING;
