// Module: audio

function toggleVibration(checked) {
        alarmVibration = checked;
        // Give a quick native vibration feedback when turning ON
        if (checked && navigator.vibrate) navigator.vibrate(80);
      }

function synthesiseTone(id) {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const cfg = {
          beep: { type: 'sine', freq: 880, dur: 0.4, gap: 0.1, reps: 3 },
          birds: { type: 'sine', freq: 660, dur: 0.25, gap: 0.08, reps: 5 },
          rise: { type: 'triangle', freq: 440, dur: 1.2, gap: 0.3, reps: 2 },
          buzz: { type: 'square', freq: 220, dur: 0.15, gap: 0.05, reps: 6 },
        };
        const c = cfg[id] || cfg.beep;
        let t = ctx.currentTime + 0.05;
        for (let i = 0; i < c.reps; i++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = c.type;
          if (id === 'birds') osc.frequency.setValueAtTime(c.freq + i * 40, t);
          else if (id === 'rise') osc.frequency.linearRampToValueAtTime(c.freq * 2, t + c.dur);
          else osc.frequency.setValueAtTime(c.freq, t);
          gain.gain.setValueAtTime(0.4, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + c.dur);
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(t); osc.stop(t + c.dur);
          t += c.dur + c.gap;
        }
      }

function initTonePicker() {
        AppHeader('tone-picker-header', 'Choose Tone', true, '#/create-alarm', false);
        // Restore previously selected tone label
        const nameEl = document.getElementById('selected-tone-name');
        if (nameEl && AppState.selectedTone) {
          nameEl.textContent = AppState.selectedTone.name;
        }
        // Reflect which built-in tone is active
        const builtinNames = { beep: 'Classic Beep', birds: 'Morning Birds', rise: 'Gentle Rise', buzz: 'Digital Buzz' };
        if (AppState.selectedTone?.type === 'builtin') {
          selectTone(AppState.selectedTone.id, false);
        }
        // Load user's previously uploaded / recorded tones
        loadCustomTones();
      }

async function loadCustomTones() {
        const listEl = document.getElementById('custom-tones-list');
        if (!listEl) return;

        const uid = getCurrentUserId();
        if (!uid) {
          listEl.innerHTML = `<div style="padding:14px 16px; color:var(--text-secondary); font-size:13px; display:flex; align-items:center; gap:8px;"><i data-lucide="lock" class="lucide-icon lucide-icon-sm" style="color:var(--text-secondary);"></i>Log in to see your saved tones.</div>`;
          window.refreshIcons();
          return;
        }

        // Show loading skeleton
        listEl.innerHTML = `<div class="skeleton-card" style="height:32px; margin: 8px;"></div><div class="skeleton-card" style="height:32px; margin: 8px;"></div>`;

        try {
          const { data: files, error } = await db.storage.from('alarm-tones').list(uid + '/', {
            limit: 50, offset: 0, sortBy: { column: 'created_at', order: 'desc' }
          });

          if (error) throw error;

          if (!files || files.length === 0) {
            listEl.innerHTML = `<div style="padding:14px 16px; color:var(--text-secondary); font-size:13px; text-align:center; display:flex; flex-direction:column; align-items:center; gap:8px;"><i data-lucide="music" class="lucide-icon" style="width:24px;height:24px;color:var(--text-secondary);opacity:0.6;"></i>No saved tones yet. Upload or record your first one</div>`;
            window.refreshIcons();
            return;
          }

          // Determine icon: voice notes vs uploaded audio
          listEl.innerHTML = files.map(f => {
            const isVoice = f.name.includes('voicenote') || f.name.endsWith('.webm');
            const icon = isVoice 
              ? '<i data-lucide="mic" class="lucide-icon lucide-icon-sm" style="color:var(--primary);"></i>' 
              : '<i data-lucide="music-2" class="lucide-icon lucide-icon-sm" style="color:var(--text-secondary);"></i>';
            const rawName = f.name.replace(/^\d+_/, '').replace(/\.[^/.]+$/, ''); // strip timestamp prefix and extension
            const displayName = decodeURIComponent(rawName).replace(/_/g, ' ');
            const path = `${uid}/${f.name}`;
            const isSelected = AppState.selectedTone?.url?.includes(encodeURIComponent(f.name));
            return `
              <div class="tone-row" id="cust-tone-${f.id || f.name}" onclick="selectCustomTone('${path}', '${displayName}', '${f.id || f.name}')" style="cursor:pointer;">
                <span class="tone-icon" style="display:flex; align-items:center; justify-content:center;">${icon}</span>
                <span class="tone-name" style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${displayName}</span>
                <span id="cust-check-${f.id || f.name}" style="color:var(--primary); opacity:${isSelected ? 1 : 0}; display:inline-flex; align-items:center;"><i data-lucide="check" class="lucide-icon lucide-icon-sm"></i></span>
              </div>`;
          }).join('');
          window.refreshIcons();

        } catch (e) {
          console.error('[Wakeit] loadCustomTones error:', e);
          listEl.innerHTML = `<div style="padding:14px 16px; color:var(--danger); font-size:13px; display:flex; align-items:center; gap:8px;"><i data-lucide="alert-circle" class="lucide-icon lucide-icon-sm" style="color:var(--danger);"></i>Could not load tones: ${e.message}</div>`;
          window.refreshIcons();
        }
      }

function selectCustomTone(storagePath, displayName, fileId) {
        // Clear all custom tone checkmarks
        document.querySelectorAll('[id^="cust-check-"]').forEach(el => el.style.opacity = '0');
        // Clear default tone checkmarks
        document.querySelectorAll('[id^="tone-check-"]').forEach(el => el.style.opacity = '0');

        // Highlight selected
        const check = document.getElementById('cust-check-' + fileId);
        if (check) check.style.opacity = '1';

        // Resolve public URL for the file
        const { data: urlData } = db.storage.from('alarm-tones').getPublicUrl(storagePath);
        const publicUrl = urlData?.publicUrl || '';

        AppState.selectedTone = { name: displayName, type: 'upload', url: publicUrl };
        const nameEl = document.getElementById('selected-tone-name');
        if (nameEl) nameEl.textContent = ' ' + displayName;
        showToast('Tone selected: ' + displayName, 'success');
      }

function selectTone(id, updateState = true) {
        document.querySelectorAll('[id^="tone-check-"]').forEach(el => el.style.opacity = '0');
        const el = document.getElementById('tone-check-' + id);
        if (el) el.style.opacity = '1';
        currentTone = id;
        const names = { beep: 'Classic Beep', birds: 'Morning Birds', rise: 'Gentle Rise', buzz: 'Digital Buzz' };
        const label = names[id] || id;
        const nameEl = document.getElementById('selected-tone-name');
        if (nameEl) nameEl.textContent = label;
        if (updateState) {
          AppState.selectedTone = { id, name: label, type: 'builtin', url: null };
        }
        stopTonePreview();
      }

function previewTone(id) {
        stopTonePreview();
        // Reset all play buttons
        document.querySelectorAll('[id^="tone-play-"]').forEach(b => {
          b.innerHTML = '<i data-lucide="play" class="lucide-icon lucide-icon-sm"></i>';
          b.style.color = '';
        });
        const btn = document.getElementById('tone-play-' + id);
        if (btn) {
          btn.innerHTML = '<i data-lucide="square" class="lucide-icon lucide-icon-sm"></i>';
          btn.style.color = 'var(--primary)';
        }
        // Synthesise and auto-reset button after tone ends
        const durations = { beep: 1.7, birds: 1.8, rise: 3.0, buzz: 1.5 };
        synthesiseTone(id);
        window.refreshIcons();
        tonePreviewAudio = setTimeout(() => {
          if (btn) {
            btn.innerHTML = '<i data-lucide="play" class="lucide-icon lucide-icon-sm"></i>';
            btn.style.color = '';
            window.refreshIcons();
          }
          tonePreviewAudio = null;
        }, (durations[id] || 2) * 1000);
      }

function stopTonePreview() {
        if (tonePreviewAudio) {
          clearTimeout(tonePreviewAudio);
          tonePreviewAudio = null;
        }
        document.querySelectorAll('[id^="tone-play-"]').forEach(b => {
          b.innerHTML = '<i data-lucide="play" class="lucide-icon lucide-icon-sm"></i>';
          b.style.color = '';
        });
        window.refreshIcons();
      }

async function cacheTone(url) {
        try {
          const cache = await caches.open('wakeit-tones');
          await cache.add(url);
        } catch (e) { /* offline / unsupported — silent fail */ }
      }

function useToneAndBack() {
        // If nothing custom selected, persist the built-in
        if (!AppState.selectedTone) {
          const names = { beep: 'Classic Beep', birds: 'Morning Birds', rise: 'Gentle Rise', buzz: 'Digital Buzz' };
          AppState.selectedTone = { id: currentTone, name: names[currentTone], type: 'builtin', url: null };
        }
        stopTonePreview();
        navigate('#/create-alarm');
      }

function preloadAlarmAudio(alarm) {
        if (!alarm?.id) return;
        if (_preloadedAudio.has(alarm.id)) return; // already preloaded

        const audioUrl = alarm.tone_url;
        if (!audioUrl) return; // will use WebAudio beep, no preload needed

        try {
          const audio = new Audio();
          audio.preload = 'auto';
          audio.src = audioUrl;
          audio.load(); // Start fetching into browser cache
          _preloadedAudio.set(alarm.id, audio);
          console.log('[Wakeit] Audio preloaded for alarm');
        } catch (e) {
          console.warn('[Wakeit] Audio preload failed:', e);
        }
      }

function getPreloadedAudio(alarmId) {
        const audio = _preloadedAudio.get(alarmId);
        if (audio) _preloadedAudio.delete(alarmId); // consume it
        return audio || null;
      }

function unlockAudio() {
        if (audioUnlocked) return;
        try {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (AudioCtx) {
            globalAudioCtx = new AudioCtx();
            if (globalAudioCtx.state === 'suspended') {
              globalAudioCtx.resume().catch(() => { });
            }
            // Play inaudible oscillator to unlock
            const osc = globalAudioCtx.createOscillator();
            const gain = globalAudioCtx.createGain();
            gain.gain.value = 0.001; // nearly silent
            osc.connect(gain);
            gain.connect(globalAudioCtx.destination);
            osc.start(0);
            osc.stop(globalAudioCtx.currentTime + 0.05);
          }
          // Also unlock HTML5 Audio element
          _silentAudio = new Audio();
          _silentAudio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
          _silentAudio.volume = 0.01;
          _silentAudio.play().catch(() => { });

          audioUnlocked = true;
          console.log('[Wakeit] AudioContext + HTML5 Audio unlocked.');
        } catch (e) {
          console.warn('[Wakeit] Audio unlock error:', e);
        }
      }

function playBuiltinTone(toneKey, startVolume) {
        const tone = BUILTIN_TONES[toneKey] || BUILTIN_TONES.classic;
        const vol = startVolume ?? 0.3; // Start at 30% for ramp-up

        function singleCycle() {
          try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = globalAudioCtx || new AudioCtx();

            if (ctx.state === 'suspended') ctx.resume().catch(() => { });

            const masterGain = ctx.createGain();
            masterGain.gain.value = vol;
            masterGain.connect(ctx.destination);

            let offset = 0;
            tone.freqs.forEach((freq, i) => {
              const osc = ctx.createOscillator();
              const noteGain = ctx.createGain();
              osc.type = tone.type;
              osc.frequency.setValueAtTime(freq, ctx.currentTime + offset);
              noteGain.gain.setValueAtTime(0.8, ctx.currentTime + offset);
              noteGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + tone.duration);
              osc.connect(noteGain);
              noteGain.connect(masterGain);
              osc.start(ctx.currentTime + offset);
              osc.stop(ctx.currentTime + offset + tone.duration + 0.05);
              offset += tone.duration * 0.7; // slight overlap
            });
          } catch (e) { /* silently ignore */ }
        }

        singleCycle(); // play immediately
        const cycleDuration = tone.freqs.length * tone.duration * 0.7 + 0.5;
        return setInterval(singleCycle, cycleDuration * 1000 + 300);
      }

function playDefaultBeep() {
        try {
          // Start with built-in classic tone
          const intervalId = playBuiltinTone('classic', 0.3);
          AppState.alarmBeepInterval = intervalId;

          // Volume ramp-up: 30% → 100% over 5 seconds
          startVolumeRamp();
        } catch (e) {
          console.warn('[Wakeit] Web Audio beep failed, trying HTML5 fallback:', e);
          playHtml5FallbackBeep();
        }
      }

function startVolumeRamp() {
        if (AppState.alarmAudio) {
          AppState.alarmAudio.volume = 0.3;
          let currentVol = 0.3;
          const rampInterval = setInterval(() => {
            currentVol = Math.min(1.0, currentVol + 0.07); // ~10 steps over 5s
            if (AppState.alarmAudio) {
              try { AppState.alarmAudio.volume = currentVol; } catch (_) { }
            }
            if (currentVol >= 1.0) clearInterval(rampInterval);
          }, 500);
          // Store ramp interval for cleanup
          AppState._volumeRampInterval = rampInterval;
        }
      }

function playHtml5FallbackBeep() {
        try {
          // Generate a simple beep using oscillator-based data URI
          const audio = new Audio();
          // Tiny WAV beep (440Hz, 0.5s)
          audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
          audio.loop = true;
          audio.volume = 0.5;
          audio.play().catch(() => {
            console.warn('[Wakeit] HTML5 fallback beep also failed.');
          });
          AppState.alarmAudio = audio;
        } catch (e) { /* last resort failed */ }
      }

function playWithRetry(audio, retries = 3) {
        audio.play().catch((e) => {
          console.warn(`[Wakeit] Playback attempt failed (${retries} retries left):`, e);
          if (retries > 0) {
            setTimeout(() => playWithRetry(audio, retries - 1), 500);
          } else {
            console.error('[Wakeit] All playback attempts failed, falling back to beep.');
            playDefaultBeep();
          }
        });
      }

function startAlarmVibration() {
        if (!navigator.vibrate) return;
        // Escalating pattern: short bursts → longer bursts
        navigator.vibrate([500, 300, 500, 300, 500]); // immediate burst
        AppState.alarmVibrateInterval = setInterval(() => {
          navigator.vibrate([500, 200, 700, 200, 500, 200, 700]);
        }, 2500);
      }

function handleUploadTone() {
        if (!hasFullAccess()) {
          showToast('Custom tones need an active plan. Start free to unlock.', 'info');
          openModal('modal-plans');
          return;
        }
        if (toneUploading || toneRecording) return;
        document.getElementById('tone-file-input')?.click();
      }

function handleRecordTone() {
        if (!hasFullAccess()) {
          showToast('Voice recording needs an active plan. Start free to unlock.', 'info');
          openModal('modal-plans');
          return;
        }
        if (toneUploading || toneRecording) return;
        startVoiceRecording();
      }

async function uploadAudioFile(file) {
        const MAX_SIZE_MB = 5;
        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
          showToast('File too large. Max 5MB.', 'error');
          return null;
        }

        const userId = getCurrentUserId();
        if (!userId) return null;
        const extension = file.name.split('.').pop() || 'mp3';
        const fileName = `${userId}/${Date.now()}.${extension}`;

        updateUploadProgress(10);

        const uploadPromise = db.storage
          .from('alarm-tones')
          .upload(fileName, file, { upsert: true, contentType: file.type });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Upload timed out')), 30000)
        );

        updateUploadProgress(50);

        const { data, error } = await Promise.race([uploadPromise, timeoutPromise])
          .catch(err => ({ data: null, error: err }));

        if (error) {
          updateUploadProgress(0);
          showToast('Upload failed: ' + error.message, 'error');
          return null;
        }

        updateUploadProgress(100);
        const { data: urlData } = db.storage
          .from('alarm-tones').getPublicUrl(fileName);
        return urlData?.publicUrl || null;
      }

function startVoiceRecording() {
        const uid = getCurrentUserId();
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
          recordChunks = [];
          toneRecording = true;

          // Show recording UI
          const recordUI = document.getElementById('tone-record-ui');
          const recordRow = document.getElementById('tone-row-record');
          const uploadRow = document.getElementById('tone-row-upload');
          const labelEl = document.getElementById('record-label');
          if (recordUI) recordUI.style.display = '';
          if (recordRow) recordRow.style.opacity = '0.5';
          if (uploadRow) uploadRow.style.opacity = '0.5';

          // Countdown logic
          let secsLeft = 30;
          const countdownEl = document.getElementById('record-countdown');
          const progressBar = document.getElementById('record-progress-bar');
          function updateCountdown() {
            if (countdownEl) countdownEl.textContent = `Recording… ${secsLeft}s left`;
            if (progressBar) progressBar.style.width = ((30 - secsLeft) / 30 * 100) + '%';
          }
          updateCountdown();
          recordTimer = setInterval(() => {
            secsLeft--;
            updateCountdown();
            if (secsLeft <= 0) stopVoiceRecording();
          }, 1000);
          // Auto-stop at 30s
          recordTimeout = setTimeout(() => stopVoiceRecording(), 30100);

          const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
          mediaRecorder = new MediaRecorder(stream, { mimeType });
          mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordChunks.push(e.data); };

          mediaRecorder.onstop = async () => {
            // Clear timers
            clearInterval(recordTimer); clearTimeout(recordTimeout);
            stream.getTracks().forEach(t => t.stop());
            toneRecording = false;

            // Hide recording UI
            if (recordUI) recordUI.style.display = 'none';
            if (recordRow) recordRow.style.opacity = '';
            if (uploadRow) uploadRow.style.opacity = '';
            if (progressBar) progressBar.style.width = '0%';

            const blob = new Blob(recordChunks, { type: mimeType });
            if (blob.size < 100) { showToast('Recording too short. Try again.', 'error'); return; }

            showToast('Uploading recording…', 'info');

            const file = new File([blob], `voice-${Date.now()}.${mimeType === 'audio/webm' ? 'webm' : 'ogg'}`, { type: mimeType });
            const url = await uploadAudioFile(file);

            if (url) {
              AppState.selectedTone = { name: 'My Voice Note', type: 'voicenote', url };

              // Persist to user's profile
              if (uid) {
                await db.from('profiles').update({ custom_tone_url: url, custom_tone_name: 'My Voice Note' }).eq('id', uid);
              }

              await cacheTone(url);
              showToast('Recording saved! ✅', 'success');
              loadCustomTones();
            } else {
              showToast('Upload failed', 'error');
            }

            // Update selected tone name
            document.querySelectorAll('[id^="tone-check-"]').forEach(el => el.style.opacity = '0');
            const nameEl = document.getElementById('selected-tone-name');
            if (nameEl) nameEl.textContent = 'My Voice Note ';
            setTimeout(() => setUploadProgress(false, 0, ''), 1500);
          };


          mediaRecorder.start(200); // 200ms chunks for reliability
        }).catch(() => {
          toneRecording = false;
          showToast('Please allow microphone access in your browser settings', 'error');
        });
      }

function stopVoiceRecording() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }

async function playAlarmAudio(toneUrl) {
        try {
          alarmAudioContext = new (window.AudioContext || window.webkitAudioContext)();
          const response = await fetch(toneUrl);
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await alarmAudioContext.decodeAudioData(arrayBuffer);

          alarmGainNode = alarmAudioContext.createGain();
          alarmGainNode.gain.value = 2.0; // 200% volume
          alarmGainNode.connect(alarmAudioContext.destination);

          alarmAudioSource = alarmAudioContext.createBufferSource();
          alarmAudioSource.buffer = audioBuffer;
          alarmAudioSource.loop = true;
          alarmAudioSource.connect(alarmGainNode);
          alarmAudioSource.start(0);
        } catch (err) {
          console.error('Audio play failed:', err);
        }
      }

function stopAlarmAudio() {
        // 1. Stop Web Audio API custom audio
        if (alarmAudioSource) {
          try { alarmAudioSource.stop(); } catch (e) {}
          alarmAudioSource = null;
        }
        if (alarmAudioContext) {
          try { alarmAudioContext.close(); } catch (e) {}
          alarmAudioContext = null;
        }
        alarmGainNode = null;

        // 2. Stop HTML5 Audio if any (fallback/stale references)
        if (AppState.alarmAudio) {
          try {
            AppState.alarmAudio.pause();
            AppState.alarmAudio.currentTime = 0;
          } catch (e) { /* ignore */ }
          AppState.alarmAudio = null;
        }
        // 3. Stop Web Audio beep interval
        if (AppState.alarmBeepInterval) {
          clearInterval(AppState.alarmBeepInterval);
          AppState.alarmBeepInterval = null;
        }
        // 4. Stop vibration
        if (AppState.alarmVibrateInterval) {
          clearInterval(AppState.alarmVibrateInterval);
          AppState.alarmVibrateInterval = null;
        }
        if (navigator.vibrate) navigator.vibrate(0); // cancel any ongoing vibration
        // 5. Stop volume ramp
        if (AppState._volumeRampInterval) {
          clearInterval(AppState._volumeRampInterval);
          AppState._volumeRampInterval = null;
        }

        // 6. Unsubscribe realtime wake channel
        if (wakeChannel) {
          wakeChannel.unsubscribe();
          wakeChannel = null;
        }
      }

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
        }

function updateUploadProgress(percent) {
        const wrap = document.getElementById('tone-upload-progress-wrap');
        if (wrap) wrap.style.display = '';
        const bar = document.getElementById('tone-upload-bar');
        if (bar) bar.style.width = percent + '%';
        const label = document.getElementById('tone-upload-label');
        if (label) label.textContent = percent === 100
          ? 'Upload complete ✅'
          : `Uploading… ${percent}%`;
      }

async function handleFileSelected(input) {
        const file = input?.files?.[0];
        if (!file) return;

        // Reset input so the same file can be re-selected
        input.value = '';

        const uid = getCurrentUserId();
        if (!uid) { showToast('Please log in first', 'error'); return; }

        // Disable UI during upload
        toneUploading = true;
        const uploadRow = document.getElementById('tone-row-upload');
        const recordRow = document.getElementById('tone-row-record');
        if (uploadRow) uploadRow.style.opacity = '0.5';
        if (recordRow) recordRow.style.opacity = '0.5';

        // Call the newly optimized uploadAudioFile function
        const publicUrl = await uploadAudioFile(file);

        if (!publicUrl) {
          toneUploading = false;
          if (uploadRow) uploadRow.style.opacity = '';
          if (recordRow) recordRow.style.opacity = '';
          return;
        }

        const toneName = file.name.replace(/\.[^/.]+$/, '');
        AppState.selectedTone = { name: toneName, type: 'upload', url: publicUrl };

        // Persist the uploaded tone URL to the user's profile so it survives refresh
        if (uid && publicUrl) {
          await db.from('profiles').update({ custom_tone_url: publicUrl, custom_tone_name: toneName }).eq('id', uid);
        }

        // Update the checkmarks — show a custom check for uploaded tone
        document.querySelectorAll('[id^="tone-check-"]').forEach(el => el.style.opacity = '0');
        const nameEl = document.getElementById('selected-tone-name');
        if (nameEl) nameEl.textContent = ' ' + toneName;

        await cacheTone(publicUrl);
        showToast(`Uploaded: ${toneName} `, 'success');

        // Refresh saved list so new tone appears immediately
        loadCustomTones();

        // Re-enable after short display window
        setTimeout(() => {
          toneUploading = false;
          if (uploadRow) uploadRow.style.opacity = '';
          if (recordRow) recordRow.style.opacity = '';
          const wrap = document.getElementById('tone-upload-progress-wrap');
          if (wrap) wrap.style.display = 'none';
        }, 1500);
      }

// Global exports for backward compatibility with inline HTML and cross-module calls
window.toggleVibration = toggleVibration;
window.synthesiseTone = synthesiseTone;
window.initTonePicker = initTonePicker;
window.loadCustomTones = loadCustomTones;
window.selectCustomTone = selectCustomTone;
window.selectTone = selectTone;
window.previewTone = previewTone;
window.stopTonePreview = stopTonePreview;
window.cacheTone = cacheTone;
window.useToneAndBack = useToneAndBack;
window.preloadAlarmAudio = preloadAlarmAudio;
window.getPreloadedAudio = getPreloadedAudio;
window.unlockAudio = unlockAudio;
window.playBuiltinTone = playBuiltinTone;
window.playDefaultBeep = playDefaultBeep;
window.startVolumeRamp = startVolumeRamp;
window.playHtml5FallbackBeep = playHtml5FallbackBeep;
window.playWithRetry = playWithRetry;
window.startAlarmVibration = startAlarmVibration;
window.handleUploadTone = handleUploadTone;
window.handleRecordTone = handleRecordTone;
window.uploadAudioFile = uploadAudioFile;
window.startVoiceRecording = startVoiceRecording;
window.stopVoiceRecording = stopVoiceRecording;
window.playAlarmAudio = playAlarmAudio;
window.stopAlarmAudio = stopAlarmAudio;
window.playActions = playActions;
window.updateUploadProgress = updateUploadProgress;
window.handleFileSelected = handleFileSelected;
