const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

// 1. Revert Member plan
content = content.replace(
  /<div class="plan-price" style="font-size:22px;font-weight:900;color:var\(--primary\);">₹99<\/div>/g,
  '<div class="plan-price" data-inr="₹49" data-usd="$0.59"\n                style="font-size:22px;font-weight:900;color:var(--primary);">₹49</div>'
);
content = content.replace(
  /<div style="font-size:11px;color:var\(--text-secondary\);text-decoration:line-through;margin-bottom:1px;">₹900<\/div>/g,
  ''
);
content = content.replace(
  /<div style="font-size:11px;color:#30D158;margin-top:2px;font-weight:600;">2-Month Special Offer \(89% OFF\)<\/div>/g,
  '<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">Join groups, can\'t create</div>'
);
content = content.replace(
  /<button class="btn-outline plan-btn"\s*style="width:100%;font-size:13px;" onclick="activatePlan\('member'\)"><i data-lucide="credit-card" style="width:15px;height:15px;flex-shrink:0;stroke:currentColor;fill:none;margin-right:6px;vertical-align:middle;"><\/i>Get Member — ₹99\/yr<\/button>/g,
  '<button class="btn-outline plan-btn" data-inr="Get Member — ₹49/yr" data-usd="Get Member — $0.59/yr"\n            style="width:100%;font-size:13px;" onclick="activatePlan(\'member\')"><i data-lucide="credit-card" style="width:15px;height:15px;flex-shrink:0;stroke:currentColor;fill:none;margin-right:6px;vertical-align:middle;"></i>Get Member — ₹49/yr</button>'
);

// 2. Revert Admin plan
content = content.replace(
  /<div class="plan-price" style="font-size:22px;font-weight:900;color:var\(--primary\);">₹399<\/div>/g,
  '<div class="plan-price" data-inr="₹499" data-usd="$5.99"\n                style="font-size:22px;font-weight:900;color:var(--primary);">₹499</div>'
);
content = content.replace(
  /<div style="font-size:11px;color:var\(--text-secondary\);text-decoration:line-through;margin-bottom:1px;">₹3,627<\/div>/g,
  ''
);
content = content.replace(
  /<button class="btn-gradient plan-btn"\s*style="width:100%;font-size:13px;" onclick="activatePlan\('admin'\)"><i data-lucide="zap" style="width:15px;height:15px;flex-shrink:0;stroke:currentColor;fill:none;margin-right:6px;vertical-align:middle;"><\/i>Get Admin — ₹399\/yr<\/button>/g,
  '<button class="btn-gradient plan-btn" data-inr="Get Admin — ₹499/yr" data-usd="Get Admin — $5.99/yr"\n            style="width:100%;font-size:13px;" onclick="activatePlan(\'admin\')"><i data-lucide="zap" style="width:15px;height:15px;flex-shrink:0;stroke:currentColor;fill:none;margin-right:6px;vertical-align:middle;"></i>Get Admin — ₹499/yr</button>'
);

// 3. Revert Organisation plan
content = content.replace(
  /<div class="plan-price" style="font-size:22px;font-weight:900;color:#FFD60A;">₹3,999<\/div>/g,
  '<div class="plan-price" data-inr="₹4,999" data-usd="$59.99"\n                style="font-size:22px;font-weight:900;color:#FFD60A;">₹4,999</div>'
);
content = content.replace(
  /<div style="font-size:11px;color:var\(--text-secondary\);text-decoration:line-through;margin-bottom:1px;">₹36,355<\/div>/g,
  ''
);
content = content.replace(
  /<button class="btn-gradient plan-btn"\s*style="width:100%;font-size:13px;background:linear-gradient\(135deg,#FFD60A,#FF9F0A\);color:#1C1C1E;font-weight:700;"\s*onclick="activatePlan\('organisation'\)"><i data-lucide="crown" style="width:15px;height:15px;flex-shrink:0;stroke:#1C1C1E;fill:none;margin-right:6px;vertical-align:middle;"><\/i>Get Organisation — ₹3,999\/yr<\/button>/g,
  '<button class="btn-gradient plan-btn" data-inr="Get Organisation — ₹4,999/yr"\n            data-usd="Get Organisation — $59.99/yr"\n            style="width:100%;font-size:13px;background:linear-gradient(135deg,#FFD60A,#FF9F0A);color:#1C1C1E;font-weight:700;"\n            onclick="activatePlan(\'organisation\')"><i data-lucide="crown" style="width:15px;height:15px;flex-shrink:0;stroke:#1C1C1E;fill:none;margin-right:6px;vertical-align:middle;"></i>Get Organisation — ₹4,999/yr</button>'
);

// 4. Revert PLAN_PRICES array
content = content.replace(
  /const PLAN_PRICES = {\s*member: { amount: 9900, label: '₹99\/yr', desc: 'Member — ₹99\/year' },\s*admin: { amount: 39900, label: '₹399\/yr', desc: 'Admin — ₹399\/year' },\s*organisation: { amount: 399900, label: '₹3,999\/yr', desc: 'Organisation — ₹3,999\/year' }\s*};/g,
  `const PLAN_PRICES = {
      member: { amount: 4900, label: '₹49/yr', desc: 'Member — ₹49/year' },
      admin: { amount: 49900, label: '₹499/yr', desc: 'Admin — ₹499/year' },
      organisation: { amount: 499900, label: '₹4,999/yr', desc: 'Organisation — ₹4,999/year' }
    };`
);

// 5. Add back togglePlanCurrency
const planTitleHunk = `<div class="modal-title" style="font-size:20px;margin-bottom:4px;">Choose Your Plan</div>
        <p style="font-size:13px;color:var(--text-secondary);margin:0 0 8px;text-align:center;">Unlock Wakeit
          features. Start free, upgrade anytime.</p>`;
const replacementTitleHunk = `<div class="modal-title" style="font-size:20px;margin-bottom:4px;">Choose Your Plan</div>
        <p style="font-size:13px;color:var(--text-secondary);margin:0 0 8px;text-align:center;">Unlock Wakeit
          features. Start free, upgrade anytime.</p>
        <div style="text-align:center;margin-bottom:var(--space-4);">
          <button id="currency-toggle-btn" onclick="togglePlanCurrency()"
            style="background:rgba(255,255,255,0.08);border:1px solid var(--border);color:var(--text-secondary);font-size:12px;font-weight:600;padding:5px 14px;border-radius:var(--radius-full);cursor:pointer;transition:all 0.2s;">Show
            prices in $ USD</button>
        </div>`;
content = content.replace(planTitleHunk, replacementTitleHunk);

const jsHunk = `document.getElementById('plan-modal').style.display = 'none';
      if (document.getElementById('view-settings').style.display !== 'none') {
        initSettings(); // Refresh
      }
    }`;
const jsReplacement = `document.getElementById('plan-modal').style.display = 'none';
      if (document.getElementById('view-settings').style.display !== 'none') {
        initSettings(); // Refresh
      }
    }

    let planCurrencyIsUSD = false;
    function togglePlanCurrency() {
      planCurrencyIsUSD = !planCurrencyIsUSD;
      const key = planCurrencyIsUSD ? 'usd' : 'inr';
      document.querySelectorAll('.plan-price').forEach(el => {
        el.textContent = el.dataset[key];
      });
      document.querySelectorAll('.plan-btn').forEach(el => {
        el.innerHTML = el.innerHTML.replace(/(Get.*— ).*?<\\/button>$/, \`$1\${el.dataset[key]}</button>\`);
      });
      const btn = document.getElementById('currency-toggle-btn');
      if (btn) btn.textContent = planCurrencyIsUSD ? 'Show prices in ₹ INR' : 'Show prices in $ USD';
    }`;
content = content.replace(jsHunk, jsReplacement);

// 6. Fix "Join groups, can't create" for Admin and Org that we accidentally replaced
content = content.replace(
  /<div style="font-size:11px;color:var\(--text-secondary\);margin-top:2px;">Join groups, can't create<\/div>/g,
  function(match, offset, str) {
    if (offset > str.indexOf('<!-- ── ADMIN ── -->') && offset < str.indexOf('<!-- ── ORGANISATION ── -->')) {
      return '<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">Create &amp; manage groups</div>';
    } else if (offset > str.indexOf('<!-- ── ORGANISATION ── -->')) {
      return '<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">For teams &amp; institutions</div>';
    }
    return match; // For Member plan
  }
);

fs.writeFileSync('index.html', content);
console.log('Reverted pricing changes.');
