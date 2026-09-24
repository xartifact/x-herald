-- Preserve the provider-side changes for same-protocol requests and responses.
-- The guards make this safe to re-run against partially migrated databases.
DO $$
BEGIN
  IF to_regclass('request_attempts') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_name = 'request_attempts'
         AND column_name = 'transformed_request_diff'
     ) THEN
    ALTER TABLE "request_attempts"
      ADD COLUMN "transformed_request_diff" jsonb;
  END IF;

  IF to_regclass('request_attempts') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_name = 'request_attempts'
         AND column_name = 'provider_response_diff'
     ) THEN
    ALTER TABLE "request_attempts"
      ADD COLUMN "provider_response_diff" jsonb;
  END IF;
END $$;
