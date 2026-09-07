-- Allow banner titles to be optional (nullable)
ALTER TABLE banners
ALTER COLUMN title DROP NOT NULL;

-- Add a default comment explaining the change
COMMENT ON COLUMN banners.title IS 'Banner title - optional, can be null for image-only banners';
