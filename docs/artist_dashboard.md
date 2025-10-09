# Artist Dashboard Implementation Guide

## Overview

Build an artist dashboard using the MVP analytics data. Artists can see their performance, audience demographics, and earnings - all from the `analytics_events` table you're already tracking.

---

## What Artists Want to See

1. **Total Streams** - "How many times was my music played?"
2. **Top Songs** - "Which of my songs is most popular?"
3. **Listener Demographics** - "Who's listening to me?"
4. **Geographic Distribution** - "Where are my fans?"
5. **Growth Over Time** - "Am I growing?"
6. **Revenue Estimate** - "How much am I earning?"

**All of this is possible with your existing MVP analytics!**

---

## Core Queries

### 1. Artist Overview (Last 30 Days)
```sql
SELECT 
  artist_name,
  COUNT(*) as total_streams,
  COUNT(DISTINCT access_code_id) as unique_listeners,
  COUNT(DISTINCT track_id) as total_tracks,
  COUNT(*) * 0.01 as estimated_revenue_pgk
FROM analytics_events
WHERE event_type = 'play_end'
AND duration_seconds >= 60
AND artist_name = $1 -- Artist parameter
AND timestamp >= NOW() - INTERVAL '30 days'
GROUP BY artist_name;
```

**Example Output:**
```
Artist: Justin Wellington
Total Streams: 12,345
Unique Listeners: 3,456
Total Tracks: 8
Estimated Revenue: K123.45
```

---

### 2. Top Songs (For This Artist)
```sql
SELECT 
  track_title,
  COUNT(*) as streams,
  COUNT(DISTINCT access_code_id) as unique_listeners,
  ROUND(AVG(duration_seconds), 0) as avg_listen_time
FROM analytics_events
WHERE event_type = 'play_end'
AND duration_seconds >= 60
AND artist_name = $1
AND timestamp >= NOW() - INTERVAL '30 days'
GROUP BY track_title
ORDER BY streams DESC
LIMIT 10;
```

**Example Output:**
```
Song                Streams  Unique Listeners  Avg Listen Time
----------------------------------------------------------------
Raun Raun          5,234    2,134            245s
Haus Krai          3,456    1,567            198s
Island Girl        2,345    1,234            212s
Painim Yu          1,890    1,023            189s
Wantok             1,234      892            201s
```

---

### 3. Listener Demographics
```sql
SELECT 
  up.gender,
  CASE 
    WHEN EXTRACT(YEAR FROM AGE(up.dob)) BETWEEN 18 AND 24 THEN '18-24'
    WHEN EXTRACT(YEAR FROM AGE(up.dob)) BETWEEN 25 AND 34 THEN '25-34'
    WHEN EXTRACT(YEAR FROM AGE(up.dob)) BETWEEN 35 AND 44 THEN '35-44'
    ELSE '45+'
  END as age_range,
  COUNT(DISTINCT ae.access_code_id) as listeners,
  COUNT(*) as streams,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as percentage
FROM analytics_events ae
JOIN access_codes ac ON ae.access_code_id = ac.id
JOIN user_profiles up ON ac.id = up.access_code_id
WHERE ae.event_type = 'play_end'
AND ae.duration_seconds >= 60
AND ae.artist_name = $1
AND ae.timestamp >= NOW() - INTERVAL '30 days'
GROUP BY up.gender, age_range
ORDER BY listeners DESC;
```

**Example Output:**
```
Gender  Age Range  Listeners  Streams  Percentage
--------------------------------------------------
male    18-24      1,234      4,567    37.0%
female  18-24      892        3,234    26.2%
male    25-34      654        2,345    19.0%
female  25-34      432        1,678    13.6%
male    35-44      234          890     7.2%
```

---

### 4. Geographic Distribution
```sql
SELECT 
  up.city,
  up.admin_name,
  COUNT(DISTINCT ae.access_code_id) as listeners,
  COUNT(*) as streams,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as percentage
FROM analytics_events ae
JOIN access_codes ac ON ae.access_code_id = ac.id
JOIN user_profiles up ON ac.id = up.access_code_id
WHERE ae.event_type = 'play_end'
AND ae.duration_seconds >= 60
AND ae.artist_name = $1
AND ae.timestamp >= NOW() - INTERVAL '30 days'
GROUP BY up.city, up.admin_name
ORDER BY listeners DESC
LIMIT 10;
```

**Example Output:**
```
City           Province              Listeners  Streams  Percentage
--------------------------------------------------------------------
Port Moresby   National Capital      1,234      5,678    46.0%
Lae            Morobe                  456      2,134    17.3%
Mt Hagen       Western Highlands       234      1,234    10.0%
Kokopo         East New Britain        123        567     4.6%
Goroka         Eastern Highlands        89        432     3.5%
```

---

### 5. Growth Over Time (Last 30 Days)
```sql
SELECT 
  DATE(timestamp) as date,
  COUNT(*) as streams,
  COUNT(DISTINCT access_code_id) as unique_listeners
FROM analytics_events
WHERE event_type = 'play_end'
AND duration_seconds >= 60
AND artist_name = $1
AND timestamp >= NOW() - INTERVAL '30 days'
GROUP BY DATE(timestamp)
ORDER BY date;
```

**Example Output:**
```
Date        Streams  Unique Listeners
-------------------------------------
2025-10-01  234      156
2025-10-02  267      178
2025-10-03  298      189
2025-10-04  312      201
2025-10-05  289      187
...
```

---

### 6. Peak Listening Times
```sql
SELECT 
  EXTRACT(HOUR FROM timestamp) as hour,
  COUNT(*) as streams,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as percentage
FROM analytics_events
WHERE event_type = 'play_end'
AND duration_seconds >= 60
AND artist_name = $1
AND timestamp >= NOW() - INTERVAL '30 days'
GROUP BY hour
ORDER BY streams DESC
LIMIT 5;
```

**Example Output:**
```
Hour  Streams  Percentage
--------------------------
18    1,234    10.0%  (6pm)
19    1,123     9.1%  (7pm)
20    1,089     8.8%  (8pm)
17      987     8.0%  (5pm)
21      876     7.1%  (9pm)
```

---

### 7. Revenue Breakdown (Last 30 Days)
```sql
SELECT 
  artist_name,
  COUNT(*) as total_streams,
  COUNT(*) * 0.01 as estimated_revenue_pgk,
  COUNT(*) * 0.01 * 0.70 as artist_share_pgk, -- 70% to artist
  COUNT(*) * 0.01 * 0.30 as platform_fee_pgk  -- 30% platform fee
FROM analytics_events
WHERE event_type = 'play_end'
AND duration_seconds >= 60
AND artist_name = $1
AND timestamp >= NOW() - INTERVAL '30 days'
GROUP BY artist_name;
```

**Example Output:**
```
Artist: Justin Wellington
Total Streams: 12,345
Estimated Revenue: K123.45
Artist Share (70%): K86.42
Platform Fee (30%): K37.03
```

---

## Supabase Function (All-in-One)

Create a single function that returns all artist stats:

```sql
CREATE OR REPLACE FUNCTION get_artist_dashboard(artist_name_param TEXT)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    -- Overview
    'overview', (
      SELECT json_build_object(
        'total_streams', COUNT(*),
        'unique_listeners', COUNT(DISTINCT access_code_id),
        'total_tracks', COUNT(DISTINCT track_id),
        'estimated_revenue', COUNT(*) * 0.01
      )
      FROM analytics_events
      WHERE event_type = 'play_end'
      AND duration_seconds >= 60
      AND artist_name = artist_name_param
      AND timestamp >= NOW() - INTERVAL '30 days'
    ),
    
    -- Top Songs
    'top_songs', (
      SELECT json_agg(row_to_json(t))
      FROM (
        SELECT 
          track_title,
          COUNT(*) as streams,
          COUNT(DISTINCT access_code_id) as unique_listeners
        FROM analytics_events
        WHERE event_type = 'play_end'
        AND duration_seconds >= 60
        AND artist_name = artist_name_param
        AND timestamp >= NOW() - INTERVAL '30 days'
        GROUP BY track_title
        ORDER BY streams DESC
        LIMIT 10
      ) t
    ),
    
    -- Demographics
    'demographics', (
      SELECT json_agg(row_to_json(d))
      FROM (
        SELECT 
          up.gender,
          CASE 
            WHEN EXTRACT(YEAR FROM AGE(up.dob)) BETWEEN 18 AND 24 THEN '18-24'
            WHEN EXTRACT(YEAR FROM AGE(up.dob)) BETWEEN 25 AND 34 THEN '25-34'
            WHEN EXTRACT(YEAR FROM AGE(up.dob)) BETWEEN 35 AND 44 THEN '35-44'
            ELSE '45+'
          END as age_range,
          COUNT(DISTINCT ae.access_code_id) as listeners,
          COUNT(*) as streams
        FROM analytics_events ae
        JOIN access_codes ac ON ae.access_code_id = ac.id
        JOIN user_profiles up ON ac.id = up.access_code_id
        WHERE ae.event_type = 'play_end'
        AND ae.duration_seconds >= 60
        AND ae.artist_name = artist_name_param
        AND ae.timestamp >= NOW() - INTERVAL '30 days'
        GROUP BY up.gender, age_range
        ORDER BY listeners DESC
      ) d
    ),
    
    -- Geographic
    'geographic', (
      SELECT json_agg(row_to_json(g))
      FROM (
        SELECT 
          up.city,
          up.admin_name,
          COUNT(DISTINCT ae.access_code_id) as listeners,
          COUNT(*) as streams
        FROM analytics_events ae
        JOIN access_codes ac ON ae.access_code_id = ac.id
        JOIN user_profiles up ON ac.id = up.access_code_id
        WHERE ae.event_type = 'play_end'
        AND ae.duration_seconds >= 60
        AND ae.artist_name = artist_name_param
        AND ae.timestamp >= NOW() - INTERVAL '30 days'
        GROUP BY up.city, up.admin_name
        ORDER BY listeners DESC
        LIMIT 10
      ) g
    ),
    
    -- Daily Growth
    'daily_growth', (
      SELECT json_agg(row_to_json(dg))
      FROM (
        SELECT 
          DATE(timestamp) as date,
          COUNT(*) as streams,
          COUNT(DISTINCT access_code_id) as unique_listeners
        FROM analytics_events
        WHERE event_type = 'play_end'
        AND duration_seconds >= 60
        AND artist_name = artist_name_param
        AND timestamp >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(timestamp)
        ORDER BY date
      ) dg
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;
```

**Usage:**
```sql
SELECT get_artist_dashboard('Justin Wellington');
```

**Returns:**
```json
{
  "overview": {
    "total_streams": 12345,
    "unique_listeners": 3456,
    "total_tracks": 8,
    "estimated_revenue": 123.45
  },
  "top_songs": [
    {"track_title": "Raun Raun", "streams": 5234, "unique_listeners": 2134},
    {"track_title": "Haus Krai", "streams": 3456, "unique_listeners": 1567}
  ],
  "demographics": [...],
  "geographic": [...],
  "daily_growth": [...]
}
```

---

## Artist Authentication

### Option 1: Artist Codes Table (Recommended)

```sql
CREATE TABLE artist_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_name VARCHAR(255) UNIQUE NOT NULL,
  access_code VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  
  INDEX idx_access_code (access_code),
  INDEX idx_artist_name (artist_name)
);

-- Insert artist codes
INSERT INTO artist_codes (artist_name, access_code, email) VALUES
('Justin Wellington', 'JW2025', 'justin@example.com'),
('Naka Blood', 'NB2025', 'naka@example.com'),
('Jokema', 'JK2025', 'jokema@example.com');
```

**Login Flow:**
1. Artist enters their code (e.g., "JW2025")
2. System looks up artist_name
3. Dashboard shows data filtered by artist_name

---

### Option 2: Email-Based Authentication

```sql
CREATE TABLE artist_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_name VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_email (email)
);
```

**Login Flow:**
1. Artist registers with email/password
2. Email verified
3. Login with email/password
4. Dashboard shows their data

---

### Option 3: Use Existing Access Codes

```sql
-- Add artist_name to access_codes table
ALTER TABLE access_codes
ADD COLUMN artist_name VARCHAR(255),
ADD COLUMN is_artist BOOLEAN DEFAULT FALSE;

-- Mark certain codes as artist codes
UPDATE access_codes 
SET artist_name = 'Justin Wellington', is_artist = TRUE
WHERE code = 'ARTIST001';
```

**Login Flow:**
1. Artist uses their special access code
2. System detects is_artist = TRUE
3. Shows dashboard instead of regular app

---

## Dashboard UI Structure

### Layout (Web or Mobile)

```
┌─────────────────────────────────────────────────────┐
│  🎵 Justin Wellington's Dashboard                   │
│  Last updated: Oct 8, 2025 3:45 PM                 │
├─────────────────────────────────────────────────────┤
│  📊 Overview (Last 30 Days)                         │
│  ┌──────────┬──────────┬──────────┬──────────┐    │
│  │ 12,345   │ 3,456    │ 8        │ K123.45  │    │
│  │ Streams  │ Listeners│ Tracks   │ Earnings │    │
│  └──────────┴──────────┴──────────┴──────────┘    │
├─────────────────────────────────────────────────────┤
│  🎵 Top Songs                                       │
│  1. Raun Raun                    5,234 streams     │
│     2,134 unique listeners                         │
│  2. Haus Krai                    3,456 streams     │
│     1,567 unique listeners                         │
│  3. Island Girl                  2,345 streams     │
│     1,234 unique listeners                         │
│  [View All Songs →]                                │
├─────────────────────────────────────────────────────┤
│  👥 Your Audience                                   │
│  Gender:                                           │
│  ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░ 58% Male                    │
│  ▓▓▓▓▓▓▓▓░░░░░░░░░░░░ 42% Female                  │
│                                                     │
│  Age Groups:                                       │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░ 45% 18-24                   │
│  ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░ 30% 25-34                   │
│  ▓▓▓▓▓░░░░░░░░░░░░░░░ 15% 35-44                   │
│  ▓▓░░░░░░░░░░░░░░░░░░ 10% 45+                     │
├─────────────────────────────────────────────────────┤
│  📍 Top Locations                                   │
│  1. Port Moresby (NCD)           1,234 listeners   │
│  2. Lae (Morobe)                   456 listeners   │
│  3. Mt Hagen (WHP)                 234 listeners   │
│  4. Kokopo (ENBP)                  123 listeners   │
│  5. Goroka (EHP)                    89 listeners   │
│  [View Map →]                                      │
├─────────────────────────────────────────────────────┤
│  📈 Growth (Last 30 Days)                          │
│  [Line chart showing daily streams]                │
│                                                     │
│  Peak listening times:                             │
│  🕕 6pm-9pm (35% of streams)                       │
├─────────────────────────────────────────────────────┤
│  💰 Earnings                                        │
│  Total Revenue: K123.45                            │
│  Your Share (70%): K86.42                          │
│  Platform Fee (30%): K37.03                        │
│                                                     │
│  [View Payment History →]                          │
└─────────────────────────────────────────────────────┘
```

---

## Implementation Options

### Option 1: Web Dashboard (Recommended)

**Tech Stack:**
- Next.js or React
- Supabase client (read-only)
- Chart.js or Recharts for graphs
- Tailwind CSS for styling
- Deploy on Vercel (free)

**Pros:**
- ✅ Easier to build
- ✅ Artists can access from any device
- ✅ Better for data visualization
- ✅ Separate from main app

**Cons:**
- ❌ Separate codebase
- ❌ Need to manage authentication separately

**Estimated Time:** 2-3 days for MVP

---

### Option 2: In-App Dashboard

**Tech Stack:**
- React Native (existing app)
- Add `/artist-dashboard` route
- Use existing Supabase connection
- React Native Charts

**Pros:**
- ✅ Single codebase
- ✅ Use existing auth
- ✅ Artists use same app

**Cons:**
- ❌ More complex navigation
- ❌ Limited screen space on mobile
- ❌ Harder to build complex charts

**Estimated Time:** 3-4 days for MVP

---

### Option 3: Email Reports (Simplest Start)

**Tech Stack:**
- Supabase scheduled functions
- Email service (SendGrid, Mailgun)
- HTML email templates

**Pros:**
- ✅ No UI to build
- ✅ Automated weekly/monthly
- ✅ Artists get updates passively

**Cons:**
- ❌ Not real-time
- ❌ No interactivity
- ❌ Limited to what you send

**Estimated Time:** 1 day for MVP

---

## MVP Implementation (Week 1)

### Day 1: Database Setup
```sql
-- Create artist_codes table
CREATE TABLE artist_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_name VARCHAR(255) UNIQUE NOT NULL,
  access_code VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert test artists
INSERT INTO artist_codes (artist_name, access_code, email) VALUES
('Justin Wellington', 'TEST001', 'test@example.com');

-- Create dashboard function
-- (Use the get_artist_dashboard function from above)
```

### Day 2: Simple Web Page
```html
<!DOCTYPE html>
<html>
<head>
  <title>Artist Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
</head>
<body>
  <h1>Artist Dashboard</h1>
  
  <input type="text" id="artistCode" placeholder="Enter your artist code">
  <button onclick="loadDashboard()">View Dashboard</button>
  
  <div id="dashboard"></div>
  
  <script>
    const supabase = window.supabase.createClient(
      'YOUR_SUPABASE_URL',
      'YOUR_SUPABASE_ANON_KEY'
    );
    
    async function loadDashboard() {
      const code = document.getElementById('artistCode').value;
      
      // Get artist name from code
      const { data: artist } = await supabase
        .from('artist_codes')
        .select('artist_name')
        .eq('access_code', code)
        .single();
      
      if (!artist) {
        alert('Invalid code');
        return;
      }
      
      // Get dashboard data
      const { data: stats } = await supabase
        .rpc('get_artist_dashboard', { 
          artist_name_param: artist.artist_name 
        });
      
      // Display data
      document.getElementById('dashboard').innerHTML = `
        <h2>${artist.artist_name}</h2>
        <p>Total Streams: ${stats.overview.total_streams}</p>
        <p>Unique Listeners: ${stats.overview.unique_listeners}</p>
        <p>Estimated Revenue: K${stats.overview.estimated_revenue}</p>
        
        <h3>Top Songs</h3>
        <ul>
          ${stats.top_songs.map(song => `
            <li>${song.track_title} - ${song.streams} streams</li>
          `).join('')}
        </ul>
      `;
    }
  </script>
</body>
</html>
```

### Day 3: Add Charts
Use Chart.js for growth visualization:

```html
<canvas id="growthChart"></canvas>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
  const ctx = document.getElementById('growthChart');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: stats.daily_growth.map(d => d.date),
      datasets: [{
        label: 'Daily Streams',
        data: stats.daily_growth.map(d => d.streams),
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1
      }]
    }
  });
</script>
```

---

## Security Considerations

### Row Level Security (RLS)

```sql
-- Enable RLS on analytics_events
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Artists can only see their own data
CREATE POLICY artist_view_own_data ON analytics_events
FOR SELECT
USING (
  artist_name IN (
    SELECT artist_name 
    FROM artist_codes 
    WHERE access_code = current_setting('request.jwt.claims')::json->>'artist_code'
  )
);
```

### API Key Restrictions

- Use Supabase anon key (read-only)
- Restrict to specific domains
- Rate limit API calls
- No write access for artists

---

## Roadmap

### Week 1: MVP
- [ ] Create artist_codes table
- [ ] Create get_artist_dashboard function
- [ ] Build simple HTML dashboard
- [ ] Test with 2-3 artists

### Week 2: Enhanced UI
- [ ] Add charts (growth, demographics)
- [ ] Improve styling
- [ ] Add date range selector
- [ ] Mobile responsive

### Week 3: Features
- [ ] Email reports (weekly summary)
- [ ] Export data (CSV/PDF)
- [ ] Compare to previous period
- [ ] Top fans feature

### Week 4: Polish
- [ ] Artist onboarding flow
- [ ] Help documentation
- [ ] Performance optimization
- [ ] Beta test with 10 artists

---

## Success Metrics

### Week 1
- [ ] Dashboard loads in <2 seconds
- [ ] Data matches manual SQL queries
- [ ] 3 artists can log in and view data

### Month 1
- [ ] 20+ artists using dashboard
- [ ] Artists check dashboard 2x per week
- [ ] Zero data accuracy complaints

### Month 3
- [ ] 50+ artists using dashboard
- [ ] Artists share dashboard screenshots
- [ ] Feature requests coming in
- [ ] Dashboard influences artist behavior (promote top songs)

---

## Cost Estimate

### Web Dashboard (Recommended)
- **Hosting**: Free (Vercel)
- **Database**: Included in Supabase plan
- **Domain**: K50/year (optional)
- **Email**: Free tier (SendGrid)

**Total: K0-50/year**

### Development Time
- **MVP**: 2-3 days
- **Full-featured**: 1-2 weeks
- **Polished**: 3-4 weeks

---

## Next Steps

1. **Create artist_codes table** (5 min)
2. **Create get_artist_dashboard function** (10 min)
3. **Build simple HTML page** (1 hour)
4. **Test with your own artist data** (30 min)
5. **Share with 1-2 artists for feedback** (1 day)
6. **Iterate based on feedback** (ongoing)

**Total time to MVP: ~2 hours of coding + testing**

---

## Example Artist Feedback Loop

**Week 1**: "I can see my streams!"
**Week 2**: "Can you show me where my fans are?"
**Week 3**: "I want to see which song is growing fastest"
**Week 4**: "Can I download this data?"

Each request = new feature to add. Start simple, grow based on real needs.
