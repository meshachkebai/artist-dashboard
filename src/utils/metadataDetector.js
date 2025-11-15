/**
 * Comprehensive Audio Metadata Detection Utility
 * Uses music-metadata library for detailed audio file analysis
 * Includes automatic BPM detection via audio analysis
 * Includes LUFS loudness normalization (EBU R128 standard)
 */

import { parseBlob } from 'music-metadata';
import MusicTempo from 'music-tempo';

/**
 * Detects BPM from audio file using audio analysis
 * @param {File} audioFile - The audio file to analyze
 * @param {Function} onProgress - Progress callback (optional)
 * @returns {Promise<number|null>} Detected BPM or null if detection fails
 */
const detectBPMFromAudio = async (audioFile, onProgress = null) => {
  try {
    console.log('🎼 Analyzing audio for BPM detection...');
    if (onProgress) onProgress('bpm', 0);

    // Create audio context
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Read file as array buffer
    const arrayBuffer = await audioFile.arrayBuffer();
    if (onProgress) onProgress('bpm', 30);

    // Decode audio data
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    if (onProgress) onProgress('bpm', 60);

    // Get audio data from first channel
    const audioData = audioBuffer.getChannelData(0);

    // Analyze tempo
    const musicTempo = new MusicTempo(audioData);
    if (onProgress) onProgress('bpm', 90);

    // Close audio context to free resources
    audioContext.close();

    const bpm = Math.round(musicTempo.tempo);
    console.log(`✅ BPM detected: ${bpm}`);
    if (onProgress) onProgress('bpm', 100);

    return bpm > 0 ? bpm : null;

  } catch (error) {
    console.warn('⚠️ BPM detection failed:', error.message);
    if (onProgress) onProgress('bpm', 100);
    return null;
  }
};

/**
 * Calculates RMS (Root Mean Square) loudness for audio buffer
 * Simplified LUFS-like measurement for browser-based analysis
 * @param {AudioBuffer} audioBuffer - Decoded audio buffer
 * @returns {number} RMS loudness in dB
 */
const calculateRMSLoudness = (audioBuffer) => {
  const numberOfChannels = audioBuffer.numberOfChannels;
  let sumSquares = 0;
  let sampleCount = 0;

  // Process all channels
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const channelData = audioBuffer.getChannelData(channel);
    
    for (let i = 0; i < channelData.length; i++) {
      sumSquares += channelData[i] * channelData[i];
      sampleCount++;
    }
  }

  // Calculate RMS
  const rms = Math.sqrt(sumSquares / sampleCount);
  
  // Convert to dB (LUFS-like scale)
  // Reference: -23 LUFS is approximately 0.1 RMS
  const db = 20 * Math.log10(rms) - 0.691;
  
  return db;
};

/**
 * Finds true peak value in audio buffer
 * @param {AudioBuffer} audioBuffer - Decoded audio buffer
 * @returns {number} True peak in dBTP
 */
const calculateTruePeak = (audioBuffer) => {
  const numberOfChannels = audioBuffer.numberOfChannels;
  let maxPeak = 0;

  // Find maximum absolute sample value across all channels
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const channelData = audioBuffer.getChannelData(channel);
    
    for (let i = 0; i < channelData.length; i++) {
      const absSample = Math.abs(channelData[i]);
      if (absSample > maxPeak) {
        maxPeak = absSample;
      }
    }
  }

  // Convert to dBTP
  const dbtp = 20 * Math.log10(maxPeak);
  
  return dbtp;
};

/**
 * Calculates loudness range (simplified)
 * @param {AudioBuffer} audioBuffer - Decoded audio buffer
 * @returns {number} Loudness range in LU
 */
const calculateLoudnessRange = (audioBuffer) => {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const blockSize = Math.floor(audioBuffer.sampleRate * 0.4); // 400ms blocks
  const blocks = [];

  // Calculate loudness for each block
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const channelData = audioBuffer.getChannelData(channel);
    
    for (let i = 0; i < channelData.length; i += blockSize) {
      const blockEnd = Math.min(i + blockSize, channelData.length);
      let sumSquares = 0;
      
      for (let j = i; j < blockEnd; j++) {
        sumSquares += channelData[j] * channelData[j];
      }
      
      const rms = Math.sqrt(sumSquares / (blockEnd - i));
      const db = 20 * Math.log10(rms) - 0.691;
      blocks.push(db);
    }
  }

  // Sort blocks and calculate range between 10th and 95th percentile
  blocks.sort((a, b) => a - b);
  const p10 = blocks[Math.floor(blocks.length * 0.1)];
  const p95 = blocks[Math.floor(blocks.length * 0.95)];
  
  return p95 - p10;
};

/**
 * Analyzes loudness using simplified LUFS-like calculation
 * Note: This is a browser-based approximation, not full ITU-R BS.1770-4 compliance
 * @param {File} audioFile - The audio file to analyze
 * @param {Function} onProgress - Progress callback (optional)
 * @returns {Promise<Object>} Loudness data { lufs, truePeak, gain }
 */
const analyzeLoudness = async (audioFile, onProgress = null) => {
  try {
    console.log('🔊 Analyzing loudness (simplified LUFS)...');
    if (onProgress) onProgress('loudness', 0);

    // Create audio context
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Read file as array buffer
    const arrayBuffer = await audioFile.arrayBuffer();
    if (onProgress) onProgress('loudness', 30);

    // Decode audio data
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    if (onProgress) onProgress('loudness', 50);

    // Calculate RMS loudness (LUFS-like)
    const integratedLoudness = calculateRMSLoudness(audioBuffer);
    if (onProgress) onProgress('loudness', 70);

    // Calculate true peak
    const truePeak = calculateTruePeak(audioBuffer);
    if (onProgress) onProgress('loudness', 85);

    // Calculate loudness range
    const loudnessRange = calculateLoudnessRange(audioBuffer);
    if (onProgress) onProgress('loudness', 95);

    // Close audio context
    audioContext.close();

    // Calculate normalization gain to reach -14 LUFS target
    const targetLUFS = -14.0;
    const normalizationGain = targetLUFS - integratedLoudness;

    const loudnessData = {
      lufs: parseFloat(integratedLoudness.toFixed(2)),
      truePeak: parseFloat(truePeak.toFixed(2)),
      gain: parseFloat(normalizationGain.toFixed(2)),
      loudnessRange: parseFloat(loudnessRange.toFixed(2))
    };

    console.log(`✅ Loudness analyzed (simplified):`, {
      LUFS: loudnessData.lufs,
      'True Peak': loudnessData.truePeak,
      'Normalization Gain': loudnessData.gain,
      'Loudness Range': loudnessData.loudnessRange
    });
    
    if (onProgress) onProgress('loudness', 100);

    return loudnessData;

  } catch (error) {
    console.warn('⚠️ Loudness analysis failed:', error.message);
    if (onProgress) onProgress('loudness', 100);
    return {
      lufs: null,
      truePeak: null,
      gain: null,
      loudnessRange: null
    };
  }
};

/**
 * Extracts comprehensive metadata from audio file
 * @param {File} audioFile - The audio file to analyze
 * @param {Function} onProgress - Progress callback (stage, progress)
 * @returns {Promise<Object>} Complete metadata object
 */
export const getComprehensiveMetadata = async (audioFile, onProgress = null) => {
  try {
    console.log('🎵 Extracting metadata from:', audioFile.name);
    if (onProgress) onProgress('reading', 0);

    // Parse audio file metadata
    if (onProgress) onProgress('metadata', 0);
    const metadata = await parseBlob(audioFile);
    if (onProgress) onProgress('metadata', 100);

    // Extract BPM from metadata tags first
    let bpm = metadata.common?.bpm || null;

    // If no BPM in metadata, detect it from audio
    if (!bpm) {
      bpm = await detectBPMFromAudio(audioFile, onProgress);
    } else {
      console.log(`✅ BPM from metadata: ${bpm}`);
      if (onProgress) onProgress('bpm', 100);
    }

    // Analyze loudness (LUFS)
    const loudnessData = await analyzeLoudness(audioFile, onProgress);

    // Extract basic metadata
    const basicMetadata = {
      title: metadata.common?.title || '',
      artist: metadata.common?.artist || '',
      album: metadata.common?.album || '',
      year: metadata.common?.year || '',
      genre: metadata.common?.genre?.[0] || '', // First genre if multiple
      trackNumber: metadata.common?.track?.no || '',
      composer: metadata.common?.composer || '',
      comment: metadata.common?.comment?.[0] || '',
      bpm: bpm || null
    };

    // Extract technical metadata
    const technicalMetadata = {
      duration: metadata.format?.duration || 0,
      bitrate: metadata.format?.bitrate || 0,
      sampleRate: metadata.format?.sampleRate || 0,
      codec: metadata.format?.codec || '',
      channels: metadata.format?.numberOfChannels || 0,
      lossless: metadata.format?.lossless || false,
      container: metadata.format?.container || ''
    };

    // File information
    const fileInfo = {
      fileSize: audioFile.size,
      fileType: audioFile.type,
      fileName: audioFile.name,
      lastModified: audioFile.lastModified
    };

    const completeMetadata = {
      ...basicMetadata,
      ...technicalMetadata,
      ...fileInfo,
      // Loudness normalization data
      loudness: {
        lufs: loudnessData.lufs,
        truePeak: loudnessData.truePeak,
        normalizationGain: loudnessData.gain,
        loudnessRange: loudnessData.loudnessRange
      },
      // Raw metadata for debugging
      raw: metadata
    };

    console.log('✅ Metadata extracted successfully:', {
      title: completeMetadata.title,
      artist: completeMetadata.artist,
      duration: Math.floor(completeMetadata.duration),
      bitrate: completeMetadata.bitrate,
      bpm: completeMetadata.bpm,
      lufs: completeMetadata.loudness.lufs,
      normalizationGain: completeMetadata.loudness.normalizationGain,
      fileSize: `${(completeMetadata.fileSize / 1024 / 1024).toFixed(2)}MB`
    });

    if (onProgress) onProgress('complete', 100);

    return completeMetadata;

  } catch (error) {
    console.error('❌ Metadata extraction failed:', error);
    throw new Error(`Failed to extract metadata: ${error.message}`);
  }
};

/**
 * Suggests genre from predefined options based on metadata
 * @param {string} metadataGenre - Genre from file metadata
 * @returns {string} Best matching genre from dropdown options
 */
export const suggestGenre = (metadataGenre) => {
  if (!metadataGenre) return '';

  const genreOptions = [
    'Pop', 'Rock', 'Jazz', 'Electronic', 'Hip-Hop', 'Classical',
    'Country', 'R&B', 'Reggae', 'Blues', 'Folk', 'Indie',
    'Alternative', 'Ambient', 'Other'
  ];

  const lowerMetadataGenre = metadataGenre.toLowerCase();

  // Direct match
  const directMatch = genreOptions.find(option =>
    option.toLowerCase() === lowerMetadataGenre
  );
  if (directMatch) return directMatch;

  // Partial match
  const partialMatch = genreOptions.find(option =>
    option.toLowerCase().includes(lowerMetadataGenre) ||
    lowerMetadataGenre.includes(option.toLowerCase())
  );
  if (partialMatch) return partialMatch;

  // No good match found
  return '';
};

/**
 * Gets quality information based on technical metadata
 * @param {Object} metadata - Technical metadata object
 * @returns {Object} Quality assessment
 */
export const getQualityInfo = (metadata) => {
  const bitrate = metadata.bitrate;
  const sampleRate = metadata.sampleRate;
  const lossless = metadata.lossless;

  let level = 'unknown';
  let color = 'gray';
  let description = '';

  if (lossless) {
    level = 'lossless';
    color = 'green';
    description = 'Lossless audio quality';
  } else if (bitrate >= 320) {
    level = 'excellent';
    color = 'green';
    description = 'Excellent quality (320kbps+)';
  } else if (bitrate >= 256) {
    level = 'very_good';
    color = 'blue';
    description = 'Very good quality (256kbps+)';
  } else if (bitrate >= 192) {
    level = 'good';
    color = 'orange';
    description = 'Good quality (192kbps+)';
  } else if (bitrate >= 128) {
    level = 'acceptable';
    color = 'yellow';
    description = 'Acceptable quality (128kbps+)';
  } else {
    level = 'low';
    color = 'red';
    description = 'Low quality (<128kbps)';
  }

  return {
    level,
    color,
    description,
    bitrate,
    sampleRate,
    lossless
  };
};

/**
 * Formats file size in human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Validates audio file format and quality
 * @param {Object} metadata - Technical metadata
 * @returns {Object} Validation result
 */
export const validateAudioFile = (metadata) => {
  const issues = [];
  const warnings = [];

  // Check bitrate
  if (metadata.bitrate < 128) {
    issues.push('Low bitrate may result in poor audio quality');
  } else if (metadata.bitrate < 256) {
    warnings.push('Consider higher bitrate for better quality');
  }

  // Check sample rate
  if (metadata.sampleRate < 44100) {
    warnings.push('Low sample rate may affect audio clarity');
  }

  // Check file size (unusually large or small)
  const fileSizeMB = metadata.fileSize / 1024 / 1024;
  if (fileSizeMB > 100) {
    warnings.push('Very large file size - consider compression');
  } else if (fileSizeMB < 0.1) {
    issues.push('File may be corrupted or too small');
  }

  return {
    isValid: issues.length === 0,
    issues,
    warnings,
    score: Math.min(100, Math.max(0,
      50 + (metadata.bitrate / 320) * 30 + (metadata.sampleRate / 48000) * 20
    ))
  };
};

/**
 * Creates form data from metadata with smart defaults
 * @param {Object} metadata - Extracted metadata
 * @returns {Object} Form data object
 */
export const createFormDataFromMetadata = (metadata) => {
  return {
    title: metadata.title || '',
    artist: metadata.artist || '',
    album: metadata.album || '',
    year: metadata.year ? metadata.year.toString() : '',
    genre: suggestGenre(metadata.genre) || '',
    duration_seconds: metadata.duration ? Math.floor(metadata.duration).toString() : '180',
    bpm: metadata.bpm || null,
    track_number: metadata.trackNumber || null,
    // Technical info for display (not form fields)
    technical: {
      bitrate: metadata.bitrate,
      sampleRate: metadata.sampleRate,
      codec: metadata.codec,
      fileSize: metadata.fileSize,
      quality: getQualityInfo(metadata)
    }
  };
};
