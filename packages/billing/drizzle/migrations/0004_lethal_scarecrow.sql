--> per-chain billing: each (wallet, chain_id) has its own credit state.
--> Order matters: drop FK + add chain_id columns (backfilling existing rows to
--> chain 1 = Ethereum via DEFAULT 1) BEFORE recreating billing_credit_state's
--> primary key as the composite (wallet, chain_id).
ALTER TABLE "billing_reservations" DROP CONSTRAINT "billing_reservations_wallet_billing_credit_state_wallet_fk";
--> statement-breakpoint
ALTER TABLE "billing_api_keys" ADD COLUMN "chain_id" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "billing_call_log" ADD COLUMN "chain_id" integer;
--> statement-breakpoint
ALTER TABLE "billing_consume_batches" ADD COLUMN "chain_id" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "billing_credit_state" ADD COLUMN "chain_id" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "billing_reservations" ADD COLUMN "chain_id" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "billing_credit_state" DROP CONSTRAINT "billing_credit_state_pkey";
--> statement-breakpoint
ALTER TABLE "billing_credit_state" ADD CONSTRAINT "billing_credit_state_wallet_chain_id_pk" PRIMARY KEY("wallet","chain_id");
