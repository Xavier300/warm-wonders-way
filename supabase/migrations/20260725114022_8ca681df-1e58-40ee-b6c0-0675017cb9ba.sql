
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS photo_url text;

-- Residents: upload to a folder named after their user id
CREATE POLICY "residents_upload_own_photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'report-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Residents: read their own photos
CREATE POLICY "residents_read_own_photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'report-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Admins and staff: read all photos
CREATE POLICY "staff_read_all_photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'report-photos'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
);
