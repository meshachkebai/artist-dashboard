/**
 * Duration Detection Utility for Artist Dashboard
 * Web-based audio duration detection using Web Audio API
 */

/**
 * Detects audio duration from file metadata
 * @param {File} audioFile - The audio file to analyze
 * @returns {Promise<number>} Duration in milliseconds
 */
export const getAudioDuration = (audioFile) => {
  return new Promise((resolve, reject) => {
    // Validate input
    if (!audioFile || !audioFile.type.startsWith('audio/')) {
      reject(new Error('Invalid audio file provided'));
      return;
    }

    // Check for browser support
    if (typeof Audio === 'undefined') {
      reject(new Error('Audio API not supported in this browser'));
      return;
    }

    const audio = new Audio();
    const url = URL.createObjectURL(audioFile);

    const cleanup = () => {
      URL.revokeObjectURL(url);
    };

    const onLoadedMetadata = () => {
      cleanup();
      const duration = audio.duration;
      if (duration && isFinite(duration) && duration > 0) {
        resolve(duration * 1000); // Convert to milliseconds
      } else {
        reject(new Error('Unable to read duration from audio file'));
      }
    };

    const onError = (error) => {
      cleanup();
      console.error('Audio duration detection error:', error);
      reject(new Error('Failed to load audio file for duration detection'));
    };

    // Set up event listeners
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('error', onError);

    // Set audio source
    audio.src = url;
  });
};

/**
 * Validates if duration is within acceptable range
 * @param {number} durationMs - Duration in milliseconds
 * @returns {boolean} True if duration is valid
 */
export const isValidDuration = (durationMs) => {
  const durationSeconds = durationMs / 1000;
  return durationSeconds >= 30 && durationSeconds <= 600; // 30 seconds to 10 minutes
};

/**
 * Formats duration from milliseconds to MM:SS
 * @param {number} durationMs - Duration in milliseconds
 * @returns {string} Formatted duration string
 */
export const formatDuration = (durationMs) => {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * Creates a track object for duration detection
 * @param {Object} trackData - Track information
 * @param {string} trackData.id - Track ID
 * @param {string} trackData.title - Track title
 * @param {string} trackData.file_path - File path or URI
 * @param {number} trackData.duration - Current duration (optional)
 * @returns {Object} Track object compatible with duration detection
 */
export const createTrackForDetection = (trackData) => {
  return {
    id: trackData.id || 'temp',
    title: trackData.title || 'Unknown',
    file_path: trackData.file_path,
    duration: trackData.duration || 0
  };
};

/**
 * Main function to get track duration with error handling
 * @param {Object} track - Track object with file information
 * @param {File} audioFile - The audio file (alternative to track.file_path)
 * @returns {Promise<number>} Duration in milliseconds
 */
export const getTrackDuration = async (track, audioFile = null) => {
  try {
    let fileToAnalyze = audioFile;

    // If no audioFile provided, try to get it from track.file_path
    if (!fileToAnalyze && track.file_path) {
      // For web-based solution, we expect the file to be passed directly
      // This is different from the React Native version
      throw new Error('Audio file must be provided for web-based duration detection');
    }

    if (!fileToAnalyze) {
      throw new Error('No audio file provided for duration detection');
    }

    const durationMs = await getAudioDuration(fileToAnalyze);

    if (!isValidDuration(durationMs)) {
      console.warn(`Duration ${durationMs}ms is outside typical range (30s-600s)`);
    }

    return durationMs;

  } catch (error) {
    console.error('Duration detection failed:', error);
    throw error;
  }
};
