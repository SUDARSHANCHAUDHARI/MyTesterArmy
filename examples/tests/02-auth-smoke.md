# Auth smoke

Goal: verify the sign-in route works and a user can reach the app shell.

Steps:

1. Navigate to `<target_url>/sign-in`
2. Complete a valid sign-in flow with a test account
3. Confirm redirect to an authenticated area (`/dashboard` or equivalent)
4. Confirm a user menu / avatar is visible
5. Return FAILED with the exact first broken step if any check fails
