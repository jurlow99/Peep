\set ON_ERROR_STOP on
BEGIN;
\ir migrations/001_schema.sql
\ir migrations/002_security.sql
COMMIT;
