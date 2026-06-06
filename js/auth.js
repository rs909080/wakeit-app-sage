// Module: auth

async function getSafeSession() {
        try {
          const { data, error } = await db.auth.getSession();
          if (error) { console.warn('[Wakeit] getSession error:', error.message); return null; }
          return data?.session || null;
        } catch (e) {
          console.error('[Wakeit] getSession threw:', e);
          return null;
        }
      }

async function handleUserSessionChange(event, session) {
        console.log('[Wakeit] handleUserSessionChange entered');
        try {

          // Load profile into AppState
          let { data: prof, error: profErr } = await db.from('profiles').select('*').eq('id', session.user.id).single();
          if (profErr) {
            console.warn('[Wakeit] Profile query non-fatal error:', profErr.message);
          }

          if (!prof) {
            // Create profile for OAuth signup
            const email = session.user.email || '';
            const name = session.user.user_metadata?.full_name || session.user.user_metadata?.name || email.split('@')[0] || 'User';
            const { error: upsertErr } = await db.from('profiles').upsert({
              id: session.user.id,
              name,
              email,
              plan_type: 'free_trial'
            }, { onConflict: 'id' });
            if (upsertErr) {
              console.error('[Wakeit] Profile creation error:', upsertErr.message);
            }
            prof = { id: session.user.id, name, email, plan_type: 'free_trial' };



            if (event === 'SIGNED_IN') {
              showToast('Account created! ', 'success');
              // Only navigate if appInit() has already finished its boot route,
              // and the user is actually on a guest screen (so we don't redirect refreshed users).
              const isGuestHash = PUBLIC_ROUTES.includes(window.location.hash) || !window.location.hash;
              if (isGuestHash) {
                if (_bootDone) {
                  navigate('#/home');
                  setTimeout(() => showPlansModalIfNeeded(), 500);
                } else {
                  // appInit() is still running — it will route correctly on its own
                  _profileReady.then(() => {
                    if (_bootDone) return; // appInit already routed
                    navigate('#/home');
                    setTimeout(() => showPlansModalIfNeeded(), 500);
                  });
                }
              }
            }
          } else if (event === 'SIGNED_IN') {
            // Only redirect on SIGNED_IN if user is on a guest screen (avoiding redirect on session restore / refresh)
            const isGuestHash = PUBLIC_ROUTES.includes(window.location.hash) || !window.location.hash;
            if (isGuestHash) {
              if (_bootDone) {
                navigate('#/home');
                setTimeout(() => showPlansModalIfNeeded(), 500);
              } else {
                _profileReady.then(() => {
                  if (_bootDone) return;
                  navigate('#/home');
                  setTimeout(() => showPlansModalIfNeeded(), 500);
                });
              }
            }
          }

          AppState.profile = prof;

          // Plan Verification via Edge Function
          await verifyPlanStatus();
          // Stage 6: request push permission + save FCM Token
          initFirebasePush();
          // Check plan expiry AFTER plan data is restored (safe timing)
          setTimeout(() => checkTrialExpiry(), 500);
          // Check for missed alarms (delayed so it doesn't block UI)
          setTimeout(() => checkMissedAlarms(), 2000);

        } catch (err) {
          console.error('[Wakeit] handleUserSessionChange unexpected exception:', err);
        } finally {
          // Profile + plan data is now loaded — resolve the gate so appInit() can route
          console.log('[Wakeit] Profile ready');
          if (_profileReadyResolve) { _profileReadyResolve(); _profileReadyResolve = null; }
        }
      }

function initLogin() {
        const setupToggle = (toggleId, inputId) => {
          const toggle = document.getElementById(toggleId);
          const input = document.getElementById(inputId);
          if (toggle && input) {
            toggle.onclick = () => {
              const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
              input.setAttribute('type', type);
              toggle.innerHTML = type === 'password' 
                ? '<i data-lucide="eye" class="lucide-icon lucide-icon-sm"></i>' 
                : '<i data-lucide="eye-off" class="lucide-icon lucide-icon-sm"></i>';
              if (window.lucide) window.lucide.createIcons();
            };
          }
        };
        setupToggle('toggle-signup-password', 'signup-password');
        setupToggle('toggle-signup-confirm', 'signup-confirm');
        setupToggle('toggle-login-password', 'login-password');

        const btnSignup = document.getElementById('btn-create-account');
        if (btnSignup) {
          btnSignup.onclick = async () => {
            const name = document.getElementById('signup-name')?.value.trim();
            const email = document.getElementById('signup-email')?.value.trim();
            const pass = document.getElementById('signup-password')?.value;
            const confirm = document.getElementById('signup-confirm')?.value;

            if (!name || !email || !pass) { showToast('Fill all fields', 'error'); return; }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Invalid email address', 'error'); return; }
            if (pass.length < 6) { showToast('Password must be 6+ chars', 'error'); return; }
            if (confirm && pass !== confirm) { showToast('Passwords do not match', 'error'); return; }

            btnSignup.disabled = true;
            btnSignup.innerHTML = '<span class="spinner" style="display:inline-block; width:16px; height:16px; border:2px solid #fff; border-bottom-color:transparent; border-radius:50%; animation: spin 1s linear infinite; vertical-align:middle; margin-right:8px;"></span>Creating account…';

            const { data, error } = await db.auth.signUp({
              email, password: pass,
              options: { data: { full_name: name } }
            });

            if (error) {
              // Handle "user already exists" gracefully
              if (error.message?.toLowerCase().includes('already registered') || error.status === 400) {
                showToast('This email is already registered. Try logging in.', 'error');
              } else {
                showToast(friendlyError(error, 'signup'), 'error');
              }
              btnSignup.disabled = false;
              btnSignup.textContent = 'Create Account';
              return;
            }

            // Detect if email confirmation is required (session is null but user exists)
            if (data.user && !data.session) {
              btnSignup.disabled = false;
              btnSignup.textContent = 'Create Account';
              showToast('✉️ Check your email and click the confirmation link to activate your account.', 'info');
              return;
            }

            // Session exists — user is logged in immediately (email confirm is OFF)
            // Auto-assign free_trial plan
            localStorage.setItem('wakeit_plan_type', 'free_trial');
            localStorage.setItem('wakeit_plan_start', Date.now().toString());

            // Initialize planVerification in AppState immediately to avoid race condition
            AppState.planVerification = {
              type: 'free_trial',
              active: true,
              expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
            };

            // Fire-and-forget profile upsert — don't block navigation
            if (data.user) {
              db.from('profiles').upsert({
                id: data.user.id,
                name,
                email
              }, { onConflict: 'id' }).then(async ({ error: pErr }) => {
                if (pErr) console.warn('[Wakeit] profile upsert:', pErr.message);
                // After profile is created, call activate_free_trial
                await db.rpc('activate_free_trial');
              });
            }

            showToast('Account created! ', 'success');
            navigate('#/home');
            showPlansModalIfNeeded();
          };
        }

        // Log In with email
        const btnLogin = document.getElementById('btn-login');
        if (btnLogin) {
          btnLogin.onclick = async () => {
            const email = document.getElementById('login-email')?.value.trim();
            const pass = document.getElementById('login-password')?.value;
            if (!email || !pass) { showToast('Fill all fields', 'error'); return; }
            const originalText = btnLogin.textContent;
            // Immediate visual feedback within 200ms
            btnLogin.disabled = true;
            btnLogin.innerHTML = '<span class="spinner" style="display:inline-block; width:16px; height:16px; border:2px solid #fff; border-bottom-color:transparent; border-radius:50%; animation: spin 1s linear infinite; vertical-align:middle; margin-right:8px;"></span>Logging in…';
            const errDiv = document.getElementById('login-error');
            if (errDiv) errDiv.style.display = 'none';

            const { data: loginData, error } = await db.auth.signInWithPassword({ email, password: pass });
            if (error) {
              // Inline error — no page reload
              const friendly = friendlyError(error, 'login');
              if (errDiv) {
                errDiv.style.display = 'block';
                errDiv.textContent = friendly;
              } else {
                showToast(friendly, 'error');
              }
              btnLogin.disabled = false;
              btnLogin.textContent = originalText;
              return;
            }

            showToast('Welcome back! ', 'success');
            // Navigate to home immediately on success
            navigate('#/home');
            // Show pricing popup asynchronously after navigation
            showPlansModalIfNeeded();
          };
        }

        // Google OAuth
        document.querySelectorAll('.btn-google').forEach(btn => {
          btn.onclick = async () => {
            const { error } = await db.auth.signInWithOAuth({
              provider: 'google',
              options: { redirectTo: `${window.location.origin}${window.location.pathname}#/home` }
            });
            if (error) showToast(friendlyError(error, 'login'), 'error');
          };
        });
      }

function switchAuthTab(tab) {
        const signupForm = document.getElementById('form-signup');
        const loginForm = document.getElementById('form-login');
        const tabSignup = document.getElementById('tab-signup');
        const tabLogin = document.getElementById('tab-login');
        if (tab === 'signup') {
          signupForm.style.display = ''; loginForm.style.display = 'none';
          tabSignup.classList.add('active'); tabLogin.classList.remove('active');
        } else {
          signupForm.style.display = 'none'; loginForm.style.display = '';
          tabSignup.classList.remove('active'); tabLogin.classList.add('active');
        }
      }

function initOTPInput() {
        const boxes = document.querySelectorAll('.otp-box');
        boxes.forEach((box, i) => {
          box.addEventListener('input', () => {
            if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
          });
          box.addEventListener('keydown', e => {
            if (e.key === 'Backspace' && !box.value && i > 0) boxes[i - 1].focus();
          });
          // Paste support
          box.addEventListener('paste', e => {
            const text = e.clipboardData.getData('text').replace(/\s/g, '').toUpperCase();
            boxes.forEach((b, j) => { b.value = text[j] || ''; });
            boxes[Math.min(text.length, boxes.length - 1)].focus();
            e.preventDefault();
          });
        });
        if (boxes[0]) boxes[0].focus();
      }

function initSettings() {
        AppHeader('settings-header', 'Settings', false, null, false);
        BottomNav('settings-nav', 'settings');

        // Populate user info from real profile
        const user = AppState.user;
        const profile = AppState.profile;
        if (user || profile) {
          const nameEl = document.getElementById('settings-name');
          const emailEl = document.getElementById('settings-email');
          const avatar = document.getElementById('settings-avatar');
          const displayName = profile?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'User';
          const displayEmail = user?.email || '';
          if (nameEl) nameEl.textContent = displayName;
          if (emailEl) emailEl.textContent = displayEmail;
          if (avatar) avatar.textContent = displayName.charAt(0).toUpperCase();
        }

        // Sign Out button
        const signOutBtn = document.getElementById('btn-sign-out');
        if (signOutBtn) {
          signOutBtn.onclick = () => {
            // Stop any playing alarm audio
            stopAlarmAudio();
            // Full AppState reset — no stale data bleeds into next session
            AppState.user = null;
            AppState.profile = null;
            AppState.currentGroup = null;
            AppState.editingAlarm = null;
            AppState.ringingAlarm = null;
            AppState.alarmAudio = null;
            AppState.wakeStatuses = {};
            AppState.selectedTone = { name: 'Classic Beep', type: 'default' };
            // Clear all local storage tokens immediately
            localStorage.clear();
            sessionStorage.clear();
            // Redirect to login instantly — within 200ms, no server confirmation needed
            showToast('Signed out', 'info');
            window.location.hash = '#/login';
            onRouteChange();
            // Clean up server-side in background after redirect
            db.auth.signOut().catch(e => console.warn('[Wakeit] signOut error:', e));
          };
        }

        // Update subscription plan card (Stage 5)
        updateSettingsPlanCard();
      }

function getUserPlanLimits(planType) {
  return PLAN_LIMITS[planType || getPlanType()] || PLAN_LIMITS.free_trial;
}

window.verifyPlanStatus = async function() {
  if (!AppState.user) return { type: null, active: false };
  try {
    const { data, error } = await db.functions.invoke('verify-plan');
    if (error) throw error;
    AppState.planVerification = { type: data.plan_type, active: data.is_active, expiresAt: data.expired_at };
    return AppState.planVerification;
  } catch (e) {
    console.warn('[Wakeit] verify-plan error:', e);
    return AppState.planVerification || { type: null, active: false };
  }
};

function getPlanType() {
  return AppState.planVerification?.type || null;
}

function isPlanActive() {
  return AppState.planVerification?.active || false;
}

function checkPlanExpiry() {
  if (!AppState.user) return;
  if (isPlanActive()) {
    removeExpiryBanner();
    return;
  }
  const type = getPlanType();
  if (type === 'free_trial') {
    showExpiryUI('Your 3-day free trial has ended. Choose a plan to continue ');
  } else if (type && type !== 'free_trial') {
    showExpiryUI('Your plan has expired. Renew to keep full access ');
  }
}

async function showPlansModalIfNeeded() {
  try {
    if (localStorage.getItem('hasSeenPricingOnboarding') === 'true') return;
    const planType = getPlanType();
    if (!planType) {
      localStorage.setItem('hasSeenPricingOnboarding', 'true');
      openModal('modal-plans');
    } else {
      localStorage.setItem('hasSeenPricingOnboarding', 'true');
      checkPlanExpiry();
    }
  } catch (e) {
    console.warn('[Wakeit] showPlansModalIfNeeded error (non-fatal):', e);
  }
}

async function grantFreeTrial() {
  try {
    const { data, error } = await db.rpc('activate_free_trial');
    if (error) throw error;
    if (data && data.error) {
      showToast(data.error, 'error');
      openModal('modal-plans');
      return;
    }
    await verifyPlanStatus();
    showToast(' Free trial started! 3 days of full access.', 'success');
    navigate('#/home');
  } catch(e) {
    showToast('Could not activate free trial.', 'error');
  }
}

async function activatePlan(planType) {
  closeModal('modal-plans');
  if (planType === 'free_trial') {
    await grantFreeTrial();
    return;
  }

  // Paid plans — open Razorpay
  const price = PLAN_PRICES[planType];
  if (!price) { showToast('Unknown plan type', 'error'); return; }

  const userEmail = AppState.user?.email || '';
  const options = {
    key: RAZORPAY_KEY,
    amount: price.amount,
    currency: 'USD',
    name: 'Wakeit',
    description: price.desc,
    image: '/icon-192.png',
    prefill: { email: userEmail },
    theme: { color: '#C84BFF' },
    modal: {
      ondismiss: () => {
        showToast('Payment cancelled.', 'info');
        openModal('modal-plans');
      }
    },
    handler: async (response) => {
      await persistPlan(planType, response.razorpay_payment_id || '');
      const labels = { member: 'Member', admin: 'Admin', organisation: 'Organisation' };
      showToast(`${labels[planType] || planType} plan activated! `, 'success');
      navigate('#/home');
    }
  };

  if (!window.Razorpay) {
    showToast('Payment is loading, please try again in 2 seconds.', 'warning');
    return;
  }

  try {
    new Razorpay(options).open();
  } catch (e) {
    showToast('Payment system unavailable. Please try again.', 'error');
    openModal('modal-plans');
  }
}

async function persistPlan(planType, paymentId) {
  const uid = getCurrentUserId();
  removeExpiryBanner();
  if (uid) {
    try {
      await db.from('profiles').update({
        plan_type: planType,
        plan_started_at: new Date().toISOString(),
        rzp_payment_id: paymentId || null,
        plan_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      }).eq('id', uid);
    } catch (e) {
      console.warn('[Wakeit] Could not persist plan to DB:', e);
    }
  }
  await verifyPlanStatus();
  updateSettingsPlanCard();
}

function updateSettingsPlanCard() {
  const pill = document.getElementById('settings-plan-pill');
  const label = document.getElementById('settings-plan-label');

  const planType = getPlanType();
  const active = isPlanActive();

  if (planType === 'organisation') {
    if (pill) { pill.className = 'plan-pill pill-pro'; pill.textContent = ' Organisation'; }
    if (label) label.textContent = active ? 'Organisation plan · up to 10 groups, 50 members' : 'Organisation plan expired';
  } else if (planType === 'admin') {
    if (pill) { pill.className = 'plan-pill pill-pro'; pill.textContent = ' Admin'; }
    if (label) label.textContent = active ? 'Admin plan · up to 5 groups, 20 members' : 'Admin plan expired';
  } else if (planType === 'member') {
    if (pill) { pill.className = 'plan-pill pill-free'; pill.textContent = ' Member'; }
    if (label) label.textContent = active ? 'Member plan · join groups only · $1/yr' : 'Member plan expired';
  } else if (planType === 'free_trial') {
    if (pill) { pill.className = 'plan-pill pill-free'; pill.textContent = ' Free Trial'; }
    if (active) {
      const expires = AppState.planVerification?.expiresAt;
      if (expires) {
        const days = Math.max(0, Math.ceil((new Date(expires) - new Date()) / (1000 * 60 * 60 * 24)));
        if (label) label.textContent = `${days} day${days !== 1 ? 's' : ''} left · all features unlocked`;
      } else {
        if (label) label.textContent = 'Free trial active';
      }
    } else {
      if (label) label.textContent = 'Free trial expired';
    }
  } else {
    if (pill) { pill.className = 'plan-pill pill-trial'; pill.textContent = 'No Plan'; }
    if (label) label.textContent = 'No active plan';
  }
}


// Global exports for backward compatibility with inline HTML and cross-module calls
window.getSafeSession = getSafeSession;
window.handleUserSessionChange = handleUserSessionChange;
window.initLogin = initLogin;
window.switchAuthTab = switchAuthTab;
window.initOTPInput = initOTPInput;
window.initSettings = initSettings;
window.getUserPlanLimits = getUserPlanLimits;
window.getPlanType = getPlanType;
window.isPlanActive = isPlanActive;
window.checkPlanExpiry = checkPlanExpiry;
window.showPlansModalIfNeeded = showPlansModalIfNeeded;
window.activatePlan = activatePlan;
window.grantFreeTrial = grantFreeTrial;
window.persistPlan = persistPlan;
window.updateSettingsPlanCard = updateSettingsPlanCard;

window.confirmDeleteAccount = function() {
  if (typeof openModal === 'function') openModal('modal-delete-account');
};
window.doDeleteAccount = async function() {
  if (typeof closeModal === 'function') closeModal('modal-delete-account');
  const user = AppState.user;
  if (!user) return;
  try {
    if (typeof showToast === 'function') showToast('Deleting account...', 'info');
    await db.from('profiles').delete().eq('id', user.id);
    await db.auth.signOut();
    localStorage.clear();
    sessionStorage.clear();
    AppState.user = null;
    if (typeof showToast === 'function') showToast('Account deleted successfully', 'success');
    if (typeof navigate === 'function') navigate('#/login');
  } catch (err) {
    if (typeof showToast === 'function') showToast('Failed to delete account', 'error');
  }
};

/* Auth state listener — single source of truth */
db.auth.onAuthStateChange((event, session) => {
  // DEV PREVIEW MODE: ignore real auth events — keep the mock user
  if (typeof DEV_PREVIEW !== 'undefined' && DEV_PREVIEW) {
    if (typeof _authReadyResolve === 'function') { _authReadyResolve(); _authReadyResolve = null; }
    return;
  }

  AppState.user = session ? session.user : null;

  // Resolve the boot gate — appInit() is waiting for this
  if (typeof _authReadyResolve === 'function') { _authReadyResolve(); _authReadyResolve = null; }

  if (AppState.user) {
    // Asynchronously trigger profile loading and background initialization
    // outside of the main onAuthStateChange event flow to avoid deadlocks.
    if (typeof handleUserSessionChange === 'function') {
      handleUserSessionChange(event, session);
    }
  } else {
    AppState.profile = null;
    // No user — resolve _profileReady so appInit() doesn't hang
    if (typeof _profileReadyResolve === 'function') { _profileReadyResolve(); _profileReadyResolve = null; }
    // Only redirect on explicit SIGNED_OUT. On initial load with no session,
    // appInit() handles routing after _authReady resolves.
    if (event === 'SIGNED_OUT') {
      window.location.hash = '#/login';
      if (typeof onRouteChange === 'function') {
        setTimeout(() => onRouteChange(), 50);
      }
    }
  }
});

