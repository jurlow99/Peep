-- Series-level permission; viewer preference can always disable autoplay.
ALTER TABLE public.shows ADD COLUMN IF NOT EXISTS autoplay_next boolean NOT NULL DEFAULT true;
