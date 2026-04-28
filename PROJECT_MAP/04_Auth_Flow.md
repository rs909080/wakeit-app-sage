# Box 4: Auth Flow

## Mechanism
Wakeit uses Supabase Authentication. It tracks sessions using the single-page application hash routing.

## Flows
1. **Initial Splash Check:** Checks `supabase.auth.getSession()` and internal `AppState`.
2. **Access Protection:** The `authGuard(hash)` function prevents unauthenticated users from seeing inner routes (`#/home`, `#/groups`, etc.).
3. **Log In/Sign Up:** Email & Password, along with optional Google OAuth.
4. **Data Captured at Signup:** Email, Full Name, and strictly formatted Phone Number (+91X...), which is written to the Supabase `profiles/users` table.

## Post-Login Redirect
- First-time users -> `#/paywall` or `#/phone-setup`.
- Authenticated & Configured users -> `#/home`.

## Edge Cases
- When users return, `db.auth.onAuthStateChange` captures their global session dynamically and hydrates `AppState`.
