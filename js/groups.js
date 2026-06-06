// Module: groups

function MemberStatusRow(member, status, nudgeable) {
        const initials = member.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const badge = status === 'awake'
          ? `<span class="member-badge badge-awake"><i data-lucide="smile" class="lucide-icon lucide-icon-sm icon-prefix"></i>Awake</span>`
          : status === 'sleeping'
            ? `<span class="member-badge badge-sleeping"><i data-lucide="moon" class="lucide-icon lucide-icon-sm icon-prefix"></i>Sleeping</span>`
            : `<span class="member-badge badge-pending"><i data-lucide="clock" class="lucide-icon lucide-icon-sm icon-prefix"></i>Pending</span>`;
        const nudge = nudgeable && status === 'sleeping'
          ? `<button class="nudge-btn" id="nudge-${member.id}" onclick="sendNudge('${member.id}')"><i data-lucide="zap" class="lucide-icon lucide-icon-sm icon-prefix"></i>Nudge</button>`
          : '';
        return `
        <div class="member-row">
          <div class="member-avatar">${initials}</div>
          <span class="member-name">${member.name}</span>
          ${badge}
          ${nudge}
        </div>`;
      }

async function loadMemberDeliveryStatus() {
        const group = AppState.currentGroup;
        const uid = getCurrentUserId();
        const card = document.getElementById('member-status-card');
        const listEl = document.getElementById('member-status-list');
        const warningEl = document.getElementById('member-status-warning');
        if (!group || !card || !listEl) return;

        // Cleanup any previous presence channel
        if (_memberPresenceChannel) {
          _memberPresenceChannel.unsubscribe();
          _memberPresenceChannel = null;
        }

        try {
          // Fetch group members (excluding the admin/owner)
          const { data: members } = await db.from('group_members')
            .select('user_id, profiles!group_members_user_id_profiles_fkey(name, id)')
            .eq('group_id', group.id);

          if (!members || members.length === 0) {
            card.style.display = 'none';
            return;
          }

          // Filter out the admin (they set the alarm, not receive it)
          const otherMembers = members.filter(m => m.user_id !== uid);
          if (otherMembers.length === 0) {
            card.style.display = 'none';
            return;
          }

          // Check who has device tokens (reachable via FCM push)
          const uids = otherMembers.map(m => m.user_id);
          const { data: tokens } = await db.from('device_tokens')
            .select('user_id')
            .in('user_id', uids);
          const hasToken = new Set(tokens?.map(t => t.user_id) || []);

          // Render the status card
          renderMemberStatus(otherMembers, hasToken, listEl, warningEl);
          card.style.display = '';

          // Subscribe to Realtime Presence for live updates
          _memberPresenceChannel = db.channel(`presence-alarm-${group.id}`, {
            config: { presence: { key: uid } }
          });

          _memberPresenceChannel
            .on('presence', { event: 'sync' }, () => {
              const state = _memberPresenceChannel.presenceState();
              // Update live dot color based on presence
              const liveDot = document.getElementById('member-status-live-dot');
              const onlineIds = new Set(Object.keys(state));
              if (liveDot) {
                liveDot.style.background = onlineIds.size > 0 ? '#34C759' : '#FF9500';
              }
            })
            .subscribe(async (status) => {
              if (status === 'SUBSCRIBED') {
                await _memberPresenceChannel.track({ user_id: uid, online_at: new Date().toISOString() });
              }
            });

        } catch (e) {
          console.warn('[Wakeit] Member status load error:', e);
          card.style.display = 'none';
        }
      }

function renderMemberStatus(members, hasTokenSet, listEl, warningEl) {
        const reachable = [];
        const unreachable = [];

        members.forEach(m => {
          const name = m.profiles?.name || 'Member';
          if (hasTokenSet.has(m.user_id)) {
            reachable.push(name);
          } else {
            unreachable.push(name);
          }
        });

        let html = '';

        if (reachable.length > 0) {
          html += `<div style="margin-bottom:6px;">
            <span style="color:#34C759;"></span>
            <strong style="color:var(--text-primary);">${reachable.length}</strong> reachable:
            <span style="color:var(--text-primary);">${reachable.join(', ')}</span>
          </div>`;
        }

        if (unreachable.length > 0) {
          html += `<div>
            <span style="color:#FF453A;">⚠️</span>
            <strong style="color:#FF453A;">${unreachable.length}</strong> unreachable:
            <span style="color:#FF9500;">${unreachable.join(', ')}</span>
          </div>`;
        }

        listEl.innerHTML = html;

        // Show warning banner if any members are unreachable
        if (warningEl) {
          warningEl.style.display = unreachable.length > 0 ? '' : 'none';
          if (unreachable.length > 0) {
            warningEl.innerHTML = `⚠️ <strong>${unreachable.join(', ')}</strong> ${unreachable.length === 1 ? 'has' : 'have'} not enabled notifications. They may miss the alarm.`;
          }
        }
      }

async function initGroups() {
        console.log('[Wakeit] initGroups() started');
        try {
          AppHeader('groups-header', 'My Groups', false, null, false);
          BottomNav('groups-nav', 'groups');

        // Always explicitly get session to ensure Supabase client has auth token.
        const freshSession = await getSafeSession();
        if (freshSession) AppState.user = freshSession.user;
        const uid = getCurrentUserId();
        if (!uid) {
          console.warn('[Wakeit] initGroups: no user — redirecting to login');
          navigate('#/login');
          return;
        }

        const list = document.getElementById('groups-list');
        // Skeleton loader
        if (list) list.innerHTML = `
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>`;

        // Query 1: groups via membership table
        const { data: memberships, error: memErr } = await db
          .from('group_members').select('group_id').eq('user_id', uid);
        if (memErr) console.warn('[Wakeit] initGroups memberships error:', memErr.message);

        // Query 2: groups created by this user (fallback — covers cases where
        // the membership row is missing or RLS on group_members is too strict)
        const { data: ownedGroups, error: ownedErr } = await db
          .from('groups').select('*').eq('created_by', uid);
        if (ownedErr) console.warn('[Wakeit] initGroups ownedGroups error:', ownedErr.message);

        // Build a merged, deduplicated list of group IDs
        const memberGroupIds = (memberships || []).map(m => m.group_id);
        const ownedGroupIds  = (ownedGroups  || []).map(g => g.id);
        const allIds = [...new Set([...memberGroupIds, ...ownedGroupIds])];

        if (!allIds.length) {
          if (list) list.innerHTML = `<div class="empty-state">
          <div class="empty-icon"><i data-lucide="users" class="lucide-icon" style="width: 48px; height: 48px; color: var(--text-secondary); opacity: 0.5;"></i></div>
          <div class="empty-title">No groups yet</div>
          <div class="empty-sub">Create a group or join one with an invite code.</div>
        </div>`;
          window.refreshIcons();
          return;
        }

        // Fetch full group data for IDs not already loaded via ownedGroups
        const missingIds = memberGroupIds.filter(id => !ownedGroupIds.includes(id));
        let extraGroups = [];
        if (missingIds.length) {
          const { data: eg } = await db.from('groups').select('*').in('id', missingIds);
          extraGroups = eg || [];
        }
        const groups = [...(ownedGroups || []), ...extraGroups];

        if (!groups.length) {
          if (list) list.innerHTML = `<div class="empty-state">
          <div class="empty-icon"><i data-lucide="wifi-off" class="lucide-icon" style="width: 48px; height: 48px; color: var(--danger); opacity: 0.7;"></i></div>
          <div class="empty-title">Couldn't load groups</div>
          <div class="empty-sub">Check your connection and pull to refresh.</div>
        </div>`;
          window.refreshIcons();
          return;
        }

        if (list) {
          list.innerHTML = groups.map(g => `
          <div class="group-card" onclick="openGroupDetail('${g.id}')">
            <span class="group-emoji">${g.emoji || ''}</span>
            <div class="group-info">
              <div class="group-name">${g.name}</div>
              <div class="group-meta">Code: ${g.invite_code}</div>
            </div>
            <span class="group-chevron"><i data-lucide="chevron-right" class="lucide-icon lucide-icon-sm"></i></span>
          </div>`).join('');
          window.refreshIcons();
        }
        } catch(err) {
          console.error('[Wakeit] initGroups() CRASHED:', err);
          if (list) {
            list.innerHTML = `<div class="empty-state"><div class="empty-icon"><i data-lucide="alert-triangle" class="lucide-icon" style="width: 48px; height: 48px; color: var(--danger); opacity: 0.7;"></i></div><div class="empty-title">Something went wrong</div><div class="empty-sub">${err.message}</div></div>`;
            window.refreshIcons();
          }
        }
      }

async function openGroupDetail(groupId) {
        const { data: group } = await db.from('groups').select('*').eq('id', groupId).single();
        AppState.currentGroup = group;
        navigate('#/group-detail');
      }

function initCreateGroup() {
        AppHeader('create-group-header', 'New Group', true, '#/groups', false);
        // Reset form state
        const content = document.getElementById('create-group-content');
        const success = document.getElementById('group-success-state');
        const nameInput = document.getElementById('group-name-input');
        const membersInput = document.getElementById('group-members-input');
        const membersHint = document.getElementById('members-limit-hint');
        const planText = document.getElementById('members-plan-text');
        if (content) content.style.display = '';
        if (success) success.style.display = 'none';
        if (nameInput) nameInput.value = '';
        if (membersInput) membersInput.value = '';

        // Set member limit and hint dynamically based on current plan
        const planType = getPlanType() || 'none';
        const maxMem = maxMembersAllowed();
        const canCreate = canCreateGroup();
        if (membersInput) {
          membersInput.max = maxMem || 5;
          membersInput.placeholder = maxMem ? `1 – ${maxMem} members` : 'No limit on plan';
        }
        const planLabels = { free_trial: 'Free Trial', member: 'Member', admin: 'Admin', organisation: 'Organisation' };
        const planLabel = planLabels[planType] || 'Free';
        if (membersHint) {
          membersHint.textContent = canCreate
            ? `Your ${planLabel} plan allows up to ${maxMem} members.`
            : 'Member plan cannot create groups. Upgrade to Admin or Organisation.';
        }
        if (planText) {
          planText.innerHTML = canCreate
            ? `<strong style="color:var(--text-primary);">${planLabel} plan:</strong> up to <strong style="color:var(--primary);">${maxMem} members</strong> per group.`
            : `<strong style="color:#FF453A;">Member plan</strong> cannot create groups. <a href="javascript:void(0)" onclick="openModal('modal-plans')" style="color:var(--primary);">Upgrade →</a>`;
        }

        const btn = document.getElementById('btn-create-group');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="plus" class="lucide-icon lucide-icon-sm icon-prefix"></i>Create Group'; btn.onclick = doCreateGroup; }
      }

async function doCreateGroup() {
        // Prevent double-submit
        if (_creatingGroup) return;
        _creatingGroup = true;

        const btn = document.getElementById('btn-create-group');
        const originalText = btn ? btn.innerHTML : '<i data-lucide="plus" class="lucide-icon lucide-icon-sm icon-prefix"></i>Create Group';
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner" style="display:inline-block; width:16px; height:16px; border:2px solid #fff; border-bottom-color:transparent; border-radius:50%; animation: spin 1s linear infinite; vertical-align:middle; margin-right:8px;"></span>Creating…'; }
        showToast('Creating your group…', 'info');

        try {
          let name = document.getElementById('group-name-input')?.value.trim();
          if (typeof sanitizeText === 'function') name = sanitizeText(name);
          const rawMembers = document.getElementById('group-members-input')?.value;
          const expectedMembers = parseInt(rawMembers, 10);

          if (!name || name.length < 1 || name.length > 50) {
            showToast('Group name must be 1-50 characters', 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
            _creatingGroup = false; return;
          }
          if (!rawMembers || isNaN(expectedMembers) || expectedMembers < 1) {
            showToast('Enter how many members will be in this group', 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
            _creatingGroup = false; return;
          }

          // Single RPC call — handles plan checks, limits, insert, and member add
          const code = Math.random().toString(36).substring(2, 8).toUpperCase();
          console.log('[Wakeit] Calling create_group_with_member RPC...');
          const rpcResult = await db.rpc('create_group_with_member', {
            p_name: name,
            p_invite_code: code,
            p_expected_members: expectedMembers
          });
          console.log('[Wakeit] RPC returned:', rpcResult ? 'success' : 'failed');
          const { data: result, error: rpcErr } = rpcResult;

          if (rpcErr) {
            console.error('[Wakeit] Create group RPC error:', rpcErr);
            showToast(rpcErr.message || 'Failed to create group.', 'error');
            const errDiv = document.getElementById('create-group-error');
            if (errDiv) {
              errDiv.style.display = 'block';
              errDiv.innerHTML = `${rpcErr.message || 'Failed to create group.'} <button onclick="doCreateGroup()" style="margin-left:8px; padding:4px 8px; border-radius:4px; background:var(--danger); color:#fff; border:none; cursor:pointer;">Retry</button>`;
            }
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
            _creatingGroup = false; return;
          }

          // Check for server-side validation errors
          if (result?.error) {
            showToast(result.error, 'error');
            const errDiv = document.getElementById('create-group-error');
            if (errDiv) {
              errDiv.style.display = 'block';
              errDiv.innerHTML = `${result.error} <button onclick="doCreateGroup()" style="margin-left:8px; padding:4px 8px; border-radius:4px; background:var(--danger); color:#fff; border:none; cursor:pointer;">Retry</button>`;
            }
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
            _creatingGroup = false; return;
          }

          // Success!
          AppState.currentGroup = result;
          const contentEl = document.getElementById('create-group-content');
          const successEl = document.getElementById('group-success-state');
          const codeEl = document.getElementById('success-invite-code');
          if (contentEl) contentEl.style.display = 'none';
          if (successEl) successEl.style.display = '';
          if (codeEl) codeEl.textContent = result.invite_code || code;
          showToast('Group created! ', 'success');

        } catch (err) {
          console.error('[Wakeit] doCreateGroup unexpected error:', err);
          showToast('Something went wrong. Please try again.', 'error');
          const errDiv = document.getElementById('create-group-error');
          if (errDiv) {
            errDiv.style.display = 'block';
            errDiv.innerHTML = 'Something went wrong. <button onclick="doCreateGroup()" style="margin-left:8px; padding:4px 8px; border-radius:4px; background:var(--danger); color:#fff; border:none; cursor:pointer;">Retry</button>';
          }
        } finally {
          if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
          _creatingGroup = false;
        }
      }

function shareGroupCode() {
        const code = AppState.currentGroup?.invite_code
          || document.getElementById('success-invite-code')?.textContent
          || '';
        if (!code) return;
        const text = `Join my Wakeit group! Code: ${code}\nhttps://wakeit-app.vercel.app`;
        if (navigator.share) {
          navigator.share({ title: 'Join my Wakeit group!', text }).catch(() => { });
        } else {
          navigator.clipboard?.writeText(text).then(() => showToast('Invite link copied!', 'success'));
        }
      }

async function initGroupDetail() {
        const group = AppState.currentGroup;
        if (!group) { navigate('#/groups'); return; }

        AppHeader('group-detail-header', group.name, true, '#/groups', false);

        // Fill group hero
        const emojiEl = document.getElementById('group-detail-emoji');
        const nameEl = document.getElementById('group-detail-name');
        const metaEl = document.getElementById('group-detail-meta');
        const codeEl = document.getElementById('detail-invite-code');
        if (emojiEl) emojiEl.textContent = group.emoji || '';
        if (nameEl) nameEl.textContent = group.name;
        if (codeEl) codeEl.textContent = group.invite_code;

        const isAdmin = group.owner_id === getCurrentUserId();
        const memberList = document.getElementById('detail-member-list');
        const alarmList = document.getElementById('detail-alarm-list');

        // Reset alarm history state for fresh load
        _historyExpanded = false;
        const histList = document.getElementById('alarm-history-list');
        const histIcon = document.getElementById('history-toggle-icon');
        if (histList) { histList.style.display = 'none'; delete histList.dataset.loaded; }
        if (histIcon) histIcon.style.transform = '';

        // ── CACHE-FIRST: render cached group data instantly ──
        const cacheKey = `wakeit_group_cache_${group.id}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          try {
            const { members: cm, alarms: ca } = JSON.parse(cached);
            if (cm) renderGroupMembers(cm, group, isAdmin, memberList, metaEl);
            if (ca) renderGroupAlarms(ca, group, alarmList);
          } catch (e) { /* ignore corrupt cache */ }
        }

        // ── FETCH FRESH from Supabase ──
        const [{ data: members }, { data: alarms }] = await Promise.all([
          db.from('group_members').select('user_id, role, profiles!group_members_user_id_profiles_fkey(name, email)').eq('group_id', group.id),
          db.from('alarms').select('*').eq('group_id', group.id).eq('is_active', true).order('alarm_time', { ascending: true })
        ]);

        // Render fresh members
        renderGroupMembers(members, group, isAdmin, memberList, metaEl);
        // Render fresh alarms
        renderGroupAlarms(alarms, group, alarmList);

        // Write to cache
        try { localStorage.setItem(cacheKey, JSON.stringify({ members, alarms })); } catch (e) { /* quota */ }

        // Show wake dashboard button only for admin
        const wakeBtn = document.getElementById('detail-wake-btn');
        if (wakeBtn) wakeBtn.style.display = isAdmin ? '' : 'none';
        // Hide 'Set Alarm' button for non-admins to prevent RLS rejection on insert
        const setAlarmBtn = document.getElementById('detail-set-alarm-btn');
        if (setAlarmBtn) setAlarmBtn.style.display = isAdmin ? '' : 'none';

        // Feature 3: Render role-aware Leave / Delete zone
        renderGroupDangerZone(group, getCurrentUserId());

        // Live Wake Status section — shown to ALL members when an alarm is active
        await initGroupDetailLiveStatus(group);
      }

function renderGroupMembers(members, group, isAdmin, memberList, metaEl) {
        const memberCount = members?.length || 0;
        if (metaEl) metaEl.textContent = `${memberCount} member${memberCount !== 1 ? 's' : ''}`;
        if (memberList) {
          memberList.innerHTML = (members || []).map(m => {
            const prof = m.profiles;
            const n = prof?.name || 'Member';
            const initials = n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
            const isOwner = m.user_id === group.owner_id;
            const removeBtn = (isAdmin && !isOwner)
              ? `<button class="remove-member-btn" onclick="removeMember('${group.id}','${m.user_id}','${n.replace(/'/g, '&#39;')}')" title="Remove member"><i data-lucide="user-minus" class="lucide-icon lucide-icon-sm icon-prefix"></i>Remove</button>`
              : '';
            return `<div class="member-row" style="justify-content:space-between;">
              <div style="display:flex;align-items:center;gap:10px;">
                <div class="member-avatar">${initials}</div>
                <span class="member-name">${n}</span>
                ${isOwner ? '<span class="member-badge badge-admin"><i data-lucide="crown" class="lucide-icon lucide-icon-sm icon-prefix"></i>Admin</span>' : ''}
              </div>
              ${removeBtn}
            </div>`;
          }).join('');
          window.refreshIcons();
        }
      }

function renderGroupAlarms(alarms, group, alarmList) {
        if (alarmList) alarmList.innerHTML = (alarms || []).map(a => {
          const t = new Date(a.alarm_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
          return AlarmCard({ id: a.id, time: t, group: group.name, tone: a.tone_name || 'Default', active: a.is_active });
        }).join('');
      }

async function removeMember(groupId, userId, memberName) {
        if (!confirm(`Remove ${memberName} from this group?`)) return;
        // Instant visual feedback — remove from DOM immediately
        showToast(`Removing ${memberName}…`, 'info');
        const { error } = await db.from('group_members')
          .delete().eq('group_id', groupId).eq('user_id', userId);
        if (error) {
          showToast('Couldn\'t remove member. ' + friendlyError(error, 'group'), 'error');
          return;
        }
        showToast(`${memberName} removed from group.`, 'success');
        // Refresh the group detail view
        initGroupDetail();
      }

async function initGroupDetailLiveStatus(group) {
        if (!group) return;

        // Find the most recent active alarm within the last 60 minutes
        const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: recentAlarms } = await db.from('alarms')
          .select('*').eq('group_id', group.id).eq('is_active', true)
          .gte('alarm_time', cutoff)
          .order('alarm_time', { ascending: false }).limit(1);

        const activeAlarm = recentAlarms?.[0];
        const section = document.getElementById('live-status-section');
        if (!activeAlarm || !section) return;

        section.style.display = '';

        // Load and render member statuses
        await refreshGroupDetailLiveStatus(group, activeAlarm.id);

        // Subscribe to new attempts
        if (groupDetailLiveChannel) groupDetailLiveChannel.unsubscribe();
        groupDetailLiveChannel = db.channel('gd-live-' + activeAlarm.id)
          .on('postgres_changes', {
            event: 'INSERT', schema: 'public',
            table: 'wake_attempts',
            filter: `alarm_id=eq.${activeAlarm.id}`
          }, async () => {
            await refreshGroupDetailLiveStatus(group, activeAlarm.id);
          })
          .subscribe();
      }

async function refreshGroupDetailLiveStatus(group, alarmId) {
        const { data: members } = await db.from('group_members')
          .select('user_id, profiles!group_members_user_id_profiles_fkey(name)').eq('group_id', group.id);
        const { data: attempts } = await db.from('wake_attempts')
          .select('user_id, status')
          .eq('alarm_id', alarmId)
          .order('attempt_number', { ascending: false });

        // Latest status per user (first row after desc sort = most recent)
        const latestMap = {};
        (attempts || []).forEach(a => {
          if (!latestMap[a.user_id]) latestMap[a.user_id] = a.status;
        });

        const listEl = document.getElementById('live-status-list');
        if (!listEl) return;
        listEl.innerHTML = (members || []).map(m => {
          const n = m.profiles?.name || 'Member';
          const initials = n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
          const status = latestMap[m.user_id] || 'pending';
          const dotCls = status === 'awake' ? 'dot-awake' : status === 'sleeping' ? 'dot-sleeping' : 'dot-pending';
          const badge = status === 'awake'
            ? `<span class="member-badge badge-awake"><i data-lucide="smile" class="lucide-icon lucide-icon-sm icon-prefix"></i>Awake</span>`
            : status === 'sleeping'
              ? `<span class="member-badge badge-sleeping"><i data-lucide="moon" class="lucide-icon lucide-icon-sm icon-prefix"></i>Sleeping</span>`
              : `<span class="member-badge" style="background:rgba(142,142,147,0.15);color:var(--text-secondary);"><i data-lucide="clock" class="lucide-icon lucide-icon-sm icon-prefix"></i>Pending</span>`;
          return `<div class="live-status-row">
            <div class="live-status-dot ${dotCls}"></div>
            <div class="member-avatar" style="width:32px;height:32px;font-size:12px;">${initials}</div>
            <span class="member-name" style="flex:1;">${n}</span>
            ${badge}
          </div>`;
        }).join('');
        window.refreshIcons();
      }


function shareGroupCode() {
        const code = document.getElementById('success-invite-code')?.textContent || '';
        const groupName = AppState.currentGroup?.name || 'my group';
        if (navigator.share) {
          navigator.share({
            title: 'Join my Wakeit group!',
            text: `Use code ${code} to join ${groupName} on Wakeit `, url: window.location.origin
          });
        } else {
          copyToClipboard(code);
          showToast('Invite code copied! Share it now ', 'success');
        }
      }

function subscribeToGroupAlarms(groupIds) {
        groupIds.forEach(gid => {
          // ── LAYER 1: Broadcast from trigger-alarm edge function ──
          const broadcastKey = `alarm-group-${gid}`;
          if (!_activeRealtimeChannels.has(broadcastKey)) {
            _activeRealtimeChannels.add(broadcastKey);
            db.channel(broadcastKey)
              .on('broadcast', { event: 'alarm-ring' }, ({ payload }) => {
                console.log('[Wakeit L1] Broadcast alarm-ring received:', payload);
                // Deduplicate: only trigger if not already ringing this alarm
                if (AppState.ringingAlarm?.id === payload.alarm_id) return;
                triggerAlarm({
                  id: payload.alarm_id,
                  group_id: payload.group_id,
                  alarm_time: payload.alarm_time,
                  tone_name: payload.tone_name,
                  tone_url: payload.tone_url,
                });
              }).subscribe();
          }

          // ── LAYER 2: Postgres Changes for new alarm INSERTs ──
          const pgKey = `alarms-pg:${gid}`;
          if (!_activeRealtimeChannels.has(pgKey)) {
            _activeRealtimeChannels.add(pgKey);
            db.channel(pgKey)
              .on('postgres_changes', {
                event: 'INSERT', schema: 'public',
                table: 'alarms', filter: `group_id=eq.${gid}`
              }, payload => {
                console.log('[Wakeit L2] New alarm INSERT detected:', payload.new?.id);
                scheduleLocalAlarm(payload.new);
                preloadAlarmAudio(payload.new);
                showToast('New alarm synced from your group ', 'info');
                loadHomeAlarms(); // Refresh list
              }).subscribe();
          }
        });
      }

function initJoinGroup() {
        AppHeader('join-group-header', 'Join a Group', true, '#/groups', false);
        initOTPInput();

        const btn = document.getElementById('btn-join-group');
        if (btn) {
          btn.innerHTML = '<i data-lucide="user-plus" class="lucide-icon lucide-icon-sm icon-prefix"></i>Join Group';
          btn.onclick = async () => {
            const boxes = document.querySelectorAll('.otp-box');
            const code = Array.from(boxes).map(b => b.value).join('').toUpperCase();
            if (code.length < 6) { showToast('Enter the full 6-digit code', 'error'); return; }

            btn.disabled = true; btn.innerHTML = '<span class="spinner" style="display:inline-block; width:16px; height:16px; border:2px solid #fff; border-bottom-color:transparent; border-radius:50%; animation: spin 1s linear infinite; vertical-align:middle; margin-right:8px;"></span>Joining…';
            const uid = getCurrentUserId();
            if (!uid) {
              showToast('Please log in first', 'error');
              btn.disabled = false; btn.innerHTML = '<i data-lucide="user-plus" class="lucide-icon lucide-icon-sm icon-prefix"></i>Join Group';
              return;
            }

            try {
              // Single RPC call — handles invite lookup, membership check, capacity, and insert
              const { data: result, error: rpcErr } = await db.rpc('join_group_by_code', {
                p_invite_code: code
              });

              if (rpcErr) {
                console.error('[Wakeit] Join group RPC error:', rpcErr);
                showToast(rpcErr.message || 'Failed to join group.', 'error');
                btn.disabled = false; btn.innerHTML = '<i data-lucide="user-plus" class="lucide-icon lucide-icon-sm icon-prefix"></i>Join Group';
                return;
              }

              // Check for server-side validation errors
              if (result?.error) {
                showToast(result.error, 'error');
                const errEl = document.getElementById('join-error');
                if (errEl) errEl.textContent = result.error;
                btn.disabled = false; btn.innerHTML = '<i data-lucide="user-plus" class="lucide-icon lucide-icon-sm icon-prefix"></i>Join Group';
                return;
              }

              // Already a member — navigate directly
              if (result?.already_member) {
                AppState.currentGroup = result;
                navigate('#/group-detail');
                showToast('You\u2019re already in this group!', 'info');
                return;
              }

              // Success!
              AppState.currentGroup = result;
              showToast('Joined! Welcome to ' + result.name + ' ', 'success');
              notifyGroupOwner(result).catch(() => { /* silent fail */ });
              navigate('#/group-detail');
            } catch (err) {
              console.error('[Wakeit] Join group error:', err);
              showToast('Something went wrong. Please try again.', 'error');
              btn.disabled = false; btn.innerHTML = '<i data-lucide="user-plus" class="lucide-icon lucide-icon-sm icon-prefix"></i>Join Group';
            }
          };
          window.refreshIcons();
        }
      }

function renderGroupDangerZone(group, uid) {
        const dz = document.getElementById('detail-danger-zone');
        if (!dz || !group) return;
        const isAdmin = group.owner_id === uid;
        if (isAdmin) {
          dz.innerHTML = `
            <button class="btn-danger" style="width:100%;margin-bottom:var(--space-2);"
              onclick="openModal('modal-delete-group')"><i data-lucide="trash-2" class="lucide-icon lucide-icon-sm icon-prefix"></i>Delete Group</button>
            <div class="danger-text">Deleting removes all members and alarms permanently.</div>`;
        } else {
          dz.innerHTML = `
            <button class="btn-outline" style="width:100%;border-color:var(--sleeping-color);color:var(--sleeping-color);"
              onclick="openModal('modal-leave-group')"><i data-lucide="log-out" class="lucide-icon lucide-icon-sm icon-prefix"></i>Request to Leave Group</button>
            <div class="danger-text" style="margin-top:6px;">Your admin must approve before you're removed.</div>`;
        }
        window.refreshIcons();
      }

async function confirmDeleteGroup() {
        closeModal('modal-delete-group');
        const group = AppState.currentGroup;
        const uid = getCurrentUserId();
        if (!group || group.owner_id !== uid) return;

        // Instant visual feedback
        showToast('Deleting group…', 'info');
        navigate('#/groups');

        try {
          // Cascade: delete alarms, members, then the group itself
          const { data: alarms } = await db.from('alarms').select('id').eq('group_id', group.id);
          if (alarms) alarms.forEach(a => cancelLocalNotification(a.id));
          await Promise.all([
            db.from('alarms').delete().eq('group_id', group.id),
            db.from('group_members').delete().eq('group_id', group.id)
          ]);
          await db.from('groups').delete().eq('id', group.id);
          AppState.currentGroup = null;
          showToast('Group deleted. 🗑', 'info');
          // Refresh groups list
          initScreen('#/groups');
        } catch (e) {
          showToast('Couldn\'t delete group. Only the group admin can do this.', 'error');
          console.error('[Wakeit] deleteGroup error:', e);
        }
      }

function canCreateGroup() {
        return getUserPlanLimits()?.canCreate ?? false;
      }

function maxGroupsAllowed() {
        return getUserPlanLimits()?.maxGroups ?? 0;
      }

function maxMembersAllowed() {
        return getUserPlanLimits()?.maxMembers ?? 0;
      }

async function notifyGroupOwner(group) {
        if (!group?.owner_id) return;

        // Get joiner's name
        const uid = getCurrentUserId();
        const joinerName = AppState.profile?.name
          || AppState.user?.user_metadata?.name
          || 'Someone';

        // Skip if current user IS the owner
        if (uid === group.owner_id) return;

        const { data: ownerTokens } = await db.from('device_tokens')
          .select('token').eq('user_id', group.owner_id);

        if (!ownerTokens || ownerTokens.length === 0) return;

        await db.functions.invoke('send-alarm-fcm', {
          body: {
            user_ids: [group.owner_id],
            title: ' New Member!',
            body: `${joinerName} just joined ${group.name}`,
            type: 'new-member',
          }
        });
        console.log('[Wakeit] Owner notified of new member');
      }

function openGroupModal() { openModal('modal-groups'); }


// Global exports for backward compatibility with inline HTML and cross-module calls
window.MemberStatusRow = MemberStatusRow;
window.loadMemberDeliveryStatus = loadMemberDeliveryStatus;
window.renderMemberStatus = renderMemberStatus;
window.initGroups = initGroups;
window.openGroupDetail = openGroupDetail;
window.initCreateGroup = initCreateGroup;
window.doCreateGroup = doCreateGroup;
window.shareGroupCode = shareGroupCode;
window.initGroupDetail = initGroupDetail;
window.renderGroupMembers = renderGroupMembers;
window.renderGroupAlarms = renderGroupAlarms;
window.removeMember = removeMember;
window.initGroupDetailLiveStatus = initGroupDetailLiveStatus;
window.refreshGroupDetailLiveStatus = refreshGroupDetailLiveStatus;

window.shareGroupCode = shareGroupCode;
window.subscribeToGroupAlarms = subscribeToGroupAlarms;
window.initJoinGroup = initJoinGroup;
window.renderGroupDangerZone = renderGroupDangerZone;
window.confirmDeleteGroup = confirmDeleteGroup;
window.canCreateGroup = canCreateGroup;
window.maxGroupsAllowed = maxGroupsAllowed;
window.maxMembersAllowed = maxMembersAllowed;
window.notifyGroupOwner = notifyGroupOwner;
window.openGroupModal = openGroupModal;
