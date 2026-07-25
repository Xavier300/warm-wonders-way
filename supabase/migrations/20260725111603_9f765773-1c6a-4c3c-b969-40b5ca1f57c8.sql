
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  req_role text := lower(COALESCE(meta->>'role', 'resident'));
  final_role public.app_role;
BEGIN
  IF req_role IN ('admin','staff','collector','resident') THEN
    final_role := req_role::public.app_role;
  ELSIF req_role = 'official' THEN
    final_role := 'staff'::public.app_role;
  ELSE
    final_role := 'resident'::public.app_role;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone, zone, position)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(meta->>'full_name', NEW.email),
    meta->>'phone',
    meta->>'zone',
    meta->>'position'
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, final_role);
  RETURN NEW;
END; $$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Realtime for cross-tab/admin/resident live sync
ALTER PUBLICATION supabase_realtime ADD TABLE public.reports;
ALTER PUBLICATION supabase_realtime ADD TABLE public.compliance_forms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;
