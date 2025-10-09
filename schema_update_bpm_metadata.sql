-- Add BPM and additional metadata columns to mvp_content table

-- Add BPM column (primary new feature)
ALTER TABLE mvp_content 
ADD COLUMN IF NOT EXISTS bpm INTEGER;

-- Add album information
ALTER TABLE mvp_content 
ADD COLUMN IF NOT EXISTS album VARCHAR(255);

-- Add release year
ALTER TABLE mvp_content 
ADD COLUMN IF NOT EXISTS year INTEGER;

-- Add track number (for album ordering)
ALTER TABLE mvp_content 
ADD COLUMN IF NOT EXISTS track_number INTEGER;

-- Add composer/songwriter credits
ALTER TABLE mvp_content 
ADD COLUMN IF NOT EXISTS composer VARCHAR(255);

-- Add technical metadata for quality/filtering
ALTER TABLE mvp_content 
ADD COLUMN IF NOT EXISTS bitrate INTEGER;

ALTER TABLE mvp_content 
ADD COLUMN IF NOT EXISTS codec VARCHAR(50);

ALTER TABLE mvp_content 
ADD COLUMN IF NOT EXISTS is_lossless BOOLEAN DEFAULT false;

-- Add comments/notes
ALTER TABLE mvp_content 
ADD COLUMN IF NOT EXISTS comments TEXT;

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_mvp_content_bpm ON mvp_content(bpm);
CREATE INDEX IF NOT EXISTS idx_mvp_content_year ON mvp_content(year);
CREATE INDEX IF NOT EXISTS idx_mvp_content_album ON mvp_content(album);
CREATE INDEX IF NOT EXISTS idx_mvp_content_bitrate ON mvp_content(bitrate);

-- Add comments to document the columns
COMMENT ON COLUMN mvp_content.bpm IS 'Beats per minute - detected from metadata or audio analysis';
COMMENT ON COLUMN mvp_content.album IS 'Album name from metadata';
COMMENT ON COLUMN mvp_content.year IS 'Release year';
COMMENT ON COLUMN mvp_content.track_number IS 'Track number within album';
COMMENT ON COLUMN mvp_content.composer IS 'Composer/songwriter credits';
COMMENT ON COLUMN mvp_content.bitrate IS 'Audio bitrate in kbps';
COMMENT ON COLUMN mvp_content.codec IS 'Audio codec (mp3, aac, flac, etc.)';
COMMENT ON COLUMN mvp_content.is_lossless IS 'Whether audio is lossless quality';
COMMENT ON COLUMN mvp_content.comments IS 'Additional notes or comments from metadata';
