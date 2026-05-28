-- Rename "movies" → "shorts" in carousel page filters and content_type
UPDATE carousels
  SET pages = REPLACE(pages, 'movies', 'shorts')
  WHERE pages LIKE '%movies%';

UPDATE carousels
  SET content_type = 'shorts'
  WHERE content_type = 'movies';

-- Rename "movie" → "short" in EPG entries content_type
UPDATE epg_entries
  SET content_type = 'short'
  WHERE content_type = 'movie';

-- Rename "movie" → "short" in ads scope
UPDATE ads
  SET scope = 'short'
  WHERE scope = 'movie';
