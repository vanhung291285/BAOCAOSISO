-- Create a table to store monthly sheets for each teacher/class
create table monthly_sheets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  month int not null,
  year int not null,
  class_name text,
  teacher_name text,
  school_name text,
  location text,
  students jsonb default '[]'::jsonb,
  standard_meals jsonb default '{"S": 14, "T1": 14, "T2": 12}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- Unique constraint: ensures each class has exactly one sheet per month/year for a given user.
  -- To upgrade an existing DB with the old unique(user_id, month, year) constraint, run this SQL:
  --   ALTER TABLE monthly_sheets DROP CONSTRAINT IF EXISTS monthly_sheets_user_id_month_year_key;
  --   ALTER TABLE monthly_sheets ADD CONSTRAINT monthly_sheets_user_id_month_year_class_name_key UNIQUE (user_id, month, year, class_name);
  unique(user_id, month, year, class_name)
);

-- Enable Row Level Security (RLS)
alter table monthly_sheets enable row level security;

-- Create a policy that allows users to select only their own sheets
create policy "Users can select their own sheets"
  on monthly_sheets for select
  using (auth.uid() = user_id);

-- Create a policy that allows admins to manage all sheets
create policy "Admins can manage all sheets"
  on monthly_sheets for all
  using (auth.jwt() ->> 'email' in ('vuhung@db.edu.vn', 'vuhungthcssuoilu@gmail.com'))
  with check (auth.jwt() ->> 'email' in ('vuhung@db.edu.vn', 'vuhungthcssuoilu@gmail.com'));

-- Create a policy that allows users to insert their own sheets
create policy "Users can insert their own sheets"
  on monthly_sheets for insert
  with check (auth.uid() = user_id);

-- Create a policy that allows users to update their own sheets
create policy "Users can update their own sheets"
  on monthly_sheets for update
  using (auth.uid() = user_id);

-- Create a policy that allows users to delete their own sheets
create policy "Users can delete their own sheets"
  on monthly_sheets for delete
  using (auth.uid() = user_id);

-- Create a table for global app settings (like login background image)
create table if not exists app_settings (
  setting_key text primary key,
  setting_value text not null,
  updated_at timestamptz default now()
);

-- Enable RLS for app_settings to fix security vulnerability
alter table app_settings enable row level security;

-- Anyone can read global settings (favicon, login background, signing location, school metadata)
create policy "Anyone can read global settings"
  on app_settings for select
  using (setting_key in (
    'global_favicon', 
    'login_bg_image', 
    'global_signing_location', 
    'school_name', 
    'header_title', 
    'school_year', 
    'footer_line1', 
    'footer_line2', 
    'footer_line3'
  ));

-- Authenticated users can manage their own preferences (keys starting with their UID)
create policy "Users can manage their own preferences"
  on app_settings for all
  using (setting_key like auth.uid()::text || '%')
  with check (setting_key like auth.uid()::text || '%');

-- Admins can manage all settings
create policy "Admins can manage all settings"
  on app_settings for all
  using (auth.jwt() ->> 'email' in ('vuhung@db.edu.vn', 'vuhungthcssuoilu@gmail.com'));

-- Create a function to automatically set the phone column in auth.users from user_metadata
create or replace function public.sync_phone_from_metadata()
returns trigger as $$
begin
  if new.raw_user_meta_data->>'phone' is not null then
    new.phone = new.raw_user_meta_data->>'phone';
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- Create a trigger to call the function before insert or update
drop trigger if exists sync_phone_on_auth_user on auth.users;
create trigger sync_phone_on_auth_user
  before insert or update on auth.users
  for each row execute procedure public.sync_phone_from_metadata();

-- ==========================================
-- LICENSE KEY SYSTEM
-- ==========================================

-- Create license_keys table
create table if not exists public.license_keys (
  id uuid default gen_random_uuid() primary key,
  key text not null unique,
  is_used boolean default false,
  used_by uuid,
  used_by_email text,
  created_at timestamptz default now(),
  used_at timestamptz,
  duration_days int default 365
);

-- RLS for license_keys
alter table public.license_keys enable row level security;

-- Admins can manage license keys (replace with your actual admin email)
create policy "Admins can manage license keys"
  on public.license_keys
  for all
  using (auth.jwt() ->> 'email' in ('vuhung@db.edu.vn', 'vuhungthcssuoilu@gmail.com'));

-- Users can view their own license key
create policy "Users can view their own license key"
  on public.license_keys
  for select
  using (auth.uid() = used_by);

-- Function to validate license key during signup
create or replace function public.check_license_key_before_signup()
returns trigger as $$
declare
  valid_key boolean;
begin
  -- 1. Nếu email là admin, bỏ qua kiểm tra mã bản quyền
  if new.email in ('vuhung@db.edu.vn', 'vuhungthcssuoilu@gmail.com') then
    return new;
  end if;

  -- 2. Nếu đăng ký qua bên thứ 3 (như Google OAuth), cho phép tạo tài khoản thành công mà không cần kiểm tra key lúc này.
  --    Sau khi đăng nhập xong, React Client sẽ kiểm tra và yêu cầu người dùng nhập mã bản quyền sau.
  if (new.encrypted_password is null or new.encrypted_password = '') or
     (new.raw_app_meta_data->>'provider' = 'google') or 
     (new.raw_user_meta_data->>'iss' like '%google%') or
     (new.raw_user_meta_data->>'provider' = 'google') then
    return new;
  end if;

  -- 3. Đối với đăng ký Email & Password thông thường, vẫn bắt buộc phải có license_key hợp lệ
  if new.raw_user_meta_data->>'license_key' is null or new.raw_user_meta_data->>'license_key' = '' then
    raise exception 'Mã bản quyền là bắt buộc để đăng ký tài khoản.';
  end if;

  -- Check if the key exists and is not used
  select exists(
    select 1 from public.license_keys
    where key = new.raw_user_meta_data->>'license_key'
    and is_used = false
  ) into valid_key;

  if not valid_key then
    raise exception 'Mã bản quyền không hợp lệ hoặc đã được sử dụng.';
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- Trigger before insert on auth.users to check license key
drop trigger if exists check_license_key_on_signup on auth.users;
create trigger check_license_key_on_signup
  before insert on auth.users
  for each row execute procedure public.check_license_key_before_signup();

-- Function to mark license key as used after signup
create or replace function public.mark_license_key_as_used()
returns trigger as $$
begin
  if new.raw_user_meta_data->>'license_key' is not null and new.raw_user_meta_data->>'license_key' != '' then
    update public.license_keys
    set is_used = true,
        used_by = new.id,
        used_by_email = new.email,
        used_at = now()
    where key = new.raw_user_meta_data->>'license_key';
  end if;
  
  return new;
end;
$$ language plpgsql security definer;

-- Function for existing users to activate a new license key (renewal)
create or replace function public.activate_new_license_key(license_key_text text)
returns json as $$
declare
  key_id uuid;
  is_already_used boolean;
  key_duration int;
begin
  -- Check if key exists and get its status
  select id, is_used, duration_days into key_id, is_already_used, key_duration
  from public.license_keys
  where key = license_key_text;

  if key_id is null then
    return json_build_object('success', false, 'message', 'Mã bản quyền không tồn tại.');
  end if;

  if is_already_used then
    return json_build_object('success', false, 'message', 'Mã bản quyền này đã được sử dụng.');
  end if;

  -- Mark as used by current user
  update public.license_keys
  set is_used = true,
      used_by = auth.uid(),
      used_by_email = (select email from auth.users where id = auth.uid()),
      used_at = now()
  where id = key_id;

  return json_build_object('success', true, 'message', 'Kích hoạt mã bản quyền thành công!', 'duration_days', key_duration);
end;
$$ language plpgsql security definer;

-- Function to check license key status before signup (bypasses RLS)
create or replace function public.check_license_key_status(key_text text)
returns json as $$
declare
  key_record record;
begin
  select is_used, duration_days into key_record
  from public.license_keys
  where key = key_text;

  if key_record is null then
    return json_build_object('valid', false, 'message', 'Mã không hợp lệ');
  end if;

  if key_record.is_used then
    return json_build_object('valid', false, 'message', 'Mã đã được sử dụng');
  end if;

  return json_build_object(
    'valid', true, 
    'duration_days', key_record.duration_days,
    'message', case when key_record.duration_days = 30 then 'Mã dùng thử (30 ngày)' else 'Mã bản quyền (1 năm)' end
  );
end;
$$ language plpgsql security definer;

-- Function to reset user password by admin
create or replace function public.admin_reset_user_password(target_user_id uuid, new_password text)
returns json as $$
begin
  -- Check if the caller is the admin
  if auth.jwt() ->> 'email' not in ('vuhung@db.edu.vn', 'vuhungthcssuoilu@gmail.com') then
    return json_build_object('success', false, 'message', 'Bạn không có quyền thực hiện hành động này.');
  end if;

  -- Update the password in auth.users
  -- Supabase uses bcrypt for passwords
  update auth.users
  set encrypted_password = crypt(new_password, gen_salt('bf'))
  where id = target_user_id;

  return json_build_object('success', true, 'message', 'Đã đặt lại mật khẩu thành công.');
end;
$$ language plpgsql security definer;

-- Trigger after insert on auth.users to mark key as used
drop trigger if exists mark_license_key_used_on_signup on auth.users;
create trigger mark_license_key_used_on_signup
  after insert on auth.users
  for each row execute procedure public.mark_license_key_as_used();

-- ==========================================
-- ACCESS LOG SYSTEM
-- ==========================================

-- Create a table for user access logs
create table if not exists public.access_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  email text not null,
  access_time timestamptz default now(),
  ip_address text
);

-- RLS for access_logs
alter table public.access_logs enable row level security;

-- Admins can view all access logs
create policy "Admins can view all access logs"
  on public.access_logs
  for select
  using (auth.jwt() ->> 'email' in ('vuhung@db.edu.vn', 'vuhungthcssuoilu@gmail.com'));

-- Users can view their own access logs
create policy "Users can view their own access logs"
  on public.access_logs
  for select
  using (auth.uid() = user_id);

-- Anyone authenticated can insert their own access log
create policy "Users can insert their own access logs"
  on public.access_logs
  for insert
  with check (auth.uid() = user_id);
