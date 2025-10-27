export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      // Parse multipart form data
      const formData = await request.formData();
      const audioFile = formData.get('audioFile');
      const artworkFile = formData.get('artworkFile');
      const artistName = formData.get('artistName');
      const releaseTitle = formData.get('releaseTitle');
      const trackTitle = formData.get('trackTitle');
      const trackNumber = formData.get('trackNumber');

      // Validate required fields
      if (!audioFile || !artistName || !releaseTitle || !trackTitle) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields' }),
          { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      // Slugify function
      const slugify = (text) => {
        return text
          .toLowerCase()
          .trim()
          .replace(/[^\w\s-]/g, '')
          .replace(/[\s_]+/g, '-')
          .replace(/^-+|-+$/g, '');
      };

      // Generate file paths following the documented structure
      const artistSlug = slugify(artistName);
      const releaseSlug = slugify(releaseTitle);
      const trackSlug = slugify(trackTitle);
      
      const trackPrefix = trackNumber ? `${String(trackNumber).padStart(2, '0')}-` : '';
      const audioFileName = `${trackPrefix}${trackSlug}.mp3`;
      const audioFilePath = `audio/${artistSlug}/${releaseSlug}/${audioFileName}`;

      // Upload audio file to R2 (using binding - no credentials!)
      await env.PAIRAP_MEDIA.put(audioFilePath, audioFile.stream(), {
        httpMetadata: {
          contentType: audioFile.type,
        },
      });

      const audioUrl = `https://pub-5c6c7189837949919fd0094e380ce88d.r2.dev/${audioFilePath}`;

      // Upload artwork if provided
      let artworkUrl = null;
      if (artworkFile) {
        const artworkExtension = artworkFile.name.split('.').pop();
        const artworkFileName = `${artistSlug}-${releaseSlug}.${artworkExtension}`;
        const artworkFilePath = `artwork/${artworkFileName}`;

        await env.PAIRAP_MEDIA.put(artworkFilePath, artworkFile.stream(), {
          httpMetadata: {
            contentType: artworkFile.type,
          },
        });

        artworkUrl = `https://pub-5c6c7189837949919fd0094e380ce88d.r2.dev/${artworkFilePath}`;
      }

      // Return URLs
      return new Response(
        JSON.stringify({
          success: true,
          audioUrl,
          artworkUrl,
          audioPath: audioFilePath,
          artworkPath: artworkUrl ? `artwork/${artistSlug}-${releaseSlug}.${artworkFile.name.split('.').pop()}` : null,
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );

    } catch (error) {
      console.error('Upload error:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { 
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        }
      );
    }
  },
};
