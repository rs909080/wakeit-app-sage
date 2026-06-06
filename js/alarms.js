// Module: alarms

function updateClocks() {
        const d = new Date();
        const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        const landingClock = document.getElementById('landing-clock');
        if (landingClock) landingClock.textContent = timeStr;
      }

function AlarmCard(alarm) {
        const toggleHtml = alarm.isOwner ? `
          <label class="toggle">
            <input type="checkbox" ${alarm.active ? 'checked' : ''} onchange="toggleAlarmStatus('${alarm.id}', this.checked)" />
            <span class="toggle-slider"></span>
          </label>` : '';
        return `
        <div class="alarm-card" id="alarm-${alarm.id}">
          <div>
            <div class="alarm-card-time">${alarm.time}</div>
            <div class="alarm-card-label">${alarm.group}</div>
            <div class="alarm-card-tone"><i data-lucide="bell" class="lucide-icon lucide-icon-sm icon-prefix"></i>${alarm.tone}</div>
          </div>
          ${toggleHtml}
        </div>`;
      }

async function loadHomeAlarms() {
        const uid = getCurrentUserId();
        if (!uid) return;
        const list = document.getElementById('alarm-list');
        const nextCard = document.getElementById('next-alarm-time');

        // ── CACHE-FIRST: show cached data instantly ──
        const cacheKey = `wakeit_home_cache_${uid}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          try {
            const { alarms: cachedAlarms, groupMap: cachedGroupMap } = JSON.parse(cached);
            if (cachedAlarms?.length) {
              renderHomeAlarms(cachedAlarms, cachedGroupMap, list, nextCard);
            }
          } catch (e) { /* ignore corrupt cache */ }
        }

        // Show skeleton only if no cache
        if (!cached && list) list.innerHTML = `
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>`;

        // ── FETCH FRESH from Supabase ──
        const { data: memberships } = await db.from('group_members')
          .select('group_id').eq('user_id', uid);
        if (!memberships?.length) {
          localStorage.removeItem(cacheKey);
          if (list) list.innerHTML = `<div class="empty-state">
          <div class="empty-icon"></div>
          <div class="empty-title">No alarms yet</div>
          <div class="empty-sub">Create a group and set your first alarm!</div>
        </div>`;
          return;
        }

        const groupIds = memberships.map(m => m.group_id);

        // Fetch groups and alarms IN PARALLEL — cuts load time ~50%
        const [{ data: groups }, { data: alarms }] = await Promise.all([
          db.from('groups').select('id,name,emoji,owner_id').in('id', groupIds),
          db.from('alarms').select('*').in('group_id', groupIds).eq('is_active', true).order('alarm_time', { ascending: true })
        ]);
        const groupMap = {};
        (groups || []).forEach(g => { groupMap[g.id] = g; });

        // FEATURE 2: Track which groups this user owns so triggerAlarm can skip them
        AppState.ownedGroupIds.clear();
        if (groups) {
          groups.forEach(g => {
            if (g.owner_id === uid) AppState.ownedGroupIds.add(g.id);
          });
        }

        if (!alarms?.length) {
          localStorage.removeItem(cacheKey);
          if (list) list.innerHTML = `<div class="empty-state">
          <div class="empty-icon"></div>
          <div class="empty-title">No active alarms</div>
          <div class="empty-sub">Tap + to set an alarm for your group.</div>
        </div>`;
          return;
        }

        // ── Render fresh data ──
        renderHomeAlarms(alarms, groupMap, list, nextCard);

        // ── Write to cache ──
        try { localStorage.setItem(cacheKey, JSON.stringify({ alarms, groupMap })); } catch (e) { /* quota */ }

        // Schedule all upcoming alarms locally (catches missed real-time events when app was closed)
        alarms.forEach(a => scheduleLocalAlarm(a));

        // Subscribe to new alarms in user's groups
        subscribeToGroupAlarms(groupIds);
      }

function renderHomeAlarms(alarms, groupMap, list, nextCard) {
        // Render next alarm
        const next = alarms[0];
        const nextDate = new Date(next.alarm_time);
        const nextTimeStr = nextDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        if (nextCard) nextCard.textContent = nextTimeStr;
        const nextToggle = document.getElementById('next-alarm-toggle');
        const isNextOwner = AppState.ownedGroupIds.has(next.group_id);
        if (nextToggle) {
          nextToggle.checked = next.is_active;
          nextToggle.setAttribute('data-alarm-id', next.id);
          if (nextToggle.parentElement) {
            nextToggle.parentElement.style.display = isNextOwner ? '' : 'none';
          }
        }
        const nextLabelEl = document.getElementById('next-alarm-label');
        const nextGroup = groupMap[next.group_id];
        if (nextLabelEl) nextLabelEl.textContent = `${nextGroup?.emoji || ''} ${nextGroup?.name || 'Your Group'}`;

        // Render all alarms
        if (list) list.innerHTML = alarms.map(a => {
          const g = groupMap[a.group_id];
          const timeStr = new Date(a.alarm_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
          const isOwner = AppState.ownedGroupIds.has(a.group_id);
          return AlarmCard({ id: a.id, time: timeStr, group: `${g?.emoji || ''} ${g?.name || ''}`, tone: a.tone_name || 'Default', active: a.is_active, isOwner });
        }).join('');
      }

async function toggleAlarmStatus(alarmId, isActive) {
        const { error } = await db.from('alarms').update({ is_active: isActive }).eq('id', alarmId);
        if (error) {
          showToast('Couldn\'t update alarm. Check your connection and try again.', 'error');
          loadHomeAlarms(); // Revert toggle visually
        } else {
          showToast(isActive ? 'Alarm enabled' : 'Alarm disabled', 'info');
          if (!isActive) cancelLocalNotification(alarmId);
        }
      }

async function toggleNextAlarm(isActive) {
        const toggleEl = document.getElementById('next-alarm-toggle');
        const alarmId = toggleEl?.getAttribute('data-alarm-id');
        if (!alarmId) return;
        await toggleAlarmStatus(alarmId, isActive);
      }

function initCreateAlarm() {
        AppHeader('create-alarm-header', 'New Alarm', true, '#/home', false);

        // Reset dial to current local time each visit so it never stuck at 07:30
        const nowInit = new Date();
        const rawH = nowInit.getHours();
        const rawM = nowInit.getMinutes();
        dialAMPM = rawH >= 12 ? 'PM' : 'AM';
        const h12 = rawH % 12 || 12;
        // Convert hours+mins to angle: 360° = 720 min, 0° = 12:00
        dialAngle = ((h12 * 60 + rawM) / 720) * 360;

        // Sync AM/PM pill UI
        const amBtn = document.getElementById('ampm-am');
        const pmBtn = document.getElementById('ampm-pm');
        if (amBtn) amBtn.classList.toggle('active', dialAMPM === 'AM');
        if (pmBtn) pmBtn.classList.toggle('active', dialAMPM === 'PM');

        // Reset vibration toggle to ON
        alarmVibration = true;
        const vibToggle = document.getElementById('alarm-vibration-toggle');
        if (vibToggle) vibToggle.checked = true;

        drawDialTicks();
        updateDial(dialAngle);

        // Pre-select current group in group picker
        const groupLabel = document.getElementById('alarm-group-label');
        if (groupLabel && AppState.currentGroup) {
          groupLabel.textContent = `${AppState.currentGroup.emoji || ''} ${AppState.currentGroup.name}`;
        }

        const btn = document.getElementById('btn-set-alarm');
        if (btn) btn.onclick = doSetAlarm;

        // Load live member delivery status
        loadMemberDeliveryStatus();
      }

function drawDialTicks() {
        const g = document.getElementById('dial-ticks');
        if (!g) return;
        let html = '';
        for (let i = 0; i < 12; i++) {
          const angle = (i * 30) - 90;
          const rad = angle * Math.PI / 180;
          const x1 = 140 + 108 * Math.cos(rad);
          const y1 = 140 + 108 * Math.sin(rad);
          const x2 = 140 + 118 * Math.cos(rad);
          const y2 = 140 + 118 * Math.sin(rad);
          html += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="var(--border)" stroke-width="2"/>`;
        }
        g.innerHTML = html;
      }

function updateDial(angle) {
        const rad = ((angle - 90) * Math.PI / 180);
        const knob = document.getElementById('dial-knob');
        const arc = document.getElementById('dial-arc');
        const timeEl = document.getElementById('dial-time-display');
        if (!knob || !arc || !timeEl) return;

        const x = 140 + 114 * Math.cos(rad);
        const y = 140 + 114 * Math.sin(rad);
        knob.setAttribute('cx', x.toFixed(1));
        knob.setAttribute('cy', y.toFixed(1));

        // Arc offset (circumference = 2πr = 754)
        const pct = ((angle % 360) / 360);
        arc.style.strokeDashoffset = (754 * (1 - pct)).toFixed(1);

        // Time from angle: 0° = 12:00, 30° increments = 1 hour
        const totalMins = Math.round((angle % 360) / 360 * 720);
        const hrs = Math.floor(totalMins / 60) % 12 || 12;
        const mins = totalMins % 60;
        timeEl.textContent = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
      }

function setAMPM(v) {
        dialAMPM = v;
        document.getElementById('ampm-am').classList.toggle('active', v === 'AM');
        document.getElementById('ampm-pm').classList.toggle('active', v === 'PM');
      }

function toggleAlarmHistory() {
        _historyExpanded = !_historyExpanded;
        const list = document.getElementById('alarm-history-list');
        const icon = document.getElementById('history-toggle-icon');
        if (list) list.style.display = _historyExpanded ? '' : 'none';
        if (icon) icon.style.transform = _historyExpanded ? 'rotate(180deg)' : '';

        // Load history on first expand
        if (_historyExpanded && list && !list.dataset.loaded) {
          loadAlarmHistory();
        }
      }

async function loadAlarmHistory() {
        const group = AppState.currentGroup;
        if (!group) return;
        const list = document.getElementById('alarm-history-list');
        if (!list) return;

        list.innerHTML = `<div style="text-align:center;padding:16px;"><span class="btn-spinner"></span></div>`;

        try {
          // Get past (inactive) alarms for this group, most recent first
          const { data: pastAlarms, error } = await db.from('alarms')
            .select('id, alarm_time, tone_name, is_active')
            .eq('group_id', group.id)
            .eq('is_active', false)
            .order('alarm_time', { ascending: false })
            .limit(20);

          if (error || !pastAlarms || pastAlarms.length === 0) {
            list.innerHTML = `<div class="card" style="text-align:center;padding:24px;color:var(--text-secondary);">
              <div style="font-size:28px;margin-bottom:8px;"></div>
              No past alarms yet. Set an alarm to start tracking history.
            </div>`;
            list.dataset.loaded = '1';
            return;
          }

          // Batch fetch wake attempt stats for all past alarms
          const alarmIds = pastAlarms.map(a => a.id);
          const { data: wakeAttempts } = await db.from('wake_attempts')
            .select('alarm_id, status')
            .in('alarm_id', alarmIds);

          // Build per-alarm stats
          const statsMap = {};
          (wakeAttempts || []).forEach(w => {
            if (!statsMap[w.alarm_id]) statsMap[w.alarm_id] = { awake: 0, sleeping: 0, total: 0 };
            statsMap[w.alarm_id].total++;
            if (w.status === 'awake') statsMap[w.alarm_id].awake++;
            else if (w.status === 'sleeping') statsMap[w.alarm_id].sleeping++;
          });

          renderAlarmHistory(list, pastAlarms, statsMap);
          list.dataset.loaded = '1';
        } catch (e) {
          console.error('[Wakeit] loadAlarmHistory error:', e);
          list.innerHTML = `<div style="text-align:center;padding:16px;color:var(--text-secondary);">Couldn't load history.</div>`;
        }
      }

function renderAlarmHistory(container, alarms, statsMap) {
        container.innerHTML = alarms.map(alarm => {
          const time = new Date(alarm.alarm_time);
          const timeStr = time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
          const dateStr = time.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
          const stats = statsMap[alarm.id] || { awake: 0, sleeping: 0, total: 0 };

          // Calculate success rate
          const rate = stats.total > 0 ? Math.round((stats.awake / stats.total) * 100) : 0;
          const rateColor = rate >= 80 ? '#34C759' : rate >= 50 ? '#FF9500' : '#FF453A';

          return `<div class="card" style="padding:12px 16px; margin-bottom:8px; display:flex; align-items:center; gap:12px;">
            <div style="flex-shrink:0; width:44px; height:44px; border-radius:12px;
              background:rgba(200,75,255,0.12); display:flex; align-items:center; justify-content:center;
              font-size:18px;"></div>
            <div style="flex:1; min-width:0;">
              <div style="display:flex; align-items:baseline; gap:8px;">
                <span style="font-size:16px; font-weight:700; color:var(--text-primary);">${timeStr}</span>
                <span style="font-size:11px; color:var(--text-secondary);">${dateStr}</span>
              </div>
              <div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">
                ${stats.total > 0
                  ? ` ${stats.awake} awake ·  ${stats.sleeping} sleeping · ${stats.total} total`
                  : 'No responses recorded'}
              </div>
            </div>
            ${stats.total > 0 ? `<div style="
              font-size:13px; font-weight:700; color:${rateColor};
              background:${rateColor}15; padding:4px 10px; border-radius:8px;
            ">${rate}%</div>` : ''}
          </div>`;
        }).join('');
      }

function scheduleLocalAlarm(alarm) {
        // --- DEFENSIVE ALARM VALIDATION (Phase 3 Safety System) ---
        if (!alarm) {
          console.warn('[Wakeit] Alarm scheduling ignored: alarm payload is empty');
          return;
        }
        if (!alarm.id) {
          console.warn('[Wakeit] Alarm scheduling ignored: alarm ID is missing');
          return;
        }
        if (!alarm.alarm_time) {
          console.warn('[Wakeit] Alarm scheduling ignored: alarm_time is missing for alarm ID', alarm.id);
          return;
        }
        if (!alarm.group_id) {
          console.warn('[Wakeit] Alarm scheduling ignored: group_id is missing for alarm ID', alarm.id);
          return;
        }
        if (!alarm.tone_name) {
          console.warn('[Wakeit] Alarm scheduling ignored: tone_name is missing for alarm ID', alarm.id);
          return;
        }
        if (AppState.scheduledAlarmIds.has(alarm.id)) return; // already scheduled

        const serverTimeNow = Date.now() + (window.clockOffset || 0);
        const alarmTime = new Date(alarm.alarm_time).getTime();
        const preFireBuffer = 3000; // Fire 3 seconds early for sync
        let delay = alarmTime - serverTimeNow - preFireBuffer;

        if (delay < -preFireBuffer) return; // already passed completely
        if (delay < 0) delay = 0; // if within buffer, fire immediately

        AppState.scheduledAlarmIds.add(alarm.id);

        // Preload audio ~10 seconds before ring time
        const preloadDelay = Math.max(0, delay - 10000);
        setTimeout(() => preloadAlarmAudio(alarm), preloadDelay);

        // Schedule the in-app trigger
        setTimeout(() => {
          AppState.scheduledAlarmIds.delete(alarm.id);
          triggerAlarm(alarm);
        }, delay);

        // Schedule push notification via SW (Layer 3b)
        scheduleLocalNotification(alarm);
      }

async function triggerAlarm(alarm) {
        // FEATURE 2: Admin (group creator) should never hear their own alarm
        if (alarm?.group_id) {
          if (AppState.ownedGroupIds.has(alarm.group_id)) {
            console.log('[Wakeit] Skipping alarm ring — current user is group owner for group');
            return;
          }
          const isOwner = await isGroupOwner(alarm.group_id);
          if (isOwner) {
            console.log('[Wakeit] Skipping alarm ring — current user is group owner (DB verified) for group');
            return;
          }
        }

        AppState.ringingAlarm = alarm;

        // Stop any previous audio/vibration before starting new ones
        stopAlarmAudio();

        navigate('#/alarm-ringing');

        const serverTimeNow = Date.now() + (window.clockOffset || 0);
        const targetTime = new Date(alarm.alarm_time).getTime();
        const waitTime = targetTime - serverTimeNow;

        const playActions = async () => {
          console.log('[Wakeit] Triggering alarm ring output...');
          const audioUrl = alarm.tone_url || null;

          if (audioUrl) {
            await playAlarmAudio(audioUrl);
          } else {
            // No custom tone — play the built-in Web Audio beep
            playDefaultBeep();
          }
          // Always vibrate on alarm trigger
          startAlarmVibration();
        };

        if (waitTime > 0) {
          console.log(`[Wakeit] Pre-fired! Waiting ${waitTime}ms for exact simultaneous ring...`);
          setTimeout(playActions, waitTime);
        } else {
          playActions();
        }
      }

function maxAlarmsAllowed() {
        return getUserPlanLimits()?.maxAlarms ?? 0;
      }

async function isGroupOwner(groupId) {
        const uid = getCurrentUserId();
        if (!uid) return false;
        if (AppState.ownedGroupIds.has(groupId)) return true;
        
        try {
          const { data: group } = await db.from('groups').select('owner_id').eq('id', groupId).single();
          if (group && group.owner_id === uid) {
            AppState.ownedGroupIds.add(groupId);
            return true;
          }
        } catch (e) {
          console.warn('[Wakeit] isGroupOwner check failed:', e);
        }
        return false;
      }


// Global exports for backward compatibility with inline HTML and cross-module calls
window.updateClocks = updateClocks;
window.AlarmCard = AlarmCard;
window.loadHomeAlarms = loadHomeAlarms;
window.renderHomeAlarms = renderHomeAlarms;
window.toggleAlarmStatus = toggleAlarmStatus;
window.toggleNextAlarm = toggleNextAlarm;
window.initCreateAlarm = initCreateAlarm;
window.doSetAlarm = doSetAlarm;
window.drawDialTicks = drawDialTicks;
window.updateDial = updateDial;
window.setAMPM = setAMPM;
window.toggleAlarmHistory = toggleAlarmHistory;
window.loadAlarmHistory = loadAlarmHistory;
window.renderAlarmHistory = renderAlarmHistory;
window.scheduleLocalAlarm = scheduleLocalAlarm;
window.triggerAlarm = triggerAlarm;
window.maxAlarmsAllowed = maxAlarmsAllowed;
window.isGroupOwner = isGroupOwner;
