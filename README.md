# Artists Upload Dashboard

A React dashboard for uploading and managing music tracks with metadata including genres. **Now runs completely independently** - no API server required!

## Features

- Upload tracks with title, artist, genre, and duration
- File upload for audio files and artwork (stored in Supabase)
- View recent tracks with metadata
- Responsive design
- Direct Supabase integration (no API dependency)
- Works independently for web hosting

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure Supabase credentials:
```bash
cp .env.example .env
```

Edit `.env` file:
```env
# Supabase Configuration (required)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

3. Start development server:
```bash
npm run dev
```

## Database Requirements

The dashboard expects these Supabase tables:

### `mvp_content` table:
```sql
CREATE TABLE mvp_content (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  genre TEXT,
  file_path TEXT,
  artwork_path TEXT,
  duration_seconds INTEGER DEFAULT 180,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Supabase Storage Bucket:
- Bucket name: `stream`
- Public access enabled
- Folder structure: `content/mvp/{artist-folder}/`

## Environment Variables

- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anonymous key

## Deployment

1. Build for production:
```bash
npm run build
```

2. Set your Supabase credentials in your deployment environment:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

3. Deploy the `dist` folder to any static web host (Netlify, Vercel, etc.)

## Independent Operation

This dashboard is completely self-contained and doesn't require:
- Local API server running
- Backend infrastructure
- CORS configuration
- API endpoints

It communicates directly with Supabase for all operations.
