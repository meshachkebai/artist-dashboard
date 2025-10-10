// Input validation and sanitization utilities

/**
 * Sanitize string input - remove potentially dangerous characters
 */
export const sanitizeString = (input) => {
  if (!input) return '';
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/['"`;]/g, '') // Remove quotes and semicolons
    .substring(0, 255); // Limit length
};

/**
 * Validate artist name
 */
export const validateArtistName = (name) => {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Artist name is required' };
  }

  const sanitized = sanitizeString(name);
  
  if (sanitized.length < 2) {
    return { valid: false, error: 'Artist name must be at least 2 characters' };
  }

  if (sanitized.length > 100) {
    return { valid: false, error: 'Artist name is too long (max 100 characters)' };
  }

  // Only allow letters, numbers, spaces, and common punctuation
  if (!/^[a-zA-Z0-9\s\-_'.&]+$/.test(sanitized)) {
    return { valid: false, error: 'Artist name contains invalid characters' };
  }

  return { valid: true, sanitized };
};

/**
 * Validate track title
 */
export const validateTrackTitle = (title) => {
  if (!title || typeof title !== 'string') {
    return { valid: false, error: 'Track title is required' };
  }

  const sanitized = sanitizeString(title);
  
  if (sanitized.length < 1) {
    return { valid: false, error: 'Track title is required' };
  }

  if (sanitized.length > 200) {
    return { valid: false, error: 'Track title is too long (max 200 characters)' };
  }

  return { valid: true, sanitized };
};

/**
 * Validate album name
 */
export const validateAlbumName = (album) => {
  if (!album) return { valid: true, sanitized: '' }; // Optional field

  const sanitized = sanitizeString(album);
  
  if (sanitized.length > 200) {
    return { valid: false, error: 'Album name is too long (max 200 characters)' };
  }

  return { valid: true, sanitized };
};

/**
 * Validate genre
 */
export const validateGenre = (genre) => {
  if (!genre) return { valid: true, sanitized: '' }; // Optional field

  const sanitized = sanitizeString(genre);
  
  if (sanitized.length > 50) {
    return { valid: false, error: 'Genre is too long (max 50 characters)' };
  }

  return { valid: true, sanitized };
};

/**
 * Validate file upload
 */
export const validateAudioFile = (file) => {
  if (!file) {
    return { valid: false, error: 'Audio file is required' };
  }

  // Check file type
  const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/aac'];
  if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|m4a|aac)$/i)) {
    return { valid: false, error: 'Invalid audio file type. Allowed: MP3, WAV, OGG, M4A, AAC' };
  }

  // Check file size (max 50MB)
  const maxSize = 50 * 1024 * 1024; // 50MB
  if (file.size > maxSize) {
    return { valid: false, error: 'File too large. Maximum size is 50MB' };
  }

  return { valid: true };
};

/**
 * Validate artwork file
 */
export const validateArtworkFile = (file) => {
  if (!file) return { valid: true }; // Optional

  // Check file type
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'Invalid image type. Allowed: JPG, PNG, WEBP' };
  }

  // Check file size (max 5MB)
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    return { valid: false, error: 'Image too large. Maximum size is 5MB' };
  }

  return { valid: true };
};

/**
 * Validate year
 */
export const validateYear = (year) => {
  if (!year) return { valid: true, sanitized: '' }; // Optional

  const yearNum = parseInt(year);
  const currentYear = new Date().getFullYear();

  if (isNaN(yearNum) || yearNum < 1900 || yearNum > currentYear + 1) {
    return { valid: false, error: `Year must be between 1900 and ${currentYear + 1}` };
  }

  return { valid: true, sanitized: yearNum.toString() };
};

/**
 * Validate BPM
 */
export const validateBPM = (bpm) => {
  if (!bpm) return { valid: true, sanitized: null }; // Optional

  const bpmNum = parseInt(bpm);

  if (isNaN(bpmNum) || bpmNum < 20 || bpmNum > 300) {
    return { valid: false, error: 'BPM must be between 20 and 300' };
  }

  return { valid: true, sanitized: bpmNum };
};
