# Box 10: UI and Navigation

## App Display Layer
- Powered exclusively through Vanilla DOM Manipulation via `#id` attribute lookup.
- Contains 15 primary distinct container divs `id="screen-[name]"` with class `screen`.
- Navigating toggles the CSS `opacity` or `display`/`.active` property.

## Hash Router Logic
- Triggered on `window.addEventListener('hashchange')`.
- Compares against `ROUTES` constant dictionary.
- Checks `authGuard(hash)` to prevent improper URL manipulation.

## Pre-built Reusable Components
1. `AppHeader` (Title, Back, Settings icons).
2. `AlarmCard` & `GroupCard`.
3. `GradientButton` & `OutlineButton` & `DangerButton`.
4. `ToggleSwitch` & `BottomNav`.
5. `Toast(message, type)`.

## Theme Switcher logic
- Sets global CSS constants inside `body.theme-day` / `body.theme-night` mapping variables such as `--primary`, `--card-bg`, and `--glow`.
