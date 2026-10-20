\set ON_ERROR_STOP on
BEGIN;
\ir migrations/001_schema.sql
\ir migrations/002_security.sql
\ir migrations/003_private_helpers.sql
COMMIT;
