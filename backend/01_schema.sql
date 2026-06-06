-- 1. PROFILES TABLE
-- Stores extra user data tied to Supabase Auth
CREATE TABLE profiles (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name text,
  email text,
  phone text,
  plan_type text DEFAULT 'free_trial',
  plan_expires_at timestamp with time zone,
  onesignal_id text,
  created_at timestamp with time zone DEFAULT now()
);

-- Trigger to automatically create a profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, phone)
  VALUES (
    new.id, 
    new.email, 
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 2. GROUPS TABLE
-- Stores group data, limits, and invite codes
CREATE TABLE groups (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  emoji text DEFAULT '⏰',
  invite_code text UNIQUE NOT NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  expected_members int DEFAULT 5,
  twilio_number text,
  created_at timestamp with time zone DEFAULT now()
);


-- 3. GROUP MEMBERS TABLE
-- Links users to groups they have joined
CREATE TABLE group_members (
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role text DEFAULT 'member', -- 'admin' or 'member'
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);


-- 4. ALARMS TABLE
-- Scheduled alarms for a specific group
CREATE TABLE alarms (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE,
  alarm_time timestamp with time zone NOT NULL,
  tone_name text DEFAULT 'Default',
  tone_url text,
  is_active boolean DEFAULT true,
  required_taps int DEFAULT 1,
  created_at timestamp with time zone DEFAULT now()
);


-- 5. WAKE ATTEMPTS TABLE
-- Tracks live status (sleeping/awake/pending) when an alarm rings
CREATE TABLE wake_attempts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  alarm_id uuid REFERENCES alarms(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE,
  status text DEFAULT 'pending', -- 'pending', 'awake', 'sleeping'
  updated_at timestamp with time zone DEFAULT now()
);

-- Turn on Realtime for tables that need live UI updates
alter publication supabase_realtime add table wake_attempts;
alter publication supabase_realtime add table group_members;
alter publication supabase_realtime add table alarms;
