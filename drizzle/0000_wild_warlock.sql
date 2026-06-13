CREATE TABLE "reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign" text NOT NULL,
	"account" text NOT NULL,
	"handle" text NOT NULL,
	"asana_task_gid" text NOT NULL,
	"platforms" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decision_notes" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
