CREATE TYPE "public"."platform" AS ENUM('instagram', 'tiktok');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('pending', 'processing', 'published', 'failed');--> statement-breakpoint
CREATE TABLE "publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"status" "publication_status" DEFAULT 'pending' NOT NULL,
	"external_id" text,
	"url" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "publications_video_id_platform_unique" UNIQUE("video_id","platform")
);
--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"platform" "platform" PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"account_name" text,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text,
	"expires_at" timestamp with time zone,
	"refresh_expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"date" date NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "stats_publication_id_date_unique" UNIQUE("publication_id","date")
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"video_url" text NOT NULL,
	"download_url" text NOT NULL,
	"image_url" text NOT NULL,
	"music_name" text NOT NULL,
	"duration" real NOT NULL
);
--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stats" ADD CONSTRAINT "stats_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;