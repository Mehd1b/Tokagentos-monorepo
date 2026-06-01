CREATE TABLE "billing_credit_backing" (
	"wallet" text NOT NULL,
	"chain_id" integer NOT NULL,
	"amount" numeric(78, 0) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "billing_credit_backing_wallet_chain_id_pk" PRIMARY KEY("wallet","chain_id")
);
--> statement-breakpoint
-- Backfill: attribute every existing wallet's current credit balance to chain 1
-- (Ethereum mainnet — the canonical primary where the live PTON/vault run).
-- Idempotent (ON CONFLICT DO NOTHING); a no-op on fresh databases. Operators
-- whose primary chain is not Ethereum should re-attribute after migrating.
INSERT INTO "billing_credit_backing" ("wallet", "chain_id", "amount", "updated_at")
SELECT "wallet", 1, "balance", now()
FROM "billing_credit_state"
WHERE "balance" > 0
ON CONFLICT ("wallet", "chain_id") DO NOTHING;
