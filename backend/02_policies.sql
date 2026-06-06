-- Enable Row Level Security on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE alarms ENABLE ROW LEVEL SECURITY;
ALTER TABLE wake_attempts ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- HELPER: Breaks the RLS recursion on group_members.
-- SECURITY DEFINER runs as postgres (bypasses RLS).
-- =====================================================
CREATE OR REPLACE FUNCTION is_group_member(p_group_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id
      AND user_id = p_user_id
  );
$$;

-- =========================================
-- PROFILES POLICIES
-- =========================================
-- Users can only read their own profile
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- Users can only update their own profile
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id);

-- Other users in the same group can see basic profile info (needed for member list)
-- Uses JOIN instead of nested subquery to avoid recursion with group_members
CREATE POLICY "Group members can see basic profile info" ON profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM group_members gm1
      JOIN group_members gm2 ON gm1.group_id = gm2.group_id
      WHERE gm1.user_id = auth.uid()
        AND gm2.user_id = profiles.id
    )
  );


-- =========================================
-- GROUPS POLICIES
-- =========================================
-- Users can view groups they are an owner or member of
CREATE POLICY "Users can view their groups" ON groups
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid() OR
    id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );

-- Only authenticated users can create groups (and they must be the owner)
CREATE POLICY "Users can create groups" ON groups
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

-- Only owners can update their groups
CREATE POLICY "Owners can update groups" ON groups
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id);

-- Only owners can delete their groups
CREATE POLICY "Owners can delete groups" ON groups
  FOR DELETE TO authenticated
  USING (auth.uid() = owner_id);


-- =========================================
-- GROUP MEMBERS POLICIES
-- =========================================
-- Members can view the member list of groups they belong to
-- Uses is_group_member() helper (SECURITY DEFINER) to avoid infinite recursion
CREATE POLICY "Members can view group members" ON group_members
  FOR SELECT TO authenticated
  USING (
    is_group_member(group_id, auth.uid())
  );

-- Users can add themselves to a group (join via code)
CREATE POLICY "Users can join groups" ON group_members
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can leave a group, AND owners can remove members
CREATE POLICY "Users can leave, owners can remove" ON group_members
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id OR
    auth.uid() = (SELECT owner_id FROM groups WHERE id = group_id)
  );


-- =========================================
-- ALARMS POLICIES
-- =========================================
-- Members can view alarms for their groups
CREATE POLICY "Members can view alarms" ON alarms
  FOR SELECT TO authenticated
  USING (
    group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );

-- Only admins/owners can create alarms
CREATE POLICY "Admins can create alarms" ON alarms
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = (SELECT owner_id FROM groups WHERE id = group_id)
  );

-- Only admins/owners can update alarms
CREATE POLICY "Admins can update alarms" ON alarms
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = (SELECT owner_id FROM groups WHERE id = group_id)
  );

-- Only admins/owners can delete alarms
CREATE POLICY "Admins can delete alarms" ON alarms
  FOR DELETE TO authenticated
  USING (
    auth.uid() = (SELECT owner_id FROM groups WHERE id = group_id)
  );


-- =========================================
-- WAKE ATTEMPTS POLICIES
-- =========================================
-- Members can view wake attempts for their groups (for live dashboard)
CREATE POLICY "Members can view wake attempts" ON wake_attempts
  FOR SELECT TO authenticated
  USING (
    group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );

-- Users can insert their own wake attempts
CREATE POLICY "Users can create own wake attempts" ON wake_attempts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own wake attempts (e.g., from pending to awake)
CREATE POLICY "Users can update own wake attempts" ON wake_attempts
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- =========================================
-- DEVICE TOKENS POLICIES
-- =========================================
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tokens" ON device_tokens
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tokens" ON device_tokens
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tokens" ON device_tokens
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- =========================================
-- ALARM WAKE STATUS POLICIES
-- =========================================
ALTER TABLE alarm_wake_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own status" ON alarm_wake_status
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own status" ON alarm_wake_status
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Members can view alarm statuses for their groups" ON alarm_wake_status
  FOR SELECT TO authenticated
  USING (
    group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );

