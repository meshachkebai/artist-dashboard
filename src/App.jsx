import React, { useState, useEffect } from 'react';
import './App.css'
import { createClient } from '@supabase/supabase-js'
import { getTrackDuration, formatDuration, isValidDuration } from './utils/durationDetector'
import { getComprehensiveMetadata, formatFileSize, getQualityInfo } from './utils/metadataDetector'
import {
  validateArtistName,
  validateTrackTitle,
  validateAlbumName,
  validateGenre,
  validateAudioFile,
  validateArtworkFile,
  validateYear,
  validateBPM
} from './utils/validation'
import ProtectedDashboard from './components/ProtectedDashboard'
import { useAuth } from './hooks/useAuth'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

function App({ artistName: propArtistName, isAdmin: propIsAdmin }) {
  const { artistName: hookArtistName, isAdmin: hookIsAdmin, logout } = useAuth();

  // Use props if provided (from router), otherwise fall back to hook
  const artistName = propArtistName || hookArtistName;
  const isAdmin = propIsAdmin !== undefined ? propIsAdmin : hookIsAdmin;
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    title: '',
    artist: '',
    album: '',
    year: '',
    genre: '',
    customGenre: '',
    duration_seconds: '',
    bpm: null,
    file: null,
    artwork: null,
    isSingle: false,
    allowMultipleHeadliners: false,
    hasFeaturing: false,
    hasContributing: false,
    headliners: [''],
    featuring: [''],
    contributing: [''],
    has_explicit_language: false,
    has_adult_themes: false
  });

  // Metadata detection state
  const [detectedMetadata, setDetectedMetadata] = useState(null);
  const [isDetectingMetadata, setIsDetectingMetadata] = useState(false);
  const [metadataError, setMetadataError] = useState(null);
  const [originalMetadata, setOriginalMetadata] = useState(null);

  // Duration detection state (keeping for backward compatibility)
  const [detectedDuration, setDetectedDuration] = useState(0);
  const [isDetectingDuration, setIsDetectingDuration] = useState(false);
  const [detectionError, setDetectionError] = useState(null);

  useEffect(() => {
    loadTracks();
  }, []);

  // Auto-fill artist name for non-admin users
  useEffect(() => {
    if (!isAdmin && artistName && !uploadForm.artist) {
      setUploadForm(prev => ({
        ...prev,
        artist: artistName
      }));
    }
  }, [artistName, isAdmin]);

  // Auto-populate album when single release is checked
  useEffect(() => {
    if (uploadForm.isSingle && uploadForm.title) {
      // Single checked: Override with single format
      setUploadForm(prev => ({
        ...prev,
        album: `${prev.title} - Single`
      }));
    } else if (!uploadForm.isSingle) {
      // Single unchecked: Smart fallback to metadata or blank
      setUploadForm(prev => ({
        ...prev,
        album: originalMetadata?.album || '' // Restore metadata album or clear
      }));
    }
  }, [uploadForm.isSingle, uploadForm.title, originalMetadata]);

  const loadTracks = async () => {
    try {
      setLoading(true);

      // Admin sees all tracks, artists see only their own
      let query = supabase
        .from('mvp_content')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!isAdmin && artistName) {
        query = query.eq('artist', artistName);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Failed to load tracks:', error);
        return;
      }

      // All tracks now store full URLs, no transformation needed
      const transformedTracks = data.map(track => ({
        ...track,
        duration: track.duration_seconds * 1000 // Convert to milliseconds for consistency
      }));

      setTracks(transformedTracks);
    } catch (error) {
      console.error('Failed to load tracks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setUploadForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Dynamic artist field management
  const addArtistField = (type) => {
    setUploadForm(prev => ({
      ...prev,
      [type]: [...prev[type], '']
    }));
  };

  const removeArtistField = (type, index) => {
    setUploadForm(prev => ({
      ...prev,
      [type]: prev[type].filter((_, i) => i !== index)
    }));
  };

  const updateArtistField = (type, index, value) => {
    setUploadForm(prev => ({
      ...prev,
      [type]: prev[type].map((artist, i) => i === index ? value : artist)
    }));
  };

  const handleFileChange = async (e) => {
    const { name, files } = e.target;
    const file = files[0];

    // Update form state
    setUploadForm(prev => ({
      ...prev,
      [name]: file
    }));

    // If this is an audio file, trigger comprehensive metadata detection
    if (file && name === 'file' && file.type.startsWith('audio/')) {
      setIsDetectingMetadata(true);
      setMetadataError(null);


      try {
        console.log('🎵 Extracting comprehensive metadata from:', file.name);

        // Extract comprehensive metadata
        const metadata = await getComprehensiveMetadata(file);

        if (metadata) {
          // Use the comprehensive metadata detector to create form data
          const { createFormDataFromMetadata } = await import('./utils/metadataDetector');
          const formData = createFormDataFromMetadata(metadata);

          console.log('✅ Metadata extracted successfully:', {
            title: formData.title,
            artist: formData.artist,
            album: formData.album,
            year: formData.year,
            genre: formData.genre,
            duration: formData.duration_seconds,
            bitrate: formData.technical.bitrate,
            fileSize: formatFileSize(formData.technical.fileSize)
          });

          // Store original metadata for fallback
          setOriginalMetadata({
            title: formData.title,
            artist: formData.artist,
            album: formData.album,
            year: formData.year,
            genre: formData.genre
          });

          // Update form with all detected metadata
          setUploadForm(prev => ({
            ...prev,
            title: formData.title || prev.title,
            artist: formData.artist || prev.artist,
            album: formData.album || prev.album,
            year: formData.year || prev.year,
            genre: formData.genre || prev.genre, // Smart genre suggestion
            duration_seconds: formData.duration_seconds || prev.duration_seconds,
            bpm: formData.bpm || prev.bpm
          }));

          // Store technical metadata for display (including BPM)
          setDetectedMetadata({
            ...formData.technical,
            bpm: formData.bpm
          });
          setDetectedDuration(parseInt(formData.duration_seconds) || 0);

          // Check bitrate limit (128kbps max for beta/MVP)
          const bitrateKbps = Math.round(formData.technical.bitrate / 1000);
          if (bitrateKbps > 128) {
            alert(`⚠️ Bitrate Limit Exceeded\n\nYour file has a bitrate of ${bitrateKbps}kbps.\nFor beta/MVP, we only accept files at 128kbps or lower.\n\nPlease re-encode your file to 128kbps and try again.`);
            // Clear the file
            setUploadForm(prev => ({
              ...prev,
              file: null
            }));
            document.getElementById('file-input').value = '';
            setDetectedMetadata(null);
            setDetectedDuration(0);
            return;
          }
        }

      } catch (error) {
        console.error('❌ Metadata detection failed:', error);
        setMetadataError(error.message);
        setDetectedMetadata(null);
        setDetectedDuration(0);

        // Fallback: set default duration
        setUploadForm(prev => ({
          ...prev,
          duration_seconds: '180' // 3 minutes default
        }));
      } finally {
        setIsDetectingMetadata(false);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate all inputs
    const artistValidation = validateArtistName(uploadForm.artist);
    if (!artistValidation.valid) {
      alert(artistValidation.error);
      return;
    }

    const titleValidation = validateTrackTitle(uploadForm.title);
    if (!titleValidation.valid) {
      alert(titleValidation.error);
      return;
    }

    const albumValidation = validateAlbumName(uploadForm.album);
    if (!albumValidation.valid) {
      alert(albumValidation.error);
      return;
    }

    const genreValidation = validateGenre(uploadForm.genre === 'Other' ? uploadForm.customGenre : uploadForm.genre);
    if (!genreValidation.valid) {
      alert(genreValidation.error);
      return;
    }

    const audioValidation = validateAudioFile(uploadForm.file);
    if (!audioValidation.valid) {
      alert(audioValidation.error);
      return;
    }

    const artworkValidation = validateArtworkFile(uploadForm.artwork);
    if (!artworkValidation.valid) {
      alert(artworkValidation.error);
      return;
    }

    const yearValidation = validateYear(uploadForm.year);
    if (!yearValidation.valid) {
      alert(yearValidation.error);
      return;
    }

    const bpmValidation = validateBPM(uploadForm.bpm);
    if (!bpmValidation.valid) {
      alert(bpmValidation.error);
      return;
    }

    try {
      setLoading(true);

      console.log('Uploading track:', {
        title: uploadForm.title,
        artist: uploadForm.artist,
        genre: uploadForm.genre,
        fileName: uploadForm.file.name
      });

      // Create artist-specific folder structure
      const artistFolder = uploadForm.artist.toLowerCase().replace(/[^a-z0-9]/g, '-');

      // Upload audio file to artist folder
      const audioFileName = `content/mvp/${artistFolder}/${Date.now()}-${uploadForm.file.name}`;
      console.log('Attempting upload to:', audioFileName);

      const { data: audioData, error: audioError } = await supabase.storage
        .from('stream')
        .upload(audioFileName, uploadForm.file, {
          contentType: uploadForm.file.type,
          upsert: true, // Changed to true to allow overwrites
          cacheControl: '3600'
        });

      if (audioError) {
        console.error('❌ Audio upload error:', audioError);
        console.error('Error details:', {
          message: audioError.message,
          statusCode: audioError.statusCode,
          error: audioError.error
        });

        // Try alternative bucket name if 'stream' doesn't work
        if (audioError.message.includes('bucket') || audioError.message.includes('not found')) {
          console.log('Trying alternative bucket name...');
          const altResult = await supabase.storage
            .from('storage')
            .upload(audioFileName, uploadForm.file, {
              contentType: uploadForm.file.type,
              upsert: true
            });

          if (altResult.error) {
            console.error('❌ Alternative bucket also failed:', altResult.error);
            alert(`Upload failed: ${audioError.message}`);
            return;
          } else {
            console.log('✅ Upload succeeded with alternative bucket');
          }
        } else {
          alert(`Upload failed: ${audioError.message}`);
          return;
        }
      } else {
        console.log('✅ Audio upload successful');
      }

      // Upload artwork if provided to art folder (no artist subfolder)
      let artworkPath = null;
      if (uploadForm.artwork) {
        const artworkFileName = `content/mvp/art/${Date.now()}-${uploadForm.artwork.name}`;
        console.log('Uploading artwork to:', artworkFileName);

        const { data: artworkData, error: artworkError } = await supabase.storage
          .from('stream')
          .upload(artworkFileName, uploadForm.artwork, {
            contentType: uploadForm.artwork.type,
            upsert: false,
          });

        if (artworkError) {
          console.error('❌ Artwork upload error:', artworkError);
          // Don't fail the whole request if artwork upload fails
        } else {
          artworkPath = artworkFileName;
          console.log('✅ Artwork uploaded successfully to:', artworkPath);
        }
      } else {
        console.log('No artwork file provided');
      }

      // Construct full URLs for storage
      const audioFileUrl = `${SUPABASE_URL}/storage/v1/object/public/stream/${audioFileName}`;
      const artworkFileUrl = artworkPath ? `${SUPABASE_URL}/storage/v1/object/public/stream/${artworkPath}` : null;

      // Determine final genre value
      const finalGenre = uploadForm.genre === 'Other'
        ? uploadForm.customGenre.trim()
        : uploadForm.genre;

      // Build artist_credits JSON object
      let artistCredits = null;

      // Only create artist_credits if there are additional artists beyond the primary
      const hasAdditionalHeadliners = uploadForm.allowMultipleHeadliners &&
        uploadForm.headliners.some(h => h.trim() !== '');
      const hasFeaturing = uploadForm.hasFeaturing &&
        uploadForm.featuring.some(f => f.trim() !== '');

      if (hasAdditionalHeadliners || hasFeaturing) {
        artistCredits = {};

        // Add headliners (additional artists beyond primary)
        if (hasAdditionalHeadliners) {
          artistCredits.headliners = uploadForm.headliners
            .filter(name => name.trim() !== '')
            .map(name => ({
              name: name.trim(),
              id: name.toLowerCase().replace(/[^a-z0-9]/g, '-')
            }));
        }

        // Add featuring artists
        if (hasFeaturing) {
          artistCredits.featuring = uploadForm.featuring
            .filter(name => name.trim() !== '')
            .map(name => ({
              name: name.trim(),
              id: name.toLowerCase().replace(/[^a-z0-9]/g, '-')
            }));
        }
      }

      console.log('Artist credits to save:', artistCredits);

      // Insert track record into mvp_content table with sanitized values
      const { data: trackData, error: insertError } = await supabase
        .from('mvp_content')
        .insert({
          title: titleValidation.sanitized,
          artist: artistValidation.sanitized,
          genre: genreValidation.sanitized || 'Unknown',
          file_path: audioFileUrl,
          artwork_path: artworkFileUrl,
          duration_seconds: uploadForm.duration_seconds ? parseInt(uploadForm.duration_seconds) : 180,
          bpm: bpmValidation.sanitized,
          created_at: new Date().toISOString(),
          artist_credits: artistCredits,
          has_explicit_language: uploadForm.has_explicit_language,
          has_adult_themes: uploadForm.has_adult_themes,
        })
        .select()
        .single();

      if (insertError) {
        console.error('❌ Database insert error:', insertError);
        alert(`Upload failed: ${insertError.message}`);
        return;
      }

      alert(`Track "${uploadForm.title}" uploaded successfully!`);
      console.log('✅ Upload successful:', trackData);

      // Reset form
      setUploadForm({
        title: '',
        artist: '',
        album: '',
        year: '',
        genre: '',
        customGenre: '',
        duration_seconds: '',
        bpm: null,
        file: null,
        artwork: null,
        isSingle: false,
        allowMultipleHeadliners: false,
        hasFeaturing: false,
        hasContributing: false,
        headliners: [''],
        featuring: [''],
        contributing: [''],
        has_explicit_language: false,
        has_adult_themes: false
      });

      // Reset metadata detection state
      setDetectedMetadata(null);
      setMetadataError(null);
      setIsDetectingMetadata(false);
      setOriginalMetadata(null);

      // Reset duration detection state
      setDetectedDuration(0);
      setDetectionError(null);
      setIsDetectingDuration(false);

      // Clear file inputs
      document.getElementById('file-input').value = '';
      document.getElementById('artwork-input').value = '';

      loadTracks();

    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tracks-page">
      <div className="page-header">
        <h1>{isAdmin ? 'All Tracks' : 'My Tracks'}</h1>
        <p className="page-subtitle">Upload and manage your music</p>
      </div>

      <div className="container">
        <div className="upload-section card">
          <h2 style={{ color: 'var(--brand-primary)' }}>Upload New Track</h2>
          <form onSubmit={handleSubmit} className="upload-form">
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label htmlFor="file">Audio File *</label>
                  {isDetectingMetadata && (
                    <div style={{
                      width: '16px',
                      height: '16px',
                      border: '2px solid var(--border-color, #e0e0e0)',
                      borderTop: '2px solid var(--brand-primary)',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite'
                    }} />
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <label style={{ fontSize: '0.875rem', cursor: 'pointer' }}>
                    <input type="checkbox" name="has_explicit_language" checked={uploadForm.has_explicit_language} onChange={handleInputChange} />
                    Explicit Language
                  </label>
                  <label style={{ fontSize: '0.875rem', cursor: 'pointer' }}>
                    <input type="checkbox" name="has_adult_themes" checked={uploadForm.has_adult_themes} onChange={handleInputChange} />
                    Adult Themes
                  </label>
                </div>
              </div>
              <div className="form-group">
                <input
                  type="file"
                  id="file-input"
                  name="file"
                  onChange={handleFileChange}
                  accept="audio/*"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="title">Track Title *</label>
              <input
                type="text"
                id="title"
                name="title"
                value={uploadForm.title}
                onChange={handleInputChange}
                required
                placeholder="Enter track title"
              />
            </div>

            {/* Artist Roles Section */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label htmlFor="artist">Artist Name</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <label style={{ fontSize: '0.875rem', cursor: 'pointer' }}>
                    <input type="checkbox" name="allowMultipleHeadliners" checked={uploadForm.allowMultipleHeadliners} onChange={handleInputChange} />
                    Also Headlining
                  </label>
                  <label style={{ fontSize: '0.875rem', cursor: 'pointer' }}>
                    <input type="checkbox" name="hasFeaturing" checked={uploadForm.hasFeaturing} onChange={handleInputChange} />
                    Featuring
                  </label>
                  <label style={{ fontSize: '0.875rem', cursor: 'pointer' }}>
                    <input type="checkbox" name="hasContributing" checked={uploadForm.hasContributing} onChange={handleInputChange} />
                    Contributing
                  </label>
                </div>
              </div>

              <div className="form-group">
                <input
                  type="text"
                  id="artist"
                  name="artist"
                  value={isAdmin ? uploadForm.artist : artistName}
                  onChange={handleInputChange}
                  placeholder={isAdmin ? "Enter primary artist name" : artistName}
                  required
                  readOnly={!isAdmin}
                  style={!isAdmin ? { cursor: 'not-allowed', opacity: 0.6 } : {}}
                />
              </div>

              {/* Dynamic Multiple Headliners - Directly under artist */}
              {uploadForm.allowMultipleHeadliners && (
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label>Headlining Artists</label>
                    <button
                      type="button"
                      onClick={() => addArtistField('headliners')}
                      style={{
                        fontSize: '1.2rem',
                        background: 'none',
                        border: 'none',
                        color: 'var(--brand-primary)',
                        cursor: 'pointer',
                        padding: '0.25rem'
                      }}
                      title="Add another headlining artist"
                    >
                      +
                    </button>
                  </div>

                  {/* Dynamic input fields */}
                  {uploadForm.headliners.map((artist, index) => (
                    <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                      <input
                        value={artist}
                        onChange={(e) => updateArtistField('headliners', index, e.target.value)}
                        placeholder={`Headlining Artist ${index + 1}`}
                        style={{ flex: 1 }}
                      />
                      {uploadForm.headliners.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeArtistField('headliners', index)}
                          style={{
                            background: 'var(--danger, #dc3545)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '0.5rem',
                            cursor: 'pointer',
                            fontSize: '1rem',
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title="Remove this artist"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Dynamic Featuring Artists - Directly under artist */}
              {uploadForm.hasFeaturing && (
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label>Featuring Artists</label>
                    <button
                      type="button"
                      onClick={() => addArtistField('featuring')}
                      style={{
                        fontSize: '1.2rem',
                        background: 'none',
                        border: 'none',
                        color: 'var(--brand-primary)',
                        cursor: 'pointer',
                        padding: '0.25rem'
                      }}
                      title="Add another featuring artist"
                    >
                      +
                    </button>
                  </div>

                  {/* Dynamic input fields */}
                  {uploadForm.featuring.map((artist, index) => (
                    <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                      <input
                        value={artist}
                        onChange={(e) => updateArtistField('featuring', index, e.target.value)}
                        placeholder={`Featuring Artist ${index + 1}`}
                        style={{ flex: 1 }}
                      />
                      {uploadForm.featuring.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeArtistField('featuring', index)}
                          style={{
                            background: 'var(--danger, #dc3545)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '0.5rem',
                            cursor: 'pointer',
                            fontSize: '1rem',
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title="Remove this artist"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Dynamic Contributing Artists - Directly under artist */}
              {uploadForm.hasContributing && (
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label>Contributing Artists</label>
                    <button
                      type="button"
                      onClick={() => addArtistField('contributing')}
                      style={{
                        fontSize: '1.2rem',
                        background: 'none',
                        border: 'none',
                        color: 'var(--brand-primary)',
                        cursor: 'pointer',
                        padding: '0.25rem'
                      }}
                      title="Add another contributing artist"
                    >
                      +
                    </button>
                  </div>

                  {/* Dynamic input fields */}
                  {uploadForm.contributing.map((artist, index) => (
                    <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                      <input
                        value={artist}
                        onChange={(e) => updateArtistField('contributing', index, e.target.value)}
                        placeholder={`Contributing Artist ${index + 1}`}
                        style={{ flex: 1 }}
                      />
                      {uploadForm.contributing.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeArtistField('contributing', index)}
                          style={{
                            background: 'var(--danger, #dc3545)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '0.5rem',
                            cursor: 'pointer',
                            fontSize: '1rem',
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title="Remove this artist"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Album and Single Release Checkbox */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label htmlFor="album">Album</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label htmlFor="isSingle" style={{ fontSize: '0.875rem', cursor: 'pointer' }}>
                    Is this a single release?
                  </label>
                  <input
                    type="checkbox"
                    id="isSingle"
                    name="isSingle"
                    checked={uploadForm.isSingle}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
              <div className="form-group">
                <input
                  type="text"
                  id="album"
                  name="album"
                  value={uploadForm.album}
                  onChange={handleInputChange}
                  disabled={uploadForm.isSingle}
                  placeholder={uploadForm.isSingle ? "Auto-generated for singles" : "Enter album name"}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="year">Year</label>
              <input
                type="number"
                id="year"
                name="year"
                value={uploadForm.year}
                onChange={handleInputChange}
                placeholder="2024"
                min="1900"
                max={new Date().getFullYear() + 1}
              />
            </div>

            <div className="form-group">
              <label htmlFor="genre">Genre</label>
              <select
                id="genre"
                name="genre"
                value={uploadForm.genre}
                onChange={handleInputChange}
              >
                <option value="">Select genre</option>
                <option value="Pop">Pop</option>
                <option value="Rock">Rock</option>
                <option value="Jazz">Jazz</option>
                <option value="Electronic">Electronic</option>
                <option value="Hip-Hop">Hip-Hop</option>
                <option value="Classical">Classical</option>
                <option value="Country">Country</option>
                <option value="R&B">R&B</option>
                <option value="Reggae">Reggae</option>
                <option value="Blues">Blues</option>
                <option value="Folk">Folk</option>
                <option value="Indie">Indie</option>
                <option value="Alternative">Alternative</option>
                <option value="Ambient">Ambient</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Conditional custom genre input */}
            {uploadForm.genre === 'Other' && (
              <div className="form-group">
                <label htmlFor="customGenre">Custom Genre *</label>
                <input
                  type="text"
                  id="customGenre"
                  name="customGenre"
                  value={uploadForm.customGenre}
                  onChange={handleInputChange}
                  placeholder="Enter custom genre (e.g., Progressive Death Metal)"
                  required
                />
              </div>
            )}



            <div className="form-group">
              <label htmlFor="duration_seconds">
                Duration (seconds)
                {isDetectingDuration && (
                  <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--brand-primary)' }}>
                    Detecting...
                  </span>
                )}
                {detectedDuration > 0 && !isDetectingDuration && (
                  <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--success, #28a745)' }}>
                    ✓ Auto-detected ({formatDuration(detectedDuration * 1000)})
                  </span>
                )}
                {detectionError && (
                  <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--danger, #dc3545)' }}>
                    ⚠ Detection failed
                  </span>
                )}
              </label>
              <input
                type="number"
                id="duration_seconds"
                name="duration_seconds"
                value={uploadForm.duration_seconds}
                onChange={handleInputChange}
                placeholder="180"
                min="1"
                disabled={detectedDuration > 0 && !detectionError}
                title={detectedDuration > 0 && !detectionError ? 'Duration automatically detected from audio file' : ''}
                style={{
                  borderColor: detectedDuration > 0 && !detectionError ? 'var(--success, #28a745)' : '',
                  color: detectedDuration > 0 && !detectionError ? 'var(--success, #28a745)' : ''
                }}
              />
              {detectionError && (
                <div style={{ fontSize: '12px', color: 'var(--danger, #dc3545)', marginTop: '4px' }}>
                  {detectionError}. Using default duration (3:00).
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="artwork">Artwork Image</label>
              <input
                type="file"
                id="artwork-input"
                name="artwork"
                onChange={handleFileChange}
                accept="image/*"
              />
            </div>

            {/* Technical metadata display */}
            {detectedMetadata && (
              <div className="metadata-display" style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '1rem',
                marginTop: '1rem'
              }}>
                <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--text-primary)' }}>
                  Track Metadata
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.875rem' }}>
                  <div>
                    <strong>Format:</strong> {detectedMetadata.codec || 'Unknown'}
                  </div>
                  <div>
                    <strong>Bitrate:</strong> {detectedMetadata.bitrate ? `${Math.round(detectedMetadata.bitrate / 1000)}kbps` : 'Unknown'}
                  </div>
                  <div>
                    <strong>Sample Rate:</strong> {detectedMetadata.sampleRate ? `${detectedMetadata.sampleRate}Hz` : 'Unknown'}
                  </div>
                  <div>
                    <strong>Channels:</strong> {detectedMetadata.channels || 'Unknown'}
                  </div>
                  <div>
                    <strong>File Size:</strong> {formatFileSize(detectedMetadata.fileSize)}
                  </div>
                  <div>
                    <strong>Quality: </strong>
                    <span style={{
                      color: detectedMetadata.quality?.color || 'var(--text-secondary)',
                      fontWeight: '600'
                    }}>
                      {detectedMetadata.quality?.description || 'Unknown'}
                    </span>
                  </div>
                  {detectedMetadata.bpm && (
                    <div>
                      <strong>BPM: </strong>
                      <span style={{
                        color: detectedMetadata.quality?.color || 'var(--text-secondary)',
                        fontWeight: '600'
                      }}>
                        {detectedMetadata.bpm}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Metadata detection status */}
            {isDetectingMetadata && (
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '1.5rem',
                marginTop: '1rem'
              }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  border: '4px solid var(--border-color, #e0e0e0)',
                  borderTop: '4px solid var(--brand-primary)',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
              </div>
            )}

            {metadataError && (
              <div style={{
                backgroundColor: 'var(--danger-bg, #f8d7da)',
                border: '1px solid var(--danger, #dc3545)',
                borderRadius: '8px',
                padding: '0.75rem',
                marginTop: '1rem',
                color: 'var(--danger, #dc3545)',
                fontSize: '0.875rem'
              }}>
                ⚠️ Metadata detection failed: {metadataError}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn btn-primary upload-btn">
              {loading ? 'Uploading...' : 'Upload Track'}
            </button>
          </form>
        </div>

        <div className="tracks-section card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ color: 'var(--brand-primary)', margin: 0 }}>
              Recent Tracks ({tracks.length})
            </h2>
            <button onClick={loadTracks} className="btn btn-secondary refresh-btn">
              Refresh
            </button>
          </div>

          {loading && <p className="text-muted">Loading tracks...</p>}

          <div className="tracks-list">
            {tracks.slice(0, 10).map((track) => (
              <div key={track.id} className="track-item card">
                <div className="track-info">
                  <h3 style={{ color: 'var(--brand-accent)', margin: '0 0 0.5rem 0' }}>
                    {track.title}
                  </h3>
                  <p className="text-secondary"><strong>Artist:</strong> {track.artist}</p>
                  <p className="text-secondary"><strong>Genre:</strong> {track.genre || 'Unknown'}</p>
                  <p className="text-secondary"><strong>Duration:</strong> {Math.floor(track.duration / 1000)}s</p>
                  <p className="text-muted"><strong>Uploaded:</strong> {new Date(track.created_at).toLocaleDateString()}</p>
                </div>
                {track.artwork_path ? (
                  <div>
                    <img
                      src={track.artwork_path}
                      alt={track.title}
                      className="track-artwork"
                      onError={(e) => console.error('Image failed to load:', track.artwork_path)}
                      onLoad={() => console.log('Image loaded successfully:', track.artwork_path)}
                    />
                  </div>
                ) : (
                  <div style={{ color: 'red', fontSize: '12px' }}>
                    No artwork path
                  </div>
                )}
              </div>
            ))}
          </div>

          {tracks.length === 0 && !loading && (
            <p className="text-muted empty-state">No tracks found. Upload your first track above!</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
