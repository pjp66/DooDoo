# DooDoo Supabase 연결 준비

## Environment

Create `.env` in the project root:

```env
EXPO_PUBLIC_SUPABASE_URL=your_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

The app reads these values in `src/lib/supabase.js`. If they are missing, the Supabase client is `null` and the current AsyncStorage flow can continue.

## Tables

- `profiles`: user profile rows linked to `auth.users.id`
- `tasks`: user-owned task rows
- `categories`: user-owned category rows

See `docs/supabase-schema.sql` for the draft SQL and RLS policies.

## App To Database Mapping

- `isCompleted` -> `is_completed`
- `isAllDay` -> `is_all_day`
- `startTime` -> `start_time`
- `endTime` -> `end_time`
- `reminderType` -> `reminder_type`
- `reminderTime` -> `reminder_time`
- `priorityLabel` -> `priority_label`
- `createdAt` -> `created_at`
- `updatedAt` -> `updated_at`

The app can keep camelCase internally. Supabase rows use snake_case through `src/services/supabaseMappings.js`.

## Repository Direction

Current:

```text
UI -> localStore -> AsyncStorage
```

Prepared next step:

```text
UI -> taskRepository -> AsyncStorage before login
UI -> taskRepository -> Supabase after login
```

The local store remains as fallback until Supabase Auth and data sync are implemented.
