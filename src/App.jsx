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
import { uploadToR2 } from './services/r2Upload'
import { ContributorList } from './components/shared/ContributorList'
import './components/shared/ContributorBadge.css'
import MyCreditsPage from './pages/MyCreditsPage'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

function App({ artistName: propArtistName, isAdmin: propIsAdmin }) {
  const { artistName: hookArtistName, isAdmin: hookIsAdmin, accountType, logout } = useAuth();

  // Use props if provided (from router), otherwise fall back to hook
  const artistName = propArtistName || hookArtistName;
  const isAdmin = propIsAdmin !== undefined ? propIsAdmin : hookIsAdmin;

  // Check if user can upload (artists and admins only, not contributors)
  const canUpload = isAdmin || accountType === 'artist';
  const [tracks, setTracks] = useState([]);
  const [editingTrack, setEditingTrack] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
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
    track_number: null,
    file: null,
    artwork: null,
    isSingle: false,
    allowMultipleHeadliners: false,
    hasFeaturing: false,
    hasContributing: false,
    headliners: [''],
    featuring: [''],
    contributing: [{ role: 'producer', name: '', customRole: '' }],
    primarySplit: '',
    headlinerSplits: [],
    featuringSplits: [],
    contributingSplits: [],
    splitAgreementSigned: false,
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

  // Bulk upload state
  const [uploadMode, setUploadMode] = useState('single'); // 'single' or 'bulk'
  const [bulkFiles, setBulkFiles] = useState([]);
  const [bulkSharedMetadata, setBulkSharedMetadata] = useState({
    album: '',
    artist: '',
    year: '',
    genre: '',
    artwork: null
  });
  const [bulkQueue, setBulkQueue] = useState([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });

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

  // Auto-populate album and track number when single release is checked
  useEffect(() => {
    if (uploadForm.isSingle && uploadForm.title) {
      // Single checked: Override with single format and set track number to 1
      setUploadForm(prev => ({
        ...prev,
        album: `${prev.title} - Single`,
        track_number: 1
      }));
    } else if (!uploadForm.isSingle) {
      // Single unchecked: Smart fallback to metadata or blank
      setUploadForm(prev => ({
        ...prev,
        album: originalMetadata?.album || '', // Restore metadata album or clear
        track_number: originalMetadata?.track_number || prev.track_number
      }));
    }
  }, [uploadForm.isSingle, uploadForm.title, originalMetadata]);

  const loadTracks = async () => {
    try {
      setLoading(true);

      let data, error;

      if (!isAdmin && artistName) {
        // For artists: get tracks they contributed to
        const { data: artistData, error: artistError } = await supabase
          .from('artists')
          .select('id')
          .eq('name', artistName)
          .single();

        if (artistError || !artistData) {
          console.error('Artist not found:', artistError);
          setTracks([]);
          return;
        }

        // Get track IDs where this artist contributed
        const { data: contributions, error: contribError } = await supabase
          .from('track_contributors')
          .select('track_id')
          .eq('artist_id', artistData.id);

        if (contribError) {
          console.error('Failed to load contributions:', contribError);
          return;
        }

        const trackIds = contributions.map(c => c.track_id);

        if (trackIds.length === 0) {
          setTracks([]);
          return;
        }

        // Get full track details
        const result = await supabase
          .from('mvp_content')
          .select('*')
          .in('id', trackIds)
          .neq('is_ad', true)
          .order('created_at', { ascending: false })
          .limit(50);

        data = result.data;
        error = result.error;
      } else {
        // Admin sees all tracks
        const result = await supabase
          .from('mvp_content')
          .select('*')
          .neq('is_ad', true)
          .order('created_at', { ascending: false })
          .limit(50);

        data = result.data;
        error = result.error;
      }

      if (error) {
        console.error('Failed to load tracks:', error);
        return;
      }

      // Get contributors for all tracks
      const trackIds = data.map(t => t.id);
      const { data: contributors } = await supabase
        .from('track_contributors')
        .select(`
          track_id,
          role,
          split_percentage,
          artists (
            id,
            name,
            has_account
          )
        `)
        .in('track_id', trackIds)
        .order('role');

      // Get analytics for all tracks
      const { data: allEvents, error: eventsError } = await supabase
        .from('analytics_events')
        .select('track_id, event_type, duration_seconds, access_code_id')
        .in('track_id', trackIds);

      console.log('App.jsx - Track IDs:', trackIds);
      console.log('App.jsx - Analytics Events:', allEvents);
      console.log('App.jsx - Events Error:', eventsError);

      if (eventsError) {
        console.error('Failed to load analytics:', eventsError);
      }

      // Get user profiles for location data
      const accessCodeIds = [...new Set((allEvents || []).map(e => e.access_code_id).filter(Boolean))];
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('access_code_id, city')
        .in('access_code_id', accessCodeIds);

      // Create lookup map for cities
      const cityByAccessCode = (profiles || []).reduce((acc, p) => {
        acc[p.access_code_id] = p.city;
        return acc;
      }, {});

      // Calculate stats and hotspots per track
      const statsByTrack = (allEvents || []).reduce((acc, event) => {
        if (!acc[event.track_id]) {
          acc[event.track_id] = {
            totalPlays: 0,
            qualifiedStreams: 0,
            cityCounts: {}
          };
        }

        if (event.event_type === 'play_start') {
          acc[event.track_id].totalPlays++;
        }

        if (event.event_type === 'play_end' && event.duration_seconds >= 30) {
          acc[event.track_id].qualifiedStreams++;

          // Track city for qualified streams
          const city = cityByAccessCode[event.access_code_id];
          if (city) {
            acc[event.track_id].cityCounts[city] = (acc[event.track_id].cityCounts[city] || 0) + 1;
          }
        }

        return acc;
      }, {});

      // Group contributors by track
      const contributorsByTrack = (contributors || []).reduce((acc, c) => {
        if (!acc[c.track_id]) acc[c.track_id] = [];
        acc[c.track_id].push(c);
        return acc;
      }, {});

      // Add contributors, stats, and convert duration
      const transformedTracks = data.map(track => {
        const stats = statsByTrack[track.id] || { totalPlays: 0, qualifiedStreams: 0, cityCounts: {} };
        const completionRate = stats.totalPlays > 0
          ? Math.round((stats.qualifiedStreams / stats.totalPlays) * 100)
          : 0;

        // Get top 3 cities sorted by stream count
        const topCities = Object.entries(stats.cityCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([city, count]) => ({ city, streams: count }));

        const hotspotCity = topCities[0]?.city || null;
        const hotspotStreams = topCities[0]?.streams || 0;

        // Check if current user is primary artist on this track
        const trackContributors = contributorsByTrack[track.id] || [];
        const myContribution = trackContributors.find(c => c.artists.name === artistName);
        const isPrimaryArtist = myContribution?.role === 'primary';
        const mySplit = myContribution?.split_percentage || null;

        return {
          ...track,
          duration: track.duration_seconds * 1000,
          contributors: trackContributors,
          isPrimaryArtist,
          myRole: myContribution?.role || null,
          mySplit,
          analytics: {
            totalPlays: stats.totalPlays,
            qualifiedStreams: stats.qualifiedStreams,
            completionRate,
            hotspotCity,
            hotspotStreams,
            topCities
          }
        };
      });

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
      [type]: type === 'contributing'
        ? [...prev[type], { role: 'producer', name: '', customRole: '', split: '' }]
        : [...prev[type], '']
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

  const updateContributorField = (index, field, value) => {
    setUploadForm(prev => ({
      ...prev,
      contributing: prev.contributing.map((contributor, i) =>
        i === index ? { ...contributor, [field]: value } : contributor
      )
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
            bpm: formData.bpm || prev.bpm,
            track_number: formData.track_number || prev.track_number
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

    // Only validate file if not editing (editing doesn't require new file)
    if (!editingTrack) {
      const audioValidation = validateAudioFile(uploadForm.file);
      if (!audioValidation.valid) {
        alert(audioValidation.error);
        return;
      }
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

      // Only upload files if not editing (or if new files provided)
      let audioFileUrl = null;
      let artworkFileUrl = null;

      if (!editingTrack) {
        // New upload - must have audio file
        console.log('Uploading track to R2:', {
          title: uploadForm.title,
          artist: uploadForm.artist,
          genre: uploadForm.genre,
          fileName: uploadForm.file.name
        });

        const { audioUrl, artworkUrl } = await uploadToR2({
          audioFile: uploadForm.file,
          artworkFile: uploadForm.artwork,
          artistName: uploadForm.artist,
          releaseTitle: uploadForm.album || `${uploadForm.title} - Single`,
          trackTitle: uploadForm.title,
          trackNumber: uploadForm.track_number
        });

        console.log('✅ R2 upload successful:', { audioUrl, artworkUrl });
        audioFileUrl = audioUrl;
        artworkFileUrl = artworkUrl;
      } else if (uploadForm.artwork) {
        // Editing - only upload new artwork if provided
        console.log('Uploading new artwork to R2');
        const { artworkUrl } = await uploadToR2({
          audioFile: null,
          artworkFile: uploadForm.artwork,
          artistName: uploadForm.artist,
          releaseTitle: uploadForm.album || `${uploadForm.title} - Single`,
          trackTitle: uploadForm.title,
          trackNumber: uploadForm.track_number
        });
        artworkFileUrl = artworkUrl;
      }

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
      const hasContributing = uploadForm.hasContributing &&
        uploadForm.contributing.some(c => c.name.trim() !== '');

      if (hasAdditionalHeadliners || hasFeaturing || hasContributing) {
        artistCredits = {};

        // Add primary artist split
        if (uploadForm.primarySplit) {
          artistCredits.primary_split = parseFloat(uploadForm.primarySplit);
        }

        // Add headliners (additional artists beyond primary)
        if (hasAdditionalHeadliners) {
          artistCredits.headliners = uploadForm.headliners
            .filter(name => name.trim() !== '')
            .map((name, index) => ({
              name: name.trim(),
              split: uploadForm.headlinerSplits?.[index] ? parseFloat(uploadForm.headlinerSplits[index]) : null,
              id: name.toLowerCase().replace(/[^a-z0-9]/g, '-')
            }));
        }

        // Add featuring artists
        if (hasFeaturing) {
          artistCredits.featuring = uploadForm.featuring
            .filter(name => name.trim() !== '')
            .map((name, index) => ({
              name: name.trim(),
              split: uploadForm.featuringSplits?.[index] ? parseFloat(uploadForm.featuringSplits[index]) : null,
              id: name.toLowerCase().replace(/[^a-z0-9]/g, '-')
            }));
        }

        // Add contributing artists with roles and splits
        if (hasContributing) {
          artistCredits.contributing = uploadForm.contributing
            .filter(c => c.name.trim() !== '')
            .map((c, index) => ({
              name: c.name.trim(),
              role: c.role === 'other' ? c.customRole.trim() : c.role,
              split: uploadForm.contributingSplits?.[index] ? parseFloat(uploadForm.contributingSplits[index]) : null,
              id: c.name.toLowerCase().replace(/[^a-z0-9]/g, '-')
            }));
        }
      }

      console.log('Artist credits to save:', artistCredits);

      // Update or Insert track record
      let trackData, dbError;

      if (editingTrack) {
        // Update existing track (all editable metadata)
        const updateData = {
          title: titleValidation.sanitized,
          artist: artistValidation.sanitized,
          album: albumValidation.sanitized || null,
          year: yearValidation.sanitized || null,
          genre: genreValidation.sanitized || 'Unknown',
          duration_seconds: uploadForm.duration_seconds ? parseInt(uploadForm.duration_seconds) : 180,
          bpm: bpmValidation.sanitized,
          track_number: uploadForm.track_number ? parseInt(uploadForm.track_number) : null,
          artist_credits: artistCredits,
          has_explicit_language: uploadForm.has_explicit_language,
          has_adult_themes: uploadForm.has_adult_themes,
        };

        // Only update artwork if new one provided
        if (artworkFileUrl) {
          updateData.artwork_path = artworkFileUrl;
        }

        const result = await supabase
          .from('mvp_content')
          .update(updateData)
          .eq('id', editingTrack.id)
          .select()
          .single();

        trackData = result.data;
        dbError = result.error;

        if (!dbError) {
          alert(`Track "${uploadForm.title}" updated successfully!`);
          setEditingTrack(null);
        }
      } else {
        // Insert new track
        const result = await supabase
          .from('mvp_content')
          .insert({
            title: titleValidation.sanitized,
            artist: artistValidation.sanitized,
            album: albumValidation.sanitized || null,
            year: yearValidation.sanitized || null,
            genre: genreValidation.sanitized || 'Unknown',
            file_path: audioFileUrl,
            artwork_path: artworkFileUrl,
            duration_seconds: uploadForm.duration_seconds ? parseInt(uploadForm.duration_seconds) : 180,
            bpm: bpmValidation.sanitized,
            track_number: uploadForm.track_number ? parseInt(uploadForm.track_number) : null,
            created_at: new Date().toISOString(),
            artist_credits: artistCredits,
            has_explicit_language: uploadForm.has_explicit_language,
            has_adult_themes: uploadForm.has_adult_themes,
          })
          .select()
          .single();

        trackData = result.data;
        dbError = result.error;

        if (!dbError) {
          alert(`Track "${uploadForm.title}" uploaded successfully!`);
        }
      }

      if (dbError) {
        console.error('❌ Database error:', dbError);
        alert(`Operation failed: ${dbError.message}`);
        return;
      }

      console.log('✅ Operation successful:', trackData);

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
        track_number: null,
        file: null,
        artwork: null,
        isSingle: false,
        allowMultipleHeadliners: false,
        hasFeaturing: false,
        hasContributing: false,
        headliners: [''],
        featuring: [''],
        contributing: [{ role: 'producer', name: '', customRole: '' }],
        primarySplit: '',
        headlinerSplits: [],
        featuringSplits: [],
        contributingSplits: [],
        splitAgreementSigned: false,
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
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      alert(`Upload failed: ${error.message || 'Please try again.'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTrack = async (trackId) => {
    if (!deleteConfirm || deleteConfirm !== trackId) {
      setDeleteConfirm(trackId);
      return;
    }

    try {
      setLoading(true);

      const { error } = await supabase
        .from('mvp_content')
        .delete()
        .eq('id', trackId);

      if (error) {
        console.error('Delete error:', error);
        alert('Failed to delete track');
        return;
      }

      alert('Track deleted successfully');
      setDeleteConfirm(null);
      loadTracks();
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Failed to delete track');
    } finally {
      setLoading(false);
    }
  };

  const handleEditTrack = (track) => {
    setEditingTrack(track);
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Parse artist_credits if exists
    const credits = track.artist_credits || {};
    const hasHeadliners = credits.headliners && credits.headliners.length > 0;
    const hasFeaturing = credits.featuring && credits.featuring.length > 0;
    const hasContributing = credits.contributing && credits.contributing.length > 0;

    // Populate form with ALL track data including splits
    setUploadForm({
      title: track.title,
      artist: track.artist,
      album: track.album || '',
      year: track.year || '',
      genre: track.genre || '',
      customGenre: '',
      duration_seconds: track.duration_seconds || '',
      bpm: track.bpm || null,
      track_number: track.track_number || null,
      file: null, // Can't edit file
      artwork: null, // Can upload new artwork
      isSingle: track.album?.includes('- Single') || false,
      allowMultipleHeadliners: hasHeadliners,
      hasFeaturing: hasFeaturing,
      hasContributing: hasContributing,
      headliners: hasHeadliners ? credits.headliners.map(h => h.name) : [''],
      featuring: hasFeaturing ? credits.featuring.map(f => f.name) : [''],
      contributing: hasContributing
        ? credits.contributing.map(c => ({
          role: ['producer', 'songwriter', 'composer', 'engineer', 'mixer', 'mastering', 'editor', 'arranger', 'lyricist', 'performer'].includes(c.role) ? c.role : 'other',
          name: c.name,
          customRole: ['producer', 'songwriter', 'composer', 'engineer', 'mixer', 'mastering', 'editor', 'arranger', 'lyricist', 'performer'].includes(c.role) ? '' : c.role
        }))
        : [{ role: 'producer', name: '', customRole: '' }],
      primarySplit: credits.primary_split || '',
      headlinerSplits: hasHeadliners ? credits.headliners.map(h => h.split || '') : [],
      featuringSplits: hasFeaturing ? credits.featuring.map(f => f.split || '') : [],
      contributingSplits: hasContributing ? credits.contributing.map(c => c.split || '') : [],
      has_explicit_language: track.has_explicit_language || false,
      has_adult_themes: track.has_adult_themes || false,
    });
  };

  const handleCancelEdit = () => {
    setEditingTrack(null);
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
      track_number: null,
      file: null,
      artwork: null,
      isSingle: false,
      allowMultipleHeadliners: false,
      hasFeaturing: false,
      hasContributing: false,
      headliners: [''],
      featuring: [''],
      contributing: [{ role: 'producer', name: '', customRole: '' }],
      primarySplit: '',
      headlinerSplits: [],
      featuringSplits: [],
      contributingSplits: [],
      splitAgreementSigned: false,
      has_explicit_language: false,
      has_adult_themes: false
    });
  };

  // Bulk upload handlers
  const handleBulkFilesSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setBulkFiles(files);
    setLoading(true);

    // Process each file to extract metadata
    const processedQueue = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const metadata = await getComprehensiveMetadata(file);
        const { createFormDataFromMetadata } = await import('./utils/metadataDetector');
        const formData = createFormDataFromMetadata(metadata);

        processedQueue.push({
          id: `${Date.now()}-${i}`,
          file: file,
          title: formData.title || file.name.replace(/\.[^/.]+$/, ''),
          track_number: formData.track_number || (i + 1),
          duration_seconds: formData.duration_seconds,
          bpm: formData.bpm,
          featuring: [''],
          has_explicit_language: false,
          has_adult_themes: false,
          metadata: formData.technical
        });
      } catch (error) {
        console.error(`Failed to process ${file.name}:`, error);
        processedQueue.push({
          id: `${Date.now()}-${i}`,
          file: file,
          title: file.name.replace(/\.[^/.]+$/, ''),
          track_number: i + 1,
          duration_seconds: '180',
          bpm: null,
          featuring: [''],
          has_explicit_language: false,
          has_adult_themes: false,
          metadata: null,
          error: error.message
        });
      }
    }

    setBulkQueue(processedQueue);
    setLoading(false);
  };

  const handleBulkSharedMetadataChange = (e) => {
    const { name, value, files } = e.target;
    setBulkSharedMetadata(prev => ({
      ...prev,
      [name]: files ? files[0] : value
    }));
  };

  const handleBulkQueueItemChange = (id, field, value) => {
    setBulkQueue(prev => prev.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const handleRemoveFromQueue = (id) => {
    setBulkQueue(prev => prev.filter(item => item.id !== id));
  };

  const handleBulkUpload = async () => {
    if (bulkQueue.length === 0) {
      alert('No tracks in queue');
      return;
    }

    // Validate shared metadata
    if (!bulkSharedMetadata.album) {
      alert('Please enter an album name');
      return;
    }
    if (!bulkSharedMetadata.artist) {
      alert('Please enter an artist name');
      return;
    }

    setBulkUploading(true);
    setBulkProgress({ current: 0, total: bulkQueue.length });

    const results = { success: [], failed: [] };

    for (let i = 0; i < bulkQueue.length; i++) {
      const track = bulkQueue[i];
      setBulkProgress({ current: i + 1, total: bulkQueue.length });

      try {
        // Upload to R2 via Cloudflare Worker
        // Only upload artwork on first track to avoid duplicates
        const { audioUrl, artworkUrl } = await uploadToR2({
          audioFile: track.file,
          artworkFile: (i === 0 && bulkSharedMetadata.artwork) ? bulkSharedMetadata.artwork : null,
          artistName: bulkSharedMetadata.artist,
          releaseTitle: bulkSharedMetadata.album,
          trackTitle: track.title,
          trackNumber: track.track_number
        });

        const audioFileUrl = audioUrl;
        const artworkFileUrl = artworkUrl;

        // Prepare artist credits
        const artistCredits = {
          headliners: [],
          featuring: track.featuring.filter(f => f.trim()).map(name => ({ name: name.trim() })),
          contributing: []
        };

        // Insert track
        const { data, error } = await supabase
          .from('mvp_content')
          .insert({
            title: track.title,
            artist: bulkSharedMetadata.artist,
            album: bulkSharedMetadata.album,
            year: bulkSharedMetadata.year || null,
            genre: bulkSharedMetadata.genre || 'Unknown',
            file_path: audioFileUrl,
            artwork_path: artworkFileUrl,
            duration_seconds: parseInt(track.duration_seconds) || 180,
            bpm: track.bpm,
            track_number: track.track_number,
            artist_credits: artistCredits,
            has_explicit_language: track.has_explicit_language,
            has_adult_themes: track.has_adult_themes,
            created_at: new Date().toISOString()
          });

        if (error) throw error;

        results.success.push(track.title);
      } catch (error) {
        console.error(`Failed to upload ${track.title}:`, error);
        results.failed.push({ title: track.title, error: error.message });
      }
    }

    setBulkUploading(false);
    setBulkProgress({ current: 0, total: 0 });

    // Show results
    const message = `
Bulk Upload Complete!
✓ Success: ${results.success.length} tracks
${results.failed.length > 0 ? `✗ Failed: ${results.failed.length} tracks` : ''}
    `.trim();

    alert(message);

    if (results.success.length > 0) {
      // Reset bulk upload
      setBulkQueue([]);
      setBulkFiles([]);
      setBulkSharedMetadata({
        album: '',
        artist: '',
        year: '',
        genre: '',
        artwork: null
      });
      loadTracks();
    }
  };

  // Show My Credits page for contributors
  console.log('Account Type:', accountType, 'Artist Name:', artistName);
  if (accountType === 'contributor') {
    console.log('Showing My Credits Page');
    return <MyCreditsPage artistName={artistName} />;
  }
  console.log('Showing My Tracks Page');

  return (
    <div className="tracks-page">
      <div className="page-header">
        <h1>{isAdmin ? 'All Tracks' : 'My Tracks'}</h1>
        <p className="page-subtitle">Upload and manage your music</p>
      </div>

      <div className="container">
        {canUpload && (
          <div className="upload-section card">
            {/* Tab Navigation */}
            {!editingTrack && (
              <div style={{
                display: 'flex',
                gap: '0.5rem',
                marginBottom: '1.5rem',
                borderBottom: '2px solid var(--border-color, #e0e0e0)'
              }}>
                <button
                  type="button"
                  onClick={() => setUploadMode('single')}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'none',
                    border: 'none',
                    borderBottom: uploadMode === 'single' ? '3px solid var(--brand-primary)' : '3px solid transparent',
                    color: uploadMode === 'single' ? 'var(--brand-primary)' : 'var(--text-secondary)',
                    fontWeight: uploadMode === 'single' ? '600' : '400',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    transition: 'all 0.2s'
                  }}
                >
                  Single Upload
                </button>
                <button
                  type="button"
                  onClick={() => setUploadMode('bulk')}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'none',
                    border: 'none',
                    borderBottom: uploadMode === 'bulk' ? '3px solid var(--brand-primary)' : '3px solid transparent',
                    color: uploadMode === 'bulk' ? 'var(--brand-primary)' : 'var(--text-secondary)',
                    fontWeight: uploadMode === 'bulk' ? '600' : '400',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    transition: 'all 0.2s'
                  }}
                >
                  Bulk Upload
                </button>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ color: 'var(--brand-primary)', margin: 0 }}>
                {editingTrack ? 'Edit Track' : uploadMode === 'single' ? 'Upload New Track' : 'Bulk Upload Tracks'}
              </h2>
              {editingTrack && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="btn-cancel"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            {/* Single Upload Form */}
            {(uploadMode === 'single' || editingTrack) && (
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
                      <label style={{ fontSize: '0.875rem', cursor: editingTrack && uploadForm.has_explicit_language ? 'not-allowed' : 'pointer', opacity: editingTrack && uploadForm.has_explicit_language ? 0.5 : 1 }}>
                        <input
                          type="checkbox"
                          name="has_explicit_language"
                          checked={uploadForm.has_explicit_language}
                          onChange={handleInputChange}
                          disabled={editingTrack && uploadForm.has_explicit_language}
                        />
                        Explicit Language
                      </label>
                      <label style={{ fontSize: '0.875rem', cursor: editingTrack && uploadForm.has_adult_themes ? 'not-allowed' : 'pointer', opacity: editingTrack && uploadForm.has_adult_themes ? 0.5 : 1 }}>
                        <input
                          type="checkbox"
                          name="has_adult_themes"
                          checked={uploadForm.has_adult_themes}
                          onChange={handleInputChange}
                          disabled={editingTrack && uploadForm.has_adult_themes}
                        />
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
                      required={!editingTrack}
                      disabled={editingTrack}
                      style={editingTrack ? { cursor: 'not-allowed', opacity: 0.5, background: 'var(--bg-tertiary)' } : {}}
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

                      {/* Dynamic input fields with role selection - stacked layout */}
                      {uploadForm.contributing.map((contributor, index) => (
                        <div key={index} style={{
                          marginBottom: '1rem',
                          padding: '1rem',
                          border: '1px solid var(--border-color, #e0e0e0)',
                          borderRadius: '8px',
                          background: 'var(--bg-secondary, #f9f9f9)',
                          position: 'relative'
                        }}>
                          {/* Remove button in top right */}
                          {uploadForm.contributing.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeArtistField('contributing', index)}
                              style={{
                                position: 'absolute',
                                top: '0.5rem',
                                right: '0.5rem',
                                background: 'var(--danger, #dc3545)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '0.25rem 0.5rem',
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                                fontWeight: '600'
                              }}
                              title="Remove this contributor"
                            >
                              Remove
                            </button>
                          )}

                          {/* 1A. Role dropdown - full width */}
                          <div style={{ marginBottom: '0.75rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                              Role
                            </label>
                            <select
                              value={contributor.role}
                              onChange={(e) => updateContributorField(index, 'role', e.target.value)}
                              style={{ width: '100%' }}
                            >
                              <option value="producer">Producer</option>
                              <option value="songwriter">Songwriter</option>
                              <option value="composer">Composer</option>
                              <option value="engineer">Engineer</option>
                              <option value="mixer">Mixer</option>
                              <option value="mastering">Mastering</option>
                              <option value="editor">Editor</option>
                              <option value="arranger">Arranger</option>
                              <option value="lyricist">Lyricist</option>
                              <option value="performer">Performer</option>
                              <option value="other">Other</option>
                            </select>
                          </div>

                          {/* 1B. Custom role input - conditional on "Other" selected */}
                          {contributor.role === 'other' && (
                            <div style={{ marginBottom: '0.75rem' }}>
                              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                                Custom Role
                              </label>
                              <input
                                type="text"
                                value={contributor.customRole || ''}
                                onChange={(e) => updateContributorField(index, 'customRole', e.target.value)}
                                placeholder="e.g., Vocal Coach, Session Musician"
                                style={{ width: '100%' }}
                              />
                            </div>
                          )}

                          {/* 1C. Contributor name - full width */}
                          <div>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                              Name
                            </label>
                            <input
                              type="text"
                              value={contributor.name}
                              onChange={(e) => updateContributorField(index, 'name', e.target.value)}
                              placeholder="Contributor name"
                              style={{ width: '100%' }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Revenue Split Section - Only show if there are additional artists */}
                {(uploadForm.allowMultipleHeadliners || uploadForm.hasFeaturing || uploadForm.hasContributing) && (
                  <div style={{
                    marginBottom: '1.5rem',
                    padding: '1.5rem',
                    border: (editingTrack && !isAdmin) ? '2px solid var(--text-secondary, #999)' : '2px solid var(--brand-primary, #A14189)',
                    borderRadius: '8px',
                    background: 'var(--bg-secondary, #f9f9f9)',
                    opacity: (editingTrack && !isAdmin) ? 0.6 : 1,
                    position: 'relative'
                  }}>
                    {editingTrack && !isAdmin && (
                      <div style={{
                        position: 'absolute',
                        top: '0.5rem',
                        right: '0.5rem',
                        background: 'var(--warning, #ffc107)',
                        color: 'var(--text-primary)',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: '600'
                      }}>
                        SPLITS LOCKED
                      </div>
                    )}
                    {editingTrack && isAdmin && (
                      <div style={{
                        position: 'absolute',
                        top: '0.5rem',
                        right: '0.5rem',
                        background: 'var(--brand-primary, #A14189)',
                        color: 'white',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: '600'
                      }}>
                        ADMIN OVERRIDE
                      </div>
                    )}
                    <h3 style={{
                      margin: '0 0 1rem 0',
                      color: (editingTrack && !isAdmin) ? 'var(--text-secondary)' : 'var(--brand-primary)',
                      fontSize: '1.1rem'
                    }}>
                      Revenue Split (%)
                    </h3>
                    <p style={{
                      fontSize: '0.875rem',
                      color: 'var(--text-secondary)',
                      marginBottom: '1rem'
                    }}>
                      {editingTrack && !isAdmin
                        ? 'Revenue splits cannot be changed after upload. Contact support if changes are needed.'
                        : editingTrack && isAdmin
                          ? 'Admin override enabled. You can modify splits as needed.'
                          : 'Divide the 70% artist share among all contributors. Total should equal 100%.'
                      }
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {/* Primary Artist */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        padding: '0.75rem',
                        background: 'var(--bg-primary, #fff)',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color, #e0e0e0)'
                      }}>
                        <div style={{ flex: 1 }}>
                          <strong>{uploadForm.artist || 'Primary Artist'}</strong>
                          <span style={{
                            marginLeft: '0.5rem',
                            fontSize: '0.75rem',
                            color: 'var(--text-secondary)',
                            textTransform: 'uppercase',
                            fontWeight: '600'
                          }}>
                            PRIMARY
                          </span>
                        </div>
                        <input
                          type="number"
                          value={uploadForm.primarySplit || ''}
                          onChange={(e) => setUploadForm(prev => ({ ...prev, primarySplit: e.target.value }))}
                          placeholder="e.g., 50"
                          min="0"
                          max="100"
                          step="0.1"
                          disabled={editingTrack && !isAdmin}
                          style={{
                            width: '100px',
                            padding: '0.5rem',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            cursor: (editingTrack && !isAdmin) ? 'not-allowed' : 'default',
                            opacity: (editingTrack && !isAdmin) ? 0.5 : 1
                          }}
                        />
                        <span style={{ minWidth: '20px' }}>%</span>
                      </div>

                      {/* Headliners */}
                      {uploadForm.allowMultipleHeadliners && uploadForm.headliners.map((artist, index) => (
                        artist.trim() && (
                          <div key={`headliner-${index}`} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '1rem',
                            padding: '0.75rem',
                            background: 'var(--bg-primary, #fff)',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color, #e0e0e0)'
                          }}>
                            <div style={{ flex: 1 }}>
                              <strong>{artist}</strong>
                              <span style={{
                                marginLeft: '0.5rem',
                                fontSize: '0.75rem',
                                color: 'var(--text-secondary)',
                                textTransform: 'uppercase',
                                fontWeight: '600'
                              }}>
                                HEADLINER
                              </span>
                            </div>
                            <input
                              type="number"
                              value={uploadForm.headlinerSplits?.[index] || ''}
                              onChange={(e) => {
                                const newSplits = [...(uploadForm.headlinerSplits || [])];
                                newSplits[index] = e.target.value;
                                setUploadForm(prev => ({ ...prev, headlinerSplits: newSplits }));
                              }}
                              placeholder="e.g., 25"
                              min="0"
                              max="100"
                              step="0.1"
                              disabled={editingTrack && !isAdmin}
                              style={{
                                width: '100px',
                                padding: '0.5rem',
                                border: '1px solid var(--border-color)',
                                borderRadius: '4px',
                                cursor: (editingTrack && !isAdmin) ? 'not-allowed' : 'default',
                                opacity: (editingTrack && !isAdmin) ? 0.5 : 1
                              }}
                            />
                            <span style={{ minWidth: '20px' }}>%</span>
                          </div>
                        )
                      ))}

                      {/* Featuring Artists */}
                      {uploadForm.hasFeaturing && uploadForm.featuring.map((artist, index) => (
                        artist.trim() && (
                          <div key={`featuring-${index}`} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '1rem',
                            padding: '0.75rem',
                            background: 'var(--bg-primary, #fff)',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color, #e0e0e0)'
                          }}>
                            <div style={{ flex: 1 }}>
                              <strong>{artist}</strong>
                              <span style={{
                                marginLeft: '0.5rem',
                                fontSize: '0.75rem',
                                color: 'var(--text-secondary)',
                                textTransform: 'uppercase',
                                fontWeight: '600'
                              }}>
                                FEATURING
                              </span>
                            </div>
                            <input
                              type="number"
                              value={uploadForm.featuringSplits?.[index] || ''}
                              onChange={(e) => {
                                const newSplits = [...(uploadForm.featuringSplits || [])];
                                newSplits[index] = e.target.value;
                                setUploadForm(prev => ({ ...prev, featuringSplits: newSplits }));
                              }}
                              placeholder="e.g., 15"
                              min="0"
                              max="100"
                              step="0.1"
                              disabled={editingTrack && !isAdmin}
                              style={{
                                width: '100px',
                                padding: '0.5rem',
                                border: '1px solid var(--border-color)',
                                borderRadius: '4px',
                                cursor: (editingTrack && !isAdmin) ? 'not-allowed' : 'default',
                                opacity: (editingTrack && !isAdmin) ? 0.5 : 1
                              }}
                            />
                            <span style={{ minWidth: '20px' }}>%</span>
                          </div>
                        )
                      ))}

                      {/* Contributing Artists */}
                      {uploadForm.hasContributing && uploadForm.contributing.map((contributor, index) => (
                        contributor.name.trim() && (
                          <div key={`contributing-${index}`} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '1rem',
                            padding: '0.75rem',
                            background: 'var(--bg-primary, #fff)',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color, #e0e0e0)'
                          }}>
                            <div style={{ flex: 1 }}>
                              <strong>{contributor.name}</strong>
                              <span style={{
                                marginLeft: '0.5rem',
                                fontSize: '0.75rem',
                                color: 'var(--text-secondary)',
                                textTransform: 'uppercase',
                                fontWeight: '600'
                              }}>
                                {contributor.role === 'other' ? contributor.customRole : contributor.role}
                              </span>
                            </div>
                            <input
                              type="number"
                              value={uploadForm.contributingSplits?.[index] || ''}
                              onChange={(e) => {
                                const newSplits = [...(uploadForm.contributingSplits || [])];
                                newSplits[index] = e.target.value;
                                setUploadForm(prev => ({ ...prev, contributingSplits: newSplits }));
                              }}
                              placeholder="e.g., 10"
                              min="0"
                              max="100"
                              step="0.1"
                              disabled={editingTrack && !isAdmin}
                              style={{
                                width: '100px',
                                padding: '0.5rem',
                                border: '1px solid var(--border-color)',
                                borderRadius: '4px',
                                cursor: (editingTrack && !isAdmin) ? 'not-allowed' : 'default',
                                opacity: (editingTrack && !isAdmin) ? 0.5 : 1
                              }}
                            />
                            <span style={{ minWidth: '20px' }}>%</span>
                          </div>
                        )
                      ))}
                    </div>

                    {/* Total Calculator */}
                    <div style={{
                      marginTop: '1rem',
                      padding: '0.75rem',
                      background: 'var(--bg-primary, #fff)',
                      borderRadius: '6px',
                      border: '2px solid var(--brand-primary)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontWeight: '600'
                    }}>
                      <span>Total:</span>
                      <span style={{
                        fontSize: '1.2rem',
                        color: (() => {
                          const total =
                            parseFloat(uploadForm.primarySplit || 0) +
                            (uploadForm.headlinerSplits || []).reduce((sum, s) => sum + parseFloat(s || 0), 0) +
                            (uploadForm.featuringSplits || []).reduce((sum, s) => sum + parseFloat(s || 0), 0) +
                            (uploadForm.contributingSplits || []).reduce((sum, s) => sum + parseFloat(s || 0), 0);
                          return total === 100 ? 'var(--success, #28a745)' : 'var(--danger, #dc3545)';
                        })()
                      }}>
                        {(
                          parseFloat(uploadForm.primarySplit || 0) +
                          (uploadForm.headlinerSplits || []).reduce((sum, s) => sum + parseFloat(s || 0), 0) +
                          (uploadForm.featuringSplits || []).reduce((sum, s) => sum + parseFloat(s || 0), 0) +
                          (uploadForm.contributingSplits || []).reduce((sum, s) => sum + parseFloat(s || 0), 0)
                        ).toFixed(1)}%
                      </span>
                    </div>

                    {/* Split Agreement Checkbox - Only show when uploading (not editing) */}
                    {!editingTrack && (
                      <div style={{
                        marginTop: '1rem',
                        padding: '1rem',
                        background: 'var(--warning-bg, #fff3cd)',
                        border: '2px solid var(--warning, #ffc107)',
                        borderRadius: '6px'
                      }}>
                        <label style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '0.75rem',
                          cursor: 'pointer',
                          fontSize: '0.875rem'
                        }}>
                          <input
                            type="checkbox"
                            name="splitAgreementSigned"
                            checked={uploadForm.splitAgreementSigned || false}
                            onChange={handleInputChange}
                            required
                            style={{
                              marginTop: '0.25rem',
                              width: '18px',
                              height: '18px',
                              cursor: 'pointer'
                            }}
                          />
                          <span>
                            <strong>I confirm that all parties listed above have signed a revenue split agreement</strong> and understand that splits cannot be changed after upload without written consent from all contributors.
                          </span>
                        </label>
                      </div>
                    )}
                  </div>
                )}

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
                  <label htmlFor="track_number">
                    Track Number
                    {uploadForm.track_number && !uploadForm.isSingle && (
                      <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--success, #28a745)' }}>
                        ✓ Auto-detected
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    id="track_number"
                    name="track_number"
                    value={uploadForm.track_number || ''}
                    onChange={handleInputChange}
                    placeholder={uploadForm.isSingle ? "1" : "e.g., 1, 2, 3..."}
                    min="1"
                    disabled={uploadForm.isSingle || editingTrack}
                    title={uploadForm.isSingle ? 'Singles are always track #1' : (editingTrack ? 'Track number cannot be changed when editing' : '')}
                    style={{
                      cursor: uploadForm.isSingle || editingTrack ? 'not-allowed' : '',
                      opacity: uploadForm.isSingle || editingTrack ? 0.6 : 1,
                      borderColor: uploadForm.track_number && !uploadForm.isSingle ? 'var(--success, #28a745)' : ''
                    }}
                  />
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
                    disabled={editingTrack}
                    style={editingTrack ? { cursor: 'not-allowed', opacity: 0.6 } : {}}
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
                    disabled={editingTrack || (detectedDuration > 0 && !detectionError)}
                    title={editingTrack ? 'Duration cannot be changed when editing' : (detectedDuration > 0 && !detectionError ? 'Duration automatically detected from audio file' : '')}
                    style={{
                      borderColor: detectedDuration > 0 && !detectionError ? 'var(--success, #28a745)' : '',
                      color: detectedDuration > 0 && !detectionError ? 'var(--success, #28a745)' : '',
                      cursor: editingTrack ? 'not-allowed' : '',
                      opacity: editingTrack ? 0.6 : 1
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
                    disabled={editingTrack}
                    style={editingTrack ? { cursor: 'not-allowed', opacity: 0.5, background: 'var(--bg-tertiary)' } : {}}
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
                  {loading ? (editingTrack ? 'Saving...' : 'Uploading...') : (editingTrack ? 'Save Changes' : 'Upload Track')}
                </button>
              </form>
            )}

            {/* Bulk Upload UI */}
            {uploadMode === 'bulk' && !editingTrack && (
              <div className="bulk-upload-container">
                {/* Step 1: File Selection */}
                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Step 1: Select Audio Files</h3>
                  <div style={{
                    border: '2px dashed var(--border-color, #e0e0e0)',
                    borderRadius: '8px',
                    padding: '2rem',
                    textAlign: 'center',
                    background: 'var(--bg-secondary, #f9f9f9)'
                  }}>
                    <input
                      type="file"
                      multiple
                      accept="audio/*"
                      onChange={handleBulkFilesSelect}
                      style={{ display: 'none' }}
                      id="bulk-file-input"
                    />
                    <label htmlFor="bulk-file-input" style={{ cursor: 'pointer' }}>
                      <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}></div>
                      <p style={{ margin: '0.5rem 0', color: 'var(--text-primary)' }}>
                        Drag & drop multiple audio files here
                      </p>
                      <p style={{ margin: '0.5rem 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                        or click to browse
                      </p>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ marginTop: '1rem' }}
                        onClick={(e) => {
                          e.preventDefault();
                          document.getElementById('bulk-file-input').click();
                        }}
                      >
                        Browse Files
                      </button>
                    </label>
                    {bulkFiles.length > 0 && (
                      <p style={{ marginTop: '1rem', color: 'var(--success, #28a745)', fontWeight: '600' }}>
                        ✓ {bulkFiles.length} file{bulkFiles.length > 1 ? 's' : ''} selected
                      </p>
                    )}
                  </div>
                </div>

                {/* Step 2: Shared Metadata */}
                {bulkQueue.length > 0 && (
                  <>
                    <div style={{ marginBottom: '2rem' }}>
                      <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>
                        Step 2: Album Metadata (applies to all tracks)
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group">
                          <label>Album Name *</label>
                          <input
                            type="text"
                            name="album"
                            value={bulkSharedMetadata.album}
                            onChange={handleBulkSharedMetadataChange}
                            placeholder="Enter album name"
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label>Primary Artist *</label>
                          <input
                            type="text"
                            name="artist"
                            value={bulkSharedMetadata.artist}
                            onChange={handleBulkSharedMetadataChange}
                            placeholder="Enter artist name"
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label>Year</label>
                          <input
                            type="number"
                            name="year"
                            value={bulkSharedMetadata.year}
                            onChange={handleBulkSharedMetadataChange}
                            placeholder="2024"
                            min="1900"
                            max={new Date().getFullYear() + 1}
                          />
                        </div>
                        <div className="form-group">
                          <label>Genre</label>
                          <select
                            name="genre"
                            value={bulkSharedMetadata.genre}
                            onChange={handleBulkSharedMetadataChange}
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
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                          <label>Album Artwork</label>
                          <input
                            type="file"
                            name="artwork"
                            onChange={handleBulkSharedMetadataChange}
                            accept="image/*"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Step 3: Track Queue */}
                    <div style={{ marginBottom: '2rem' }}>
                      <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>
                        Step 3: Review & Edit Tracks ({bulkQueue.length})
                      </h3>
                      <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                        {bulkQueue.map((track, index) => (
                          <div
                            key={track.id}
                            style={{
                              border: '1px solid var(--border-color, #e0e0e0)',
                              borderRadius: '8px',
                              padding: '1rem',
                              marginBottom: '0.75rem',
                              background: 'var(--bg-primary, #fff)'
                            }}
                          >
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'start' }}>
                              <div style={{
                                minWidth: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                background: 'var(--brand-primary)',
                                color: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: '600'
                              }}>
                                {track.track_number}
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                  <div>
                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Track Title *</label>
                                    <input
                                      type="text"
                                      value={track.title}
                                      onChange={(e) => handleBulkQueueItemChange(track.id, 'title', e.target.value)}
                                      style={{
                                        width: '100%',
                                        padding: '0.5rem',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '4px'
                                      }}
                                    />
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Track #</label>
                                    <input
                                      type="number"
                                      value={track.track_number}
                                      onChange={(e) => handleBulkQueueItemChange(track.id, 'track_number', parseInt(e.target.value))}
                                      min="1"
                                      style={{
                                        width: '100%',
                                        padding: '0.5rem',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '4px'
                                      }}
                                    />
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                  <span>✓ {formatDuration(track.duration_seconds * 1000)}</span>
                                  {track.bpm && <span>✓ {track.bpm} BPM</span>}
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                                    <input
                                      type="checkbox"
                                      checked={track.has_explicit_language}
                                      onChange={(e) => handleBulkQueueItemChange(track.id, 'has_explicit_language', e.target.checked)}
                                    />
                                    Explicit
                                  </label>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                                    <input
                                      type="checkbox"
                                      checked={track.has_adult_themes}
                                      onChange={(e) => handleBulkQueueItemChange(track.id, 'has_adult_themes', e.target.checked)}
                                    />
                                    Adult
                                  </label>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveFromQueue(track.id)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--danger, #dc3545)',
                                  cursor: 'pointer',
                                  fontSize: '1.25rem',
                                  padding: '0.25rem'
                                }}
                                title="Remove from queue"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Upload Button */}
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setBulkQueue([]);
                          setBulkFiles([]);
                        }}
                        className="btn btn-secondary"
                        disabled={bulkUploading}
                      >
                        Clear All
                      </button>
                      <button
                        type="button"
                        onClick={handleBulkUpload}
                        className="btn btn-primary"
                        disabled={bulkUploading || bulkQueue.length === 0}
                        style={{ minWidth: '200px' }}
                      >
                        {bulkUploading
                          ? `Uploading ${bulkProgress.current} of ${bulkProgress.total}...`
                          : `Upload All Tracks (${bulkQueue.length})`
                        }
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

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
                  <ContributorList contributors={track.contributors} />

                  {/* Admin: Show all splits */}
                  {isAdmin && track.contributors && track.contributors.length > 0 && (
                    <div style={{
                      marginTop: '0.5rem',
                      padding: '0.75rem',
                      background: 'var(--bg-secondary, #f9f9f9)',
                      borderRadius: '6px',
                      fontSize: '0.875rem'
                    }}>
                      <strong>Revenue Splits:</strong>
                      <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        {track.contributors.map((contrib, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ textTransform: 'capitalize' }}>
                              {contrib.artists.name} ({contrib.role})
                            </span>
                            <span style={{
                              fontWeight: '600',
                              color: contrib.split_percentage ? 'var(--success, #28a745)' : 'var(--text-secondary)'
                            }}>
                              {contrib.split_percentage ? `${contrib.split_percentage}%` : 'Not set'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-secondary">
                    <strong>Genre:</strong> {track.genre || 'Unknown'} | <strong>Duration:</strong> {Math.floor(track.duration / 1000)}s | <strong>Uploaded:</strong> {new Date(track.created_at).toLocaleDateString()}
                  </p>

                  {track.analytics && (
                    <div className="track-analytics" style={{
                      color: 'var(--text-secondary, #666)',
                      fontSize: '0.875rem',
                      marginTop: '0.5rem',
                      marginBottom: '0.75rem'
                    }}>
                      <p style={{ margin: '0 0 0.25rem 0' }}>
                        {track.analytics.totalPlays.toLocaleString()} plays • {track.analytics.qualifiedStreams.toLocaleString()} streams ({track.analytics.completionRate}%)
                        {!isAdmin && track.mySplit && (
                          <span style={{
                            marginLeft: '0.5rem',
                            color: 'var(--success, #28a745)',
                            fontWeight: '600'
                          }}>
                            • Your Split: {track.mySplit}% • Earnings: K{((track.analytics.qualifiedStreams * 0.001 * 0.70 * track.mySplit) / 100).toFixed(2)}
                          </span>
                        )}
                      </p>
                      {track.analytics.hotspotCity && (
                        <p
                          style={{
                            margin: 0,
                            fontWeight: '500',
                            color: 'var(--brand-primary, #A14189)',
                            cursor: track.analytics.topCities.length > 1 ? 'pointer' : 'default'
                          }}
                          title={track.analytics.topCities.length > 1
                            ? track.analytics.topCities.map(c => `${c.city}: ${c.streams} streams`).join('\n')
                            : ''
                          }
                        >
                          Blowing up in: {track.analytics.hotspotCity} ({track.analytics.hotspotStreams.toLocaleString()} streams)
                          {track.analytics.topCities.length > 1 && (
                            <span style={{
                              marginLeft: '0.25rem',
                              fontSize: '0.75rem',
                              opacity: 0.7
                            }}>
                              +{track.analytics.topCities.length - 1} more
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Only show edit/delete for primary artists or admins */}
                  {(isAdmin || track.isPrimaryArtist) && (
                    <div className="track-actions">
                      <button
                        onClick={() => handleEditTrack(track)}
                        className="btn-edit"
                        title="Edit track"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteTrack(track.id)}
                        className={deleteConfirm === track.id ? 'btn-delete confirm' : 'btn-delete'}
                        title={deleteConfirm === track.id ? 'Click again to confirm' : 'Delete track'}
                      >
                        {deleteConfirm === track.id ? 'Confirm Delete?' : 'Delete'}
                      </button>
                      {deleteConfirm === track.id && (
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="btn-cancel"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  )}

                  {/* Show role badge for non-primary contributors */}
                  {!isAdmin && !track.isPrimaryArtist && track.myRole && (
                    <div style={{
                      marginTop: '0.5rem',
                      padding: '0.5rem',
                      background: 'var(--bg-secondary, #f9f9f9)',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      color: 'var(--text-secondary)'
                    }}>
                      <strong>Your role:</strong> <span style={{ textTransform: 'capitalize' }}>{track.myRole}</span>
                      <br />
                      <em>Only the primary artist can edit or delete this track.</em>
                    </div>
                  )}
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
