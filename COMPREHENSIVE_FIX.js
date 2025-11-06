// Add this guard clause RIGHT AFTER checking artistId in EVERY analytics hook
// This ensures that if artist doesn't exist in database, we return EMPTY data instead of ALL data

// Pattern to find:
if (!isAdmin && artistId) {
  // fetch contributions
}

// Replace with:
if (!isAdmin && !artistId) {
  // Artist not in database - return empty data
  console.error('❌ Artist not in database - returning empty data');
  setData([]); // or appropriate empty structure
  return;
}

if (!isAdmin && artistId) {
  // fetch contributions
  const trackIds = contributions?.map(c => c.track_id) || [];
  
  // Artist has no tracks - return empty
  if (trackIds.length === 0) {
    console.warn('⚠️ Artist has no tracks');
    setData([]); // or appropriate empty structure
    return;
  }
}

// This prevents the "show all data" fallback when artistId is null
