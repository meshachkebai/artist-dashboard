# Artist Authentication Setup

## What Was Built

### 1. Auth Hook (`src/hooks/useAuth.js`)
- Manages authentication state
- Stores artist_name and is_admin in localStorage
- Provides: `isAuthenticated`, `artistName`, `isAdmin`, `login()`, `logout()`

### 2. Login Page (`src/components/ArtistLogin.jsx`)
- Artist name text input
- 5-digit code input boxes
- Validates against `artist_access_codes` table in Supabase
- Stores credentials in localStorage on success

### 3. Protected Dashboard (`src/components/ProtectedDashboard.jsx`)
- Wraps the entire app
- Shows login page if not authenticated
- Shows dashboard if authenticated

### 4. Modified App.jsx
- Added auth context
- Artist field is read-only for artists, editable for admin
- Auto-fills artist name from localStorage
- Tracks list filtered by artist (admin sees all)
- Added logout button and role indicator in header

## Database Setup Required

Create this table in Supabase:

```sql
CREATE TABLE artist_access_codes (
  id SERIAL PRIMARY KEY,
  artist_name TEXT NOT NULL,
  code TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT false,
  is_revoked BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(artist_name, code)
);
```

## Creating Access Codes

### For Artists:
```sql
INSERT INTO artist_access_codes (artist_name, code) 
VALUES ('John Doe', '12345');
```

### For Admin:
```sql
INSERT INTO artist_access_codes (artist_name, code, is_admin) 
VALUES ('Admin', '00000', true);
```

## How It Works

1. User visits dashboard → sees login page
2. Enters artist name + 5-digit code
3. System validates against Supabase
4. On success: stores in localStorage, shows dashboard
5. Artist uploads are locked to their name
6. Artists only see their own tracks
7. Admin can upload as anyone and sees all tracks
8. Logout clears localStorage

## Features

- ✅ Login with artist name + 5-digit code
- ✅ Admin access (sees all tracks, can upload as anyone)
- ✅ Artist access (sees only their tracks, locked to their name)
- ✅ Persistent sessions (localStorage)
- ✅ Logout functionality
- ✅ Role indicator in header
- ✅ Protected routes
- ✅ Works across devices (just re-enter credentials)

## Testing

1. Create test access codes in Supabase
2. Try logging in as artist
3. Try logging in as admin
4. Verify track filtering works
5. Verify upload restrictions work
6. Test logout
