-- Chat độc lập với luồng chọn lớp. Chỉ API máy chủ (service_role) truy cập.
-- Có thể chạy lại; không thay đổi dữ liệu sĩ số/bán trú.
BEGIN;
CREATE TABLE IF NOT EXISTS public.staff_chat_accounts (
 id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 profile_id text NOT NULL UNIQUE,
 display_name text NOT NULL,
 role_label text NOT NULL,
 is_admin boolean NOT NULL DEFAULT false,
 enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.staff_chat_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sender_id uuid NOT NULL REFERENCES public.staff_chat_accounts(id),
 recipient_id uuid REFERENCES public.staff_chat_accounts(id), -- null: thông báo toàn trường
 body text NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 2000),
 client_nonce uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(sender_id,client_nonce),
 CHECK(recipient_id IS NULL OR recipient_id <> sender_id)
);
CREATE INDEX IF NOT EXISTS staff_chat_recipient_time ON public.staff_chat_messages(recipient_id,created_at DESC,id);
CREATE INDEX IF NOT EXISTS staff_chat_sender_time ON public.staff_chat_messages(sender_id,created_at DESC,id);
CREATE TABLE IF NOT EXISTS public.staff_chat_reads (
 account_id uuid NOT NULL REFERENCES public.staff_chat_accounts(id) ON DELETE CASCADE,
 thread_id text NOT NULL,
 read_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(account_id,thread_id)
);
CREATE TABLE IF NOT EXISTS public.staff_chat_rate_limits (
 key text NOT NULL, bucket bigint NOT NULL, count integer NOT NULL DEFAULT 1,
 PRIMARY KEY(key,bucket)
);
ALTER TABLE public.staff_chat_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_chat_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_chat_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_chat_accounts,public.staff_chat_messages,public.staff_chat_reads,public.staff_chat_rate_limits FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.staff_chat_accounts,public.staff_chat_messages,public.staff_chat_reads,public.staff_chat_rate_limits TO service_role;
CREATE OR REPLACE FUNCTION public.staff_chat_allow_request(p_key text,p_limit integer,p_window integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer; b bigint := floor(extract(epoch FROM now()) / p_window);
BEGIN
 DELETE FROM staff_chat_rate_limits WHERE bucket < floor(extract(epoch FROM now()-interval '1 day')/p_window);
 INSERT INTO staff_chat_rate_limits(key,bucket) VALUES(p_key,b) ON CONFLICT(key,bucket) DO UPDATE SET count=staff_chat_rate_limits.count+1 RETURNING count INTO n;
 RETURN n <= p_limit;
END $$;
CREATE OR REPLACE FUNCTION public.staff_chat_inbox(p_account uuid)
RETURNS TABLE(thread_id text,last_body text,last_at timestamptz,unread bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH visible AS (
  SELECT m.*,CASE WHEN recipient_id IS NULL THEN 'school' WHEN sender_id=p_account THEN recipient_id::text ELSE sender_id::text END AS thread
  FROM staff_chat_messages m WHERE sender_id=p_account OR recipient_id=p_account OR recipient_id IS NULL
 ), ranked AS (
  SELECT v.*,row_number() OVER(PARTITION BY thread ORDER BY created_at DESC,id DESC) rn FROM visible v
 ), counts AS (
  SELECT v.thread,count(*) FILTER(WHERE v.sender_id<>p_account AND v.created_at>coalesce(r.read_at,'-infinity'::timestamptz)) AS n
  FROM visible v LEFT JOIN staff_chat_reads r ON r.account_id=p_account AND r.thread_id=v.thread GROUP BY v.thread
 ) SELECT r.thread,r.body,r.created_at,c.n FROM ranked r JOIN counts c ON c.thread=r.thread WHERE rn=1;
$$;
CREATE OR REPLACE FUNCTION public.staff_chat_mark_read(p_account uuid,p_thread text,p_seen timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 INSERT INTO staff_chat_reads(account_id,thread_id,read_at) VALUES(p_account,p_thread,least(p_seen,clock_timestamp()))
 ON CONFLICT(account_id,thread_id) DO UPDATE SET read_at=greatest(staff_chat_reads.read_at,excluded.read_at);
$$;
REVOKE ALL ON FUNCTION public.staff_chat_allow_request(text,integer,integer),public.staff_chat_inbox(uuid),public.staff_chat_mark_read(uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staff_chat_allow_request(text,integer,integer),public.staff_chat_inbox(uuid),public.staff_chat_mark_read(uuid,text,timestamptz) TO service_role;
COMMIT;
