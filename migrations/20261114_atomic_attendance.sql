-- Additive migration. Run once in Supabase SQL Editor before enabling this build.
-- SECURITY INVOKER: existing table permissions and RLS still apply.
BEGIN;
ALTER TABLE public.daily_reports ADD COLUMN IF NOT EXISTS last_save_token text;
ALTER TABLE public.daily_reports ADD COLUMN IF NOT EXISTS school_year_id text REFERENCES public.school_years(id);
CREATE OR REPLACE FUNCTION public.save_attendance_atomic(
  p_report jsonb, p_values jsonb, p_expected_updated_at timestamptz,
  p_request_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  r public.daily_reports%ROWTYPE;
  inserted_id text;
  class_year text;
  v jsonb;
  n_total numeric;
  n_present numeric;
  n_absent numeric;
  saved_values jsonb;
BEGIN
  IF p_report IS NULL OR jsonb_typeof(p_report) <> 'object' OR
     p_values IS NULL OR jsonb_typeof(p_values) <> 'array' OR jsonb_array_length(p_values) = 0 OR
     nullif(p_request_id, '') IS NULL THEN
    RAISE EXCEPTION 'INVALID_ATTENDANCE: Báo cáo hoặc mã lần gửi không hợp lệ.';
  END IF;
  IF jsonb_typeof(coalesce(p_report->'absent_students', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_ATTENDANCE: Danh sách vắng không hợp lệ.';
  END IF;
  SELECT c.school_year_id INTO class_year FROM public.classes c
    WHERE c.id = p_report->>'class_id' AND c.active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ATTENDANCE: Lớp không tồn tại hoặc đã ngừng hoạt động.'; END IF;
  IF EXISTS (SELECT 1 FROM public.school_years y WHERE y.id = class_year AND y.is_locked = true) THEN
    RAISE EXCEPTION 'REPORT_LOCKED: Năm học đã khóa.';
  END IF;
  IF (SELECT count(DISTINCT x->>'indicator_group_id') FROM jsonb_array_elements(p_values) x) <> jsonb_array_length(p_values) THEN
    RAISE EXCEPTION 'INVALID_ATTENDANCE: Chỉ tiêu trùng hoặc thiếu mã.';
  END IF;
  FOR v IN SELECT * FROM jsonb_array_elements(p_values) LOOP
    IF jsonb_typeof(v->'total_count') IS DISTINCT FROM 'number' OR
       jsonb_typeof(v->'present_count') IS DISTINCT FROM 'number' OR
       jsonb_typeof(v->'absent_count') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'INVALID_ATTENDANCE: Sĩ số phải là số.';
    END IF;
    n_total := (v->>'total_count')::numeric;
    n_present := (v->>'present_count')::numeric;
    n_absent := (v->>'absent_count')::numeric;
    IF n_total < 0 OR n_present < 0 OR n_absent < 0 OR
       n_total <> trunc(n_total) OR n_present <> trunc(n_present) OR n_absent <> trunc(n_absent) OR
       n_total > 100000 OR n_present + n_absent <> n_total THEN
      RAISE EXCEPTION 'INVALID_ATTENDANCE: Có mặt cộng vắng phải bằng tổng; số nguyên không âm.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.indicator_groups g WHERE g.id = v->>'indicator_group_id' AND g.enabled = true) THEN
      RAISE EXCEPTION 'INVALID_ATTENDANCE: Chỉ tiêu không tồn tại hoặc đã tắt.';
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_values) x JOIN public.indicator_groups g ON g.id = x->>'indicator_group_id'
    WHERE g.code = 'ALL' AND (x->>'total_count')::numeric > 0
  ) THEN RAISE EXCEPTION 'INVALID_ATTENDANCE: Thiếu chỉ tiêu tổng cả lớp hợp lệ.'; END IF;

  -- Unique(class_id, report_date) serializes concurrent creation. A failed call
  -- rolls back this placeholder as well as all following writes.
  INSERT INTO public.daily_reports(class_id, report_date, created_by, status)
    VALUES (p_report->>'class_id', (p_report->>'report_date')::date, p_report->>'created_by', 'DRAFT')
    ON CONFLICT (class_id, report_date) DO NOTHING RETURNING id INTO inserted_id;
  SELECT * INTO STRICT r FROM public.daily_reports
    WHERE class_id = p_report->>'class_id' AND report_date = (p_report->>'report_date')::date FOR UPDATE;
  IF r.last_save_token IS DISTINCT FROM p_request_id THEN
    IF r.status = 'LOCKED' THEN RAISE EXCEPTION 'REPORT_LOCKED: Báo cáo đã khóa.'; END IF;
    IF inserted_id IS NULL AND (p_expected_updated_at IS NULL OR r.updated_at IS DISTINCT FROM p_expected_updated_at) THEN
      RAISE EXCEPTION 'REPORT_CONFLICT: Báo cáo đã được cập nhật trên thiết bị khác. Tải bản mới trước khi lưu.';
    END IF;
    IF inserted_id IS NOT NULL AND p_expected_updated_at IS NOT NULL THEN
      RAISE EXCEPTION 'REPORT_CONFLICT: Báo cáo trước đã bị xóa. Tải lại trước khi gửi.';
    END IF;
    UPDATE public.daily_reports SET
      created_by = p_report->>'created_by', school_year_id = class_year, status = 'SUBMITTED',
      notes = coalesce(p_report->>'notes', ''), absent_students = coalesce(p_report->'absent_students', '[]'::jsonb),
      reported_time = coalesce(r.reported_time, to_char(clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI')),
      last_save_token = p_request_id,
      updated_at = greatest(clock_timestamp(), r.updated_at + interval '1 microsecond')
      WHERE id = r.id RETURNING * INTO r;
    DELETE FROM public.daily_report_values WHERE report_id = r.id
      AND indicator_group_id NOT IN (SELECT x->>'indicator_group_id' FROM jsonb_array_elements(p_values) x);
    INSERT INTO public.daily_report_values(report_id, indicator_group_id, total_count, present_count, absent_count)
      SELECT r.id, x->>'indicator_group_id', (x->>'total_count')::integer, (x->>'present_count')::integer, (x->>'absent_count')::integer
      FROM jsonb_array_elements(p_values) x
      ON CONFLICT (report_id, indicator_group_id) DO UPDATE SET
        total_count = EXCLUDED.total_count, present_count = EXCLUDED.present_count,
        absent_count = EXCLUDED.absent_count, updated_at = clock_timestamp();
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(vv)), '[]'::jsonb) INTO saved_values
    FROM public.daily_report_values vv WHERE vv.report_id = r.id;
  RETURN jsonb_build_object('report', to_jsonb(r), 'values', saved_values);
END;
$$;
REVOKE ALL ON FUNCTION public.save_attendance_atomic(jsonb,jsonb,timestamptz,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_attendance_atomic(jsonb,jsonb,timestamptz,text) TO anon, authenticated;
COMMIT;
