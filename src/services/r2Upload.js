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
  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      let errorMessage = 'Upload failed';
      try {
        const error = await response.json();
        errorMessage = error.error || errorMessage;
      } catch (e) {
        // If response isn't JSON, use status text
        errorMessage = `Upload failed: ${response.status} ${response.statusText}`;
      }
      console.error('R2 Upload Error:', {
        status: response.status,
        statusText: response.statusText,
        message: errorMessage
      });
      throw new Error(errorMessage);
    }

    const result = await response.json();
    
    if (!result.audioUrl) {
      throw new Error('Upload succeeded but no audio URL returned');
    }
    
    return {
      audioUrl: result.audioUrl,
      artworkUrl: result.artworkUrl,
      audioPath: result.audioPath,
      artworkPath: result.artworkPath
    };
  } catch (error) {
    // Network errors or other fetch failures
    if (error.message.includes('fetch')) {
      throw new Error(`Network error: Cannot reach upload server at ${WORKER_URL}`);
    }
    throw error;
  }
}
