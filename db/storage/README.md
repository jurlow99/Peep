# Storage configuration

- [VOD sources and protected playback](VOD.md) — private originals and finished movie/episode delivery.
- Promo artwork configuration follows below.

# Promo artwork storage

Configured in FARRIS development (`peep-dev`, `cuwdyedmmnpklufduaho`).

- Bucket: `promo-images`; public delivery was approved by the owner on October 21, 2026.
- Public URLs do not expire. Anyone with a URL can download its image.
- JPEG, PNG, WebP only; maximum 5 MiB per file. Do not store private files or VOD here.
- Authenticated admins may upload, select, and update artwork in `hero/`.
- Admin status comes from `public.profiles.role` through the existing `peep_private.is_admin()` helper.
- Anonymous users and non-admin accounts cannot upload or replace artwork or list the bucket.
- Deletion is deliberately not granted to client accounts. Superseded artwork is retained so old links keep working.
- The uploader uses unique filenames with `upsert: false`, avoiding stale CDN images when replacing a promo.

The web admin Home Hero and show hero uploaders use this bucket in development and save public URLs. Browser, Apple TV, and future clients consume the same saved URL. Production storage configuration is unchanged.

Applied server migrations: `private_promo_images_admin_uploads` and `permanent_public_promo_artwork`. These are recorded in Supabase migration history. The first creates the bucket and admin INSERT/SELECT policies; the second enables public delivery and adds admin UPDATE with both USING and WITH CHECK restrictions.

Verified: unauthenticated download matches the source JPEG SHA-256; anonymous listing and INSERT are denied; authenticated admin upload works through the editor. Existing demo links were converted from signed URLs to public URLs.

Reference: https://supabase.com/docs/guides/storage/buckets/fundamentals
