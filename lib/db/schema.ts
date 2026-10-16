import {
  date,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const platform = pgEnum("platform", ["instagram", "tiktok"]);
export const publicationStatus = pgEnum("publication_status", [
  "pending", // en attente d'envoi
  "processing", // envoyée, en cours de traitement par la plateforme
  "published", // en ligne
  "failed", // échec (voir error), relançable
]);

export type Platform = (typeof platform.enumValues)[number];
export type PublicationStatus = (typeof publicationStatus.enumValues)[number];

export const videos = pgTable("videos", {
  id: uuid("id").primaryKey().defaultRandom(),
  text: text("text").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  videoUrl: text("video_url").notNull(),
  downloadUrl: text("download_url").notNull(),
  imageUrl: text("image_url").notNull(),
  musicName: text("music_name").notNull(),
  duration: real("duration").notNull(),
});

/** Une ligne par vidéo et par plateforme : une relance réutilise la même ligne. */
export const publications = pgTable(
  "publications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    platform: platform("platform").notNull(),
    status: publicationStatus("status").notNull().default("pending"),
    externalId: text("external_id"),
    url: text("url"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [unique().on(t.videoId, t.platform)],
);

export const stats = pgTable(
  "stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    views: integer("views").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
  },
  (t) => [unique().on(t.publicationId, t.date)],
);

/** Tokens chiffrés (AES-256-GCM) avant stockage : jamais en clair en base. */
export const socialAccounts = pgTable("social_accounts", {
  platform: platform("platform").primaryKey(),
  accountId: text("account_id").notNull(),
  accountName: text("account_name"),
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
