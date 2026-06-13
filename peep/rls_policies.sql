-- ── RLS Policies for Peep ──────────────────────────────────────────────────
--
-- Run this in the Supabase SQL editor.
-- If prompted about RLS, click "Run without RLS".
--
-- IMPORTANT: Admin write policies require role = 'admin' (or legacy is_admin = true).
-- To make your account admin, run:
--   UPDATE profiles SET role = 'admin', is_admin = true WHERE id = '<your-auth-user-id>';
-- ───────────────────────────────────────────────────────────────────────────

-- Helper function — checks if the current user is an admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND (role = 'admin' OR is_admin = true)
  );
$$;


-- ── Content Tables ──────────────────────────────────────────────────────────
-- Subscribers can read, only admins can write

ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON videos FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin write" ON videos FOR ALL USING (is_admin()) WITH CHECK (is_admin());

ALTER TABLE shows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON shows FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin write" ON shows FOR ALL USING (is_admin()) WITH CHECK (is_admin());

ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON episodes FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin write" ON episodes FOR ALL USING (is_admin()) WITH CHECK (is_admin());

ALTER TABLE music_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON music_videos FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin write" ON music_videos FOR ALL USING (is_admin()) WITH CHECK (is_admin());

ALTER TABLE songs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON songs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin write" ON songs FOR ALL USING (is_admin()) WITH CHECK (is_admin());

ALTER TABLE albums ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON albums FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin write" ON albums FOR ALL USING (is_admin()) WITH CHECK (is_admin());

ALTER TABLE podcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON podcasts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin write" ON podcasts FOR ALL USING (is_admin()) WITH CHECK (is_admin());

ALTER TABLE podcast_episodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON podcast_episodes FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin write" ON podcast_episodes FOR ALL USING (is_admin()) WITH CHECK (is_admin());

ALTER TABLE live_streams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON live_streams FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin write" ON live_streams FOR ALL USING (is_admin()) WITH CHECK (is_admin());


-- ── Platform Tables ─────────────────────────────────────────────────────────

ALTER TABLE carousels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON carousels FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin write" ON carousels FOR ALL USING (is_admin()) WITH CHECK (is_admin());

ALTER TABLE epg_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON epg_entries FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin write" ON epg_entries FOR ALL USING (is_admin()) WITH CHECK (is_admin());

ALTER TABLE epg_channel_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON epg_channel_sources FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin write" ON epg_channel_sources FOR ALL USING (is_admin()) WITH CHECK (is_admin());


-- ── User Data Tables ────────────────────────────────────────────────────────
-- Users can only access their own rows

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read all" ON profiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Own update" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Own insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

ALTER TABLE viewer_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own data" ON viewer_profiles FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own read" ON subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admin all" ON subscriptions FOR ALL USING (is_admin()) WITH CHECK (is_admin());

ALTER TABLE watch_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own data" ON watch_progress FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin read" ON watch_progress FOR SELECT USING (is_admin());

ALTER TABLE user_list ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own data" ON user_list FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own data" ON ratings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ── Live TV ─────────────────────────────────────────────────────────────────

ALTER TABLE live_viewers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read all" ON live_viewers FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Own insert" ON live_viewers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own update" ON live_viewers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Own delete" ON live_viewers FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE live_chat ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON live_chat FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Own insert" ON live_chat FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin delete" ON live_chat FOR DELETE USING (is_admin());

ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own data" ON user_presence FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ── Ads ──────────────────────────────────────────────────────────────────────

ALTER TABLE vast_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON vast_tags FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin write" ON vast_tags FOR ALL USING (is_admin()) WITH CHECK (is_admin());

ALTER TABLE ad_impressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own insert" ON ad_impressions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin read" ON ad_impressions FOR SELECT USING (is_admin());


-- ── Creators & Payouts ───────────────────────────────────────────────────────
-- Admin only

ALTER TABLE creators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin only" ON creators FOR ALL USING (is_admin()) WITH CHECK (is_admin());

ALTER TABLE content_creators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin only" ON content_creators FOR ALL USING (is_admin()) WITH CHECK (is_admin());

ALTER TABLE creator_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin only" ON creator_payouts FOR ALL USING (is_admin()) WITH CHECK (is_admin());


-- ── Admin Tables ─────────────────────────────────────────────────────────────

-- app_settings: public read (needed before auth for maintenance_mode + beta_code)
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON app_settings FOR SELECT USING (true);
CREATE POLICY "Admin write" ON app_settings FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- promo_codes: authenticated users need to validate codes at signup
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON promo_codes FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin write" ON promo_codes FOR ALL USING (is_admin()) WITH CHECK (is_admin());

ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin only" ON blocked_users FOR ALL USING (is_admin()) WITH CHECK (is_admin());

ALTER TABLE admin_login_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin only" ON admin_login_attempts FOR ALL USING (is_admin()) WITH CHECK (is_admin());
