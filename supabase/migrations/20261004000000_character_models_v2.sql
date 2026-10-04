-- Phase 3: point the six shop characters at their optimized models.
--
-- model-v2.glb = WebP textures + meshopt compression (2.4–3.4 MB → 0.44–0.59 MB
-- each), built by `npm run models:optimize` and uploaded to the public
-- character-assets bucket by `node tools/upload-characters.mjs dev|live`
-- (which also applies this same change through the API).
--
-- Host-agnostic: only the file name at the end of the URL changes, so this
-- works on any project whose bucket already holds the v2 files. The previous
-- files (model.glb / model-v1.glb) stay in the bucket as a fallback.

UPDATE public.characters
   SET model_url = regexp_replace(model_url, '/model(-v\d+)?\.glb$', '/model-v2.glb')
 WHERE id IN ('rookie', 'techy', 'magno', 'ninja', 'cyborg', 'inferno')
   AND model_url ~ '/model(-v\d+)?\.glb$';
