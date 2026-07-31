-- Creator Revenue Share System Migration
-- Run this in Supabase SQL Editor

-- 1. Creators table
CREATE TABLE IF NOT EXISTS creators (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  referral_code TEXT NOT NULL UNIQUE,
  rev_share_percentage INTEGER DEFAULT 50,
  payment_method TEXT DEFAULT 'PayPal',
  payment_handle TEXT,
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Payout records (one row per creator per month once processed)
CREATE TABLE IF NOT EXISTS creator_payouts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID REFERENCES creators(id) ON DELETE SET NULL,
  creator_name TEXT NOT NULL,
  referral_code TEXT NOT NULL,
  month TEXT NOT NULL,
  attributed_subscribers INTEGER DEFAULT 0,
  lifetime_subscribers INTEGER DEFAULT 0,
  revenue NUMERIC(10,2) DEFAULT 0,
  platform_cut NUMERIC(10,2) DEFAULT 0,
  payout_amount NUMERIC(10,2) DEFAULT 0,
  rev_share_percentage INTEGER DEFAULT 50,
  status TEXT DEFAULT 'unpaid',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(creator_id, month)
);

-- 3. Add referred_by to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by TEXT;

-- 4. Index for fast referral lookups
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON profiles(referred_by);
CREATE INDEX IF NOT EXISTS idx_creator_payouts_month ON creator_payouts(month);
