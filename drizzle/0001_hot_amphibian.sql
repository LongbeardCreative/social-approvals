ALTER TABLE "reviews" ADD COLUMN "copy_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "image_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "copy_notes" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "image_notes" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "copy_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "image_decided_at" timestamp with time zone;