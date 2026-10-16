-- 2026-10-16 · Google sign-in (D-045): allow 'google' as a login method. Idempotent. Run BEFORE deploying the Google sign-in web code.
ALTER TABLE logins DROP CONSTRAINT IF EXISTS logins_method_check;
ALTER TABLE logins ADD CONSTRAINT logins_method_check CHECK (method IN ('discord', 'email', 'google'));
