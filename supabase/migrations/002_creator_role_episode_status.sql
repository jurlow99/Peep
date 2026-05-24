-- Add role to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'viewer'
  CHECK (role IN ('viewer', 'creator', 'admin'));

-- Add status and rejection_note to episodes table
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved'
  CHECK (status IN ('pending', 'approved', 'rejected'));
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS rejection_note TEXT;

-- Allow authenticated users to insert pending episodes (for creator uploads)
-- (Run only if RLS is enabled on episodes table)
-- CREATE POLICY "Creators can insert pending episodes"
--   ON episodes FOR INSERT TO authenticated
--   WITH CHECK (status = 'pending');
