/**
 * R2 Upload Service
 * Handles file uploads to Cloudflare R2 via Worker
 */

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL;

/**
 * Upload audio file and optional artwork to R2
 * @param {Object} params - Upload parameters
 * @param {File} params.audioFile - Audio file to upload
 * @param {File} params.artworkFile - Optional artwork file
 * @param {string} params.artistName - Artist name
 * @param {string} params.releaseTitle - Album/release title
 * @param {string} params.trackTitle - Track title
 * @param {number} params.trackNumber - Optional track number
 * @returns {Promise<{audioUrl: string, artworkUrl: string|null}>}
 */
export async function uploadToR2({
  audioFile,
  artworkFile,
  artistName,
  releaseTitle,
  trackTitle,
  trackNumber
}) {
  if (!WORKER_URL) {
    throw new Error('R2 Worker URL not configured. Please set VITE_R2_WORKER_URL in .env');
  }

  // Create form data
  const formData = new FormData();
  formData.append('audioFile', audioFile);
  
  if (artworkFile) {
    formData.append('artworkFile', artworkFile);
  }
  
  formData.append('artistName', artistName);
  formData.append('releaseTitle', releaseTitle);
  formData.append('trackTitle', trackTitle);
  
  if (trackNumber) {
    formData.append('trackNumber', trackNumber.toString());
  }

  // Call Cloudflare Worker
  const response = await fetch(WORKER_URL, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Upload failed');
  }

  const result = await response.json();
  
  return {
    audioUrl: result.audioUrl,
    artworkUrl: result.artworkUrl,
    audioPath: result.audioPath,
    artworkPath: result.artworkPath
  };
}
