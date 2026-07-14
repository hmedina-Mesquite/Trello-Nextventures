-- T034: uploaded-photo backgrounds. background_color (already on boards) still
-- applies when no image is set, and remains as the fallback/dashboard-tile color.
alter table public.boards add column background_image_path text;
