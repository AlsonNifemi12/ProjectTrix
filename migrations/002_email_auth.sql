ALTER TABLE users
  ALTER COLUMN gitlab_id DROP NOT NULL,
  ALTER COLUMN gitlab_profile_url DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS email VARCHAR(320),
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
  ON users (LOWER(email))
  WHERE email IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_auth_identity_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_auth_identity_check
      CHECK (
        gitlab_id IS NOT NULL
        OR (email IS NOT NULL AND password_hash IS NOT NULL)
      ) NOT VALID;
  END IF;
END $$;

ALTER TABLE users VALIDATE CONSTRAINT users_auth_identity_check;
