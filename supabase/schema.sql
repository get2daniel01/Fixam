-- =====================================================================
-- Fixam database: tables, rules, functions and storage.
-- Exported from the live Supabase project "fixam" (lebhilkianueucxhjinm) on 2 Nov 2026.
-- That project already has all of this. Run this file only to set up a NEW Supabase
-- project: Dashboard > SQL Editor > paste > Run. It is safe to run more than once.
-- =====================================================================
set check_function_bodies = off;

-- ---------- Tables ----------
create table if not exists public.admin_invites (
  email text not null,
  created_at timestamp with time zone not null default now(),
  constraint admin_invites_pkey PRIMARY KEY (email),
  constraint admin_invites_email_check CHECK ((email = lower(TRIM(BOTH FROM email))))
);

create table if not exists public.admins (
  user_id uuid not null,
  email text not null,
  created_at timestamp with time zone not null default now(),
  constraint admins_pkey PRIMARY KEY (user_id),
  constraint admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

create table if not exists public.artisan_signups (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  full_name text not null,
  phone text not null,
  trade text not null,
  years_experience smallint not null,
  base_area text not null,
  travel_radius text not null,
  bio text not null,
  certificate_path text,
  nin text not null,
  date_of_birth date not null,
  id_type text not null,
  id_document_path text not null,
  selfie_path text not null,
  home_address text not null,
  guarantor_name text not null,
  guarantor_phone text not null,
  guarantor_relationship text not null,
  bank_name text not null,
  account_number text not null,
  consent_given boolean not null,
  consent_at timestamp with time zone,
  status text not null default 'pending'::text,
  nin_verified boolean not null default false,
  guarantor_confirmed boolean not null default false,
  skill_test_passed boolean not null default false,
  reviewer_notes text,
  reviewed_at timestamp with time zone,
  email text,
  user_id uuid,
  decision_email_sent_at timestamp with time zone,
  constraint artisan_signups_pkey PRIMARY KEY (id),
  constraint artisan_signups_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  constraint artisan_signups_account_number_check CHECK ((account_number ~ '^[0-9]{10}$'::text)),
  constraint artisan_signups_base_area_check CHECK (((char_length(base_area) >= 2) AND (char_length(base_area) <= 60))),
  constraint artisan_signups_bio_check CHECK (((char_length(bio) >= 10) AND (char_length(bio) <= 300))),
  constraint artisan_signups_email_check CHECK (((email IS NULL) OR ((char_length(email) <= 254) AND (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text)))),
  constraint artisan_signups_full_name_check CHECK (((char_length(full_name) >= 3) AND (char_length(full_name) <= 120))),
  constraint artisan_signups_guarantor_name_check CHECK (((char_length(guarantor_name) >= 3) AND (char_length(guarantor_name) <= 120))),
  constraint artisan_signups_guarantor_phone_check CHECK ((guarantor_phone ~ '^0[789][01][0-9]{8}$'::text)),
  constraint artisan_signups_guarantor_relationship_check CHECK ((guarantor_relationship = ANY (ARRAY['Family member'::text, 'Former master or employer'::text, 'Community or religious leader'::text, 'Trade association official'::text, 'Other'::text]))),
  constraint artisan_signups_home_address_check CHECK (((char_length(home_address) >= 5) AND (char_length(home_address) <= 300))),
  constraint artisan_signups_id_type_check CHECK ((id_type = ANY (ARRAY['NIN slip or National ID card'::text, 'Voter''s card'::text, 'Driver''s licence'::text, 'International passport'::text]))),
  constraint artisan_signups_nin_check CHECK ((nin ~ '^[0-9]{11}$'::text)),
  constraint artisan_signups_phone_check CHECK ((phone ~ '^0[789][01][0-9]{8}$'::text)),
  constraint artisan_signups_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
  constraint artisan_signups_trade_check CHECK ((trade = ANY (ARRAY['plumbing'::text, 'electrical'::text, 'carpentry'::text, 'tailoring'::text, 'ac_generator'::text, 'painting'::text, 'welding'::text, 'tiling'::text]))),
  constraint artisan_signups_travel_radius_check CHECK ((travel_radius = ANY (ARRAY['Up to 3 km'::text, 'Up to 5 km'::text, 'Up to 10 km'::text, 'Anywhere in Yola'::text]))),
  constraint artisan_signups_years_experience_check CHECK (((years_experience >= 0) AND (years_experience <= 60)))
);
comment on table public.artisan_signups is 'Artisan applications with KYC details. Contains NIN and bank details: staff access only.';

create table if not exists public.customers (
  user_id uuid not null,
  created_at timestamp with time zone not null default now(),
  full_name text not null,
  phone text not null,
  email text,
  area text not null,
  constraint customers_pkey PRIMARY KEY (user_id),
  constraint customers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint customers_area_check CHECK ((area = ANY (ARRAY['Jimeta'::text, 'Karewa'::text, 'Doubeli'::text, 'Jambutu'::text, 'Bekaji'::text, 'Nassarawa'::text, 'Mbamba'::text, 'Wuro Chekke'::text, 'Yola Town'::text, 'Damilu'::text]))),
  constraint customers_full_name_check CHECK (((char_length(full_name) >= 3) AND (char_length(full_name) <= 120))),
  constraint customers_phone_check CHECK ((phone ~ '^0[789][01][0-9]{8}$'::text))
);

create table if not exists public.work_posts (
  id uuid not null,
  created_at timestamp with time zone not null default now(),
  artisan_id uuid not null,
  title text not null,
  trade text not null,
  description text not null,
  photo_paths text[] not null,
  starting_price integer,
  areas text[] not null,
  work_date date,
  own_work_confirmed boolean not null,
  visibility text not null default 'standard'::text,
  payment_status text not null default 'not_needed'::text,
  status text not null default 'pending'::text,
  featured_until timestamp with time zone,
  reviewer_notes text,
  reviewed_at timestamp with time zone,
  constraint work_posts_pkey PRIMARY KEY (id),
  constraint work_posts_artisan_id_fkey FOREIGN KEY (artisan_id) REFERENCES artisan_signups(id) ON DELETE CASCADE,
  constraint work_posts_areas_check CHECK (((cardinality(areas) >= 1) AND (areas <@ ARRAY['Jimeta'::text, 'Karewa'::text, 'Doubeli'::text, 'Jambutu'::text, 'Bekaji'::text, 'Nassarawa'::text, 'Mbamba'::text, 'Wuro Chekke'::text, 'Yola Town'::text, 'Damilu'::text]))),
  constraint work_posts_description_check CHECK (((char_length(description) >= 20) AND (char_length(description) <= 400))),
  constraint work_posts_own_work_confirmed_check CHECK (own_work_confirmed),
  constraint work_posts_payment_status_check CHECK ((payment_status = ANY (ARRAY['not_needed'::text, 'unpaid'::text, 'paid'::text]))),
  constraint work_posts_photo_paths_check CHECK (((cardinality(photo_paths) >= 1) AND (cardinality(photo_paths) <= 4))),
  constraint work_posts_starting_price_check CHECK (((starting_price IS NULL) OR ((starting_price >= 0) AND (starting_price <= 10000000)))),
  constraint work_posts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'live'::text, 'rejected'::text, 'removed'::text]))),
  constraint work_posts_title_check CHECK (((char_length(title) >= 5) AND (char_length(title) <= 60))),
  constraint work_posts_trade_check CHECK ((trade = ANY (ARRAY['plumbing'::text, 'electrical'::text, 'carpentry'::text, 'tailoring'::text, 'ac_generator'::text, 'painting'::text, 'welding'::text, 'tiling'::text]))),
  constraint work_posts_visibility_check CHECK ((visibility = ANY (ARRAY['standard'::text, 'featured_7'::text, 'featured_30'::text]))),
  constraint work_posts_work_date_check CHECK (((work_date IS NULL) OR (work_date <= CURRENT_DATE)))
);

create table if not exists public.bookings (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  customer_id uuid not null,
  artisan_id uuid not null,
  trade text not null,
  description text not null,
  area text not null,
  address text not null,
  preferred_date date not null,
  preferred_time text not null,
  status text not null default 'requested'::text,
  quote_amount integer,
  quote_note text,
  quoted_at timestamp with time zone,
  platform_fee integer,
  artisan_payout integer,
  paystack_reference text,
  paid_at timestamp with time zone,
  done_at timestamp with time zone,
  confirmed_at timestamp with time zone,
  dispute_reason text,
  payout_status text not null default 'not_due'::text,
  payout_at timestamp with time zone,
  admin_notes text,
  constraint bookings_paystack_reference_key UNIQUE (paystack_reference),
  constraint bookings_pkey PRIMARY KEY (id),
  constraint bookings_artisan_id_fkey FOREIGN KEY (artisan_id) REFERENCES artisan_signups(id) ON DELETE RESTRICT,
  constraint bookings_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(user_id) ON DELETE RESTRICT,
  constraint bookings_address_check CHECK (((char_length(address) >= 5) AND (char_length(address) <= 300))),
  constraint bookings_area_check CHECK ((area = ANY (ARRAY['Jimeta'::text, 'Karewa'::text, 'Doubeli'::text, 'Jambutu'::text, 'Bekaji'::text, 'Nassarawa'::text, 'Mbamba'::text, 'Wuro Chekke'::text, 'Yola Town'::text, 'Damilu'::text]))),
  constraint bookings_description_check CHECK (((char_length(description) >= 10) AND (char_length(description) <= 500))),
  constraint bookings_payout_status_check CHECK ((payout_status = ANY (ARRAY['not_due'::text, 'due'::text, 'paid'::text, 'not_applicable'::text]))),
  constraint bookings_preferred_time_check CHECK ((preferred_time = ANY (ARRAY['Morning'::text, 'Afternoon'::text, 'Evening'::text, 'Any time'::text]))),
  constraint bookings_quote_amount_check CHECK (((quote_amount IS NULL) OR ((quote_amount >= 500) AND (quote_amount <= 5000000)))),
  constraint bookings_quote_note_check CHECK (((quote_note IS NULL) OR (char_length(quote_note) <= 300))),
  constraint bookings_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'quoted'::text, 'declined'::text, 'cancelled'::text, 'paid'::text, 'in_progress'::text, 'done'::text, 'confirmed'::text, 'disputed'::text, 'refunded'::text])))
);

-- ---------- Indexes ----------
CREATE UNIQUE INDEX IF NOT EXISTS artisan_signups_email_active ON public.artisan_signups USING btree (lower(email)) WHERE ((email IS NOT NULL) AND (status <> 'rejected'::text));
CREATE UNIQUE INDEX IF NOT EXISTS artisan_signups_phone_active ON public.artisan_signups USING btree (phone) WHERE (status <> 'rejected'::text);
CREATE INDEX IF NOT EXISTS artisan_signups_status_created ON public.artisan_signups USING btree (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS artisan_signups_user_active ON public.artisan_signups USING btree (user_id) WHERE ((user_id IS NOT NULL) AND (status <> 'rejected'::text));
CREATE INDEX IF NOT EXISTS bookings_artisan ON public.bookings USING btree (artisan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_customer ON public.bookings USING btree (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS work_posts_artisan ON public.work_posts USING btree (artisan_id);
CREATE INDEX IF NOT EXISTS work_posts_status_created ON public.work_posts USING btree (status, created_at DESC);

-- ---------- Functions ----------
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.admins a where a.user_id = auth.uid())
      or exists (select 1 from auth.users u join public.admin_invites i on i.email = lower(u.email)
                 where u.id = auth.uid() and u.email_confirmed_at is not null);
$function$;

CREATE OR REPLACE FUNCTION public.my_application_id()
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_id uuid;
begin
  if v_uid is null then return null; end if;
  select s.id into v_id from public.artisan_signups s
   where s.user_id = v_uid order by (s.status <> 'rejected') desc, s.created_at desc limit 1;
  if v_id is not null then return v_id; end if;

  select lower(u.email) into v_email from auth.users u
   where u.id = v_uid and u.email_confirmed_at is not null;
  if v_email is null then return null; end if;

  update public.artisan_signups s set user_id = v_uid
   where s.id = (select s2.id from public.artisan_signups s2
                  where lower(s2.email) = v_email and s2.user_id is null
                  order by (s2.status <> 'rejected') desc, s2.created_at desc limit 1)
  returning s.id into v_id;
  return v_id;
end;
$function$;

-- Fixam's fee in percent (placeholder: change 10 to your rate)
CREATE OR REPLACE FUNCTION public.fixam_commission_percent()
 RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$ select 10 $function$;

CREATE OR REPLACE FUNCTION public.artisan_signups_before_insert()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
begin
  new.created_at          := now();
  new.status              := 'pending';
  new.nin_verified        := false;
  new.guarantor_confirmed := false;
  new.skill_test_passed   := false;
  new.reviewer_notes      := null;
  new.reviewed_at         := null;
  new.user_id             := null;
  new.email               := lower(trim(new.email));
  if new.consent_given is not true then
    raise exception 'Consent to identity and guarantor checks is required' using errcode = '23514';
  end if;
  new.consent_at := now();
  if new.date_of_birth > (current_date - interval '18 years')::date then
    raise exception 'Applicant must be at least 18 years old' using errcode = '23514';
  end if;
  if new.guarantor_phone = new.phone then
    raise exception 'Guarantor phone must be different from the applicant phone' using errcode = '23514';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_customer()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if coalesce(new.raw_user_meta_data->>'role','') = 'customer' then
    begin
      insert into public.customers (user_id, full_name, phone, email, area)
      values (new.id, trim(new.raw_user_meta_data->>'full_name'), trim(new.raw_user_meta_data->>'phone'),
              lower(new.email), new.raw_user_meta_data->>'area')
      on conflict (user_id) do nothing;
    exception when others then null;
    end;
  end if;
  return new;
end; $function$;

-- Make someone an admin (works before or after their account exists).
-- Run in the SQL Editor: select public.make_admin('name@example.com');
CREATE OR REPLACE FUNCTION public.make_admin(p_email text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_uid uuid; v_email text := lower(trim(p_email));
begin
  select u.id into v_uid from auth.users u where lower(u.email) = v_email;
  if v_uid is null then
    insert into public.admin_invites (email) values (v_email) on conflict do nothing;
    return 'Saved. ' || v_email || ' becomes a Fixam admin as soon as an account with this email is created and confirmed.';
  end if;
  insert into public.admins (user_id, email) values (v_uid, v_email) on conflict (user_id) do nothing;
  return 'Done. ' || v_email || ' is now a Fixam admin.';
end; $function$;

CREATE OR REPLACE FUNCTION public.my_role()
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then return null; end if;
  if public.is_admin() then return 'admin'; end if;
  if public.my_application_id() is not null then return 'artisan'; end if;
  if exists (select 1 from public.customers c where c.user_id = auth.uid()) then return 'customer'; end if;
  return coalesce((select u.raw_user_meta_data->>'role' from auth.users u where u.id = auth.uid()), 'unknown');
end; $function$;

CREATE OR REPLACE FUNCTION public.my_application()
 RETURNS TABLE(reference text, first_name text, trade text, base_area text, status text, nin_verified boolean, guarantor_confirmed boolean, skill_test_passed boolean, submitted_at timestamp with time zone)
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select upper(left(s.id::text, 8)), split_part(s.full_name, ' ', 1), s.trade, s.base_area, s.status,
         s.nin_verified, s.guarantor_confirmed, s.skill_test_passed, s.created_at
  from public.artisan_signups s
  where s.id = public.my_application_id();
$function$;

CREATE OR REPLACE FUNCTION public.my_work_posts()
 RETURNS TABLE(id uuid, created_at timestamp with time zone, title text, trade text, status text, visibility text, payment_status text, featured_until timestamp with time zone, photo_paths text[], rejection_reason text)
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select w.id, w.created_at, w.title, w.trade, w.status, w.visibility, w.payment_status, w.featured_until,
         w.photo_paths, case when w.status = 'rejected' then w.reviewer_notes end
  from public.work_posts w
  where w.artisan_id = public.my_application_id() and w.status <> 'removed'
  order by w.created_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.submit_my_work_post(p_post_id uuid, p_title text, p_trade text, p_description text, p_photo_paths text[], p_starting_price integer, p_areas text[], p_work_date date, p_own_work boolean, p_visibility text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_artisan uuid;
  v_found int;
  v_pending int;
begin
  select s.id into v_artisan from public.artisan_signups s
   where s.id = public.my_application_id() and s.status = 'approved';
  if v_artisan is null then
    raise exception 'Only approved Fixam artisans can post work' using errcode = '28000';
  end if;
  if (coalesce(p_title,'') || ' ' || coalesce(p_description,'')) ~ '(\+?234|0)[ -]?[789][01]([ -]?[0-9]){8}' then
    raise exception 'Remove the phone number. Customers contact you through Fixam.' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(p_photo_paths) p where p not like p_post_id::text || '/%') then
    raise exception 'Photos do not belong to this post' using errcode = '23514';
  end if;
  select count(*) into v_found from storage.objects o
   where o.bucket_id = 'work-photos' and o.name = any(p_photo_paths);
  if v_found <> cardinality(p_photo_paths) then
    raise exception 'One or more photos did not finish uploading' using errcode = '23514';
  end if;
  select count(*) into v_pending from public.work_posts w where w.artisan_id = v_artisan and w.status = 'pending';
  if v_pending >= 5 then
    raise exception 'You already have 5 posts waiting for review. Wait for Fixam to review them first.' using errcode = '23514';
  end if;
  insert into public.work_posts (id, artisan_id, title, trade, description, photo_paths, starting_price,
                                 areas, work_date, own_work_confirmed, visibility, payment_status, status)
  values (p_post_id, v_artisan, trim(p_title), p_trade, trim(p_description), p_photo_paths, p_starting_price,
          p_areas, p_work_date, coalesce(p_own_work,false), coalesce(p_visibility,'standard'),
          case when coalesce(p_visibility,'standard') = 'standard' then 'not_needed' else 'unpaid' end,
          'pending');
  return p_post_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_my_work_post(p_id uuid)
 RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with u as (
    update public.work_posts w set status = 'removed'
     where w.id = p_id and w.artisan_id = public.my_application_id() and w.status in ('pending','live')
    returning 1)
  select exists (select 1 from u);
$function$;

CREATE OR REPLACE FUNCTION public.my_customer_profile()
 RETURNS TABLE(full_name text, phone text, email text, area text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select c.full_name, c.phone, coalesce(c.email, (select u.email from auth.users u where u.id = c.user_id)), c.area
  from public.customers c where c.user_id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.save_my_customer_profile(p_full_name text, p_phone text, p_area text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  insert into public.customers (user_id, full_name, phone, email, area)
  values (auth.uid(), trim(p_full_name), trim(p_phone), (select lower(u.email) from auth.users u where u.id = auth.uid()), p_area)
  on conflict (user_id) do update set full_name = excluded.full_name, phone = excluded.phone, area = excluded.area;
  return true;
end; $function$;

CREATE OR REPLACE FUNCTION public.list_artisans(p_area text DEFAULT NULL::text, p_trade text DEFAULT NULL::text)
 RETURNS TABLE(artisan_id uuid, display_name text, trade text, base_area text, travel_radius text, bio text, years_experience smallint, live_posts integer, cover_photo text, jobs_completed integer, serves_everywhere boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select s.id,
         split_part(s.full_name,' ',1) || coalesce(' ' || nullif(left(split_part(s.full_name,' ',2),1),'') || '.', ''),
         s.trade, s.base_area, s.travel_radius, s.bio, s.years_experience,
         (select count(*)::int from public.work_posts w where w.artisan_id = s.id and w.status = 'live'),
         (select w.photo_paths[1] from public.work_posts w where w.artisan_id = s.id and w.status = 'live' order by w.created_at desc limit 1),
         (select count(*)::int from public.bookings b where b.artisan_id = s.id and b.status = 'confirmed'),
         s.travel_radius = 'Anywhere in Yola'
  from public.artisan_signups s
  where s.status = 'approved' and auth.uid() is not null
    and (p_trade is null or s.trade = p_trade)
    and (p_area is null or s.base_area = p_area or s.travel_radius = 'Anywhere in Yola')
  order by (s.base_area = p_area) desc nulls last, s.years_experience desc;
$function$;

CREATE OR REPLACE FUNCTION public.artisan_live_posts(p_artisan_id uuid)
 RETURNS TABLE(id uuid, title text, description text, photo_paths text[], starting_price integer, areas text[], work_date date)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select w.id, w.title, w.description, w.photo_paths, w.starting_price, w.areas, w.work_date
  from public.work_posts w
  join public.artisan_signups s on s.id = w.artisan_id and s.status = 'approved'
  where w.artisan_id = p_artisan_id and w.status = 'live' and auth.uid() is not null
  order by (w.visibility <> 'standard' and w.payment_status = 'paid' and w.featured_until > now()) desc, w.created_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.create_booking(p_artisan_id uuid, p_description text, p_area text, p_address text, p_preferred_date date, p_preferred_time text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_trade text; v_id uuid; v_open int;
begin
  if not exists (select 1 from public.customers c where c.user_id = auth.uid()) then
    raise exception 'Complete your customer profile first' using errcode = '28000'; end if;
  select s.trade into v_trade from public.artisan_signups s where s.id = p_artisan_id and s.status = 'approved';
  if v_trade is null then raise exception 'This artisan is not available' using errcode = '23514'; end if;
  if p_preferred_date < current_date or p_preferred_date > current_date + 60 then
    raise exception 'Choose a date between today and 60 days from now' using errcode = '23514'; end if;
  select count(*) into v_open from public.bookings b
   where b.customer_id = auth.uid() and b.status in ('requested','quoted');
  if v_open >= 10 then raise exception 'You have 10 open requests. Wait for replies or cancel some first.' using errcode = '23514'; end if;
  insert into public.bookings (customer_id, artisan_id, trade, description, area, address, preferred_date, preferred_time)
  values (auth.uid(), p_artisan_id, v_trade, trim(p_description), p_area, trim(p_address), p_preferred_date, p_preferred_time)
  returning id into v_id;
  return v_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.my_bookings()
 RETURNS TABLE(id uuid, created_at timestamp with time zone, artisan_id uuid, artisan_name text, artisan_phone text, trade text, description text, area text, address text, preferred_date date, preferred_time text, status text, quote_amount integer, quote_note text, paid_at timestamp with time zone, done_at timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select b.id, b.created_at, b.artisan_id,
         split_part(s.full_name,' ',1) || coalesce(' ' || nullif(left(split_part(s.full_name,' ',2),1),'') || '.', ''),
         case when b.status in ('paid','in_progress','done','confirmed','disputed') then s.phone end,
         b.trade, b.description, b.area, b.address, b.preferred_date, b.preferred_time, b.status,
         b.quote_amount, b.quote_note, b.paid_at, b.done_at
  from public.bookings b join public.artisan_signups s on s.id = b.artisan_id
  where b.customer_id = auth.uid()
  order by b.created_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.customer_update_booking(p_id uuid, p_action text, p_reason text DEFAULT NULL::text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_id and customer_id = auth.uid() for update;
  if b.id is null then raise exception 'Booking not found' using errcode = '28000'; end if;
  if p_action = 'cancel' and b.status in ('requested','quoted') then
    update public.bookings set status = 'cancelled', updated_at = now() where id = p_id;
  elsif p_action = 'confirm' and b.status = 'done' then
    update public.bookings set status = 'confirmed', confirmed_at = now(), payout_status = 'due', updated_at = now() where id = p_id;
  elsif p_action = 'report' and b.status in ('paid','in_progress','done') then
    if coalesce(char_length(trim(p_reason)),0) < 10 then raise exception 'Describe the problem in at least 10 characters' using errcode = '23514'; end if;
    update public.bookings set status = 'disputed', dispute_reason = trim(p_reason), updated_at = now() where id = p_id;
  else
    raise exception 'This action is not possible for this booking now' using errcode = '23514';
  end if;
  return 'ok';
end; $function$;

CREATE OR REPLACE FUNCTION public.artisan_jobs()
 RETURNS TABLE(id uuid, created_at timestamp with time zone, customer_name text, customer_phone text, description text, area text, address text, preferred_date date, preferred_time text, status text, quote_amount integer, quote_note text, artisan_payout integer, payout_status text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select b.id, b.created_at, split_part(c.full_name,' ',1),
         case when b.status in ('paid','in_progress','done','confirmed','disputed') then c.phone end,
         b.description, b.area,
         case when b.status in ('paid','in_progress','done','confirmed','disputed') then b.address end,
         b.preferred_date, b.preferred_time, b.status, b.quote_amount, b.quote_note,
         coalesce(b.artisan_payout, case when b.quote_amount is not null then b.quote_amount - (b.quote_amount * public.fixam_commission_percent() / 100) end),
         b.payout_status
  from public.bookings b join public.customers c on c.user_id = b.customer_id
  where b.artisan_id = public.my_application_id()
  order by b.created_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.artisan_update_job(p_id uuid, p_action text, p_amount integer DEFAULT NULL::integer, p_note text DEFAULT NULL::text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare b public.bookings;
begin
  select * into b from public.bookings
   where id = p_id and artisan_id = public.my_application_id()
     and exists (select 1 from public.artisan_signups s where s.id = artisan_id and s.status = 'approved')
   for update;
  if b.id is null then raise exception 'Job not found' using errcode = '28000'; end if;
  if p_action = 'quote' and b.status in ('requested','quoted') then
    if p_amount is null or p_amount < 500 or p_amount > 5000000 then
      raise exception 'Enter a price between 500 and 5,000,000 naira' using errcode = '23514'; end if;
    update public.bookings set status = 'quoted', quote_amount = p_amount, quote_note = nullif(trim(p_note),''),
           quoted_at = now(), updated_at = now() where id = p_id;
  elsif p_action = 'decline' and b.status in ('requested','quoted') then
    update public.bookings set status = 'declined', updated_at = now() where id = p_id;
  elsif p_action = 'start' and b.status = 'paid' then
    update public.bookings set status = 'in_progress', updated_at = now() where id = p_id;
  elsif p_action = 'done' and b.status in ('paid','in_progress') then
    update public.bookings set status = 'done', done_at = now(), updated_at = now() where id = p_id;
  else
    raise exception 'This action is not possible for this job now' using errcode = '23514';
  end if;
  return 'ok';
end; $function$;

-- Admin functions (each refuses anyone who is not an admin)
CREATE OR REPLACE FUNCTION public.admin_kyc_list(p_status text DEFAULT 'pending'::text)
 RETURNS SETOF artisan_signups LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '28000'; end if;
  return query select * from public.artisan_signups s where s.status = p_status order by s.created_at;
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_decide_kyc(p_id uuid, p_decision text, p_notes text DEFAULT NULL::text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '28000'; end if;
  if p_decision = 'approved' then
    update public.artisan_signups set status = 'approved', nin_verified = true, guarantor_confirmed = true,
           skill_test_passed = true, reviewer_notes = nullif(trim(p_notes),''), reviewed_at = now(), decision_email_sent_at = null
     where id = p_id and status = 'pending';
  elsif p_decision = 'rejected' then
    if coalesce(char_length(trim(p_notes)),0) < 5 then raise exception 'Write the reason for rejecting' using errcode = '23514'; end if;
    update public.artisan_signups set status = 'rejected', reviewer_notes = trim(p_notes), reviewed_at = now(), decision_email_sent_at = null
     where id = p_id and status = 'pending';
  else
    raise exception 'Decision must be approved or rejected' using errcode = '23514';
  end if;
  if not found then raise exception 'This application is no longer pending' using errcode = '23514'; end if;
  return p_decision;
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_posts_list(p_status text DEFAULT 'pending'::text)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, artisan_name text, trade text, title text, description text, photo_paths text[], starting_price integer, areas text[], visibility text, payment_status text, status text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '28000'; end if;
  return query select w.id, w.created_at, s.full_name, w.trade, w.title, w.description, w.photo_paths, w.starting_price,
                      w.areas, w.visibility, w.payment_status, w.status
    from public.work_posts w join public.artisan_signups s on s.id = w.artisan_id
    where w.status = p_status order by w.created_at;
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_decide_post(p_id uuid, p_decision text, p_notes text DEFAULT NULL::text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '28000'; end if;
  if p_decision = 'live' then
    update public.work_posts set status = 'live', reviewer_notes = nullif(trim(p_notes),''), reviewed_at = now()
     where id = p_id and status = 'pending';
  elsif p_decision = 'rejected' then
    if coalesce(char_length(trim(p_notes)),0) < 5 then raise exception 'Write the reason for rejecting' using errcode = '23514'; end if;
    update public.work_posts set status = 'rejected', reviewer_notes = trim(p_notes), reviewed_at = now()
     where id = p_id and status = 'pending';
  elsif p_decision = 'featured_paid' then
    update public.work_posts set payment_status = 'paid',
           featured_until = now() + case visibility when 'featured_30' then interval '30 days' else interval '7 days' end
     where id = p_id and visibility <> 'standard' and payment_status = 'unpaid';
  else
    raise exception 'Unknown decision' using errcode = '23514';
  end if;
  if not found then raise exception 'This post has already been reviewed' using errcode = '23514'; end if;
  return p_decision;
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_bookings_list()
 RETURNS TABLE(id uuid, created_at timestamp with time zone, customer_name text, customer_phone text, artisan_name text, artisan_phone text, artisan_bank text, artisan_account text, trade text, area text, description text, status text, quote_amount integer, platform_fee integer, artisan_payout integer, paystack_reference text, paid_at timestamp with time zone, payout_status text, dispute_reason text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '28000'; end if;
  return query select b.id, b.created_at, c.full_name, c.phone, s.full_name, s.phone, s.bank_name, s.account_number,
                      b.trade, b.area, b.description, b.status, b.quote_amount, b.platform_fee, b.artisan_payout,
                      b.paystack_reference, b.paid_at, b.payout_status, b.dispute_reason
    from public.bookings b join public.customers c on c.user_id = b.customer_id join public.artisan_signups s on s.id = b.artisan_id
    order by b.created_at desc limit 300;
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_update_booking(p_id uuid, p_action text, p_notes text DEFAULT NULL::text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '28000'; end if;
  if p_action = 'payout_sent' then
    update public.bookings set payout_status = 'paid', payout_at = now(), admin_notes = coalesce(nullif(trim(p_notes),''), admin_notes), updated_at = now()
     where id = p_id and payout_status = 'due';
  elsif p_action = 'release' then
    update public.bookings set status = 'confirmed', confirmed_at = now(), payout_status = 'due', admin_notes = nullif(trim(p_notes),''), updated_at = now()
     where id = p_id and status = 'disputed';
  elsif p_action = 'refund' then
    update public.bookings set status = 'refunded', payout_status = 'not_applicable', admin_notes = nullif(trim(p_notes),''), updated_at = now()
     where id = p_id and status = 'disputed';
  else
    raise exception 'Unknown action' using errcode = '23514';
  end if;
  if not found then raise exception 'This booking has changed. Reload and try again.' using errcode = '23514'; end if;
  return p_action;
end; $function$;

-- ---------- Triggers ----------
drop trigger if exists artisan_signups_before_insert on public.artisan_signups;
CREATE TRIGGER artisan_signups_before_insert BEFORE INSERT ON public.artisan_signups FOR EACH ROW EXECUTE FUNCTION artisan_signups_before_insert();
drop trigger if exists on_auth_user_created_customer on auth.users;
CREATE TRIGGER on_auth_user_created_customer AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_customer();

-- ---------- Row-level security and table access ----------
-- Visitors and signed-in users never touch tables directly, except: submit an application,
-- and read live work posts. Everything else goes through the functions above.
alter table public.admin_invites   enable row level security;
alter table public.admins          enable row level security;
alter table public.artisan_signups enable row level security;
alter table public.customers       enable row level security;
alter table public.work_posts      enable row level security;
alter table public.bookings        enable row level security;
revoke all on public.admin_invites, public.admins, public.artisan_signups, public.customers, public.work_posts, public.bookings from anon, authenticated;
grant insert on public.artisan_signups to anon, authenticated;
grant select on public.work_posts to anon, authenticated;

drop policy if exists "Anyone can submit an application" on public.artisan_signups;
create policy "Anyone can submit an application" on public.artisan_signups as PERMISSIVE for INSERT to anon, authenticated
  with check (((status = 'pending'::text) AND (nin_verified = false) AND (guarantor_confirmed = false) AND (skill_test_passed = false)));
drop policy if exists "Anyone can see live posts" on public.work_posts;
create policy "Anyone can see live posts" on public.work_posts as PERMISSIVE for SELECT to anon, authenticated
  using ((status = 'live'::text));

-- ---------- Function access: signed-in users only (admin functions check admin themselves) ----------
do $$
declare f text;
begin
  foreach f in array array[
    'public.is_admin()', 'public.my_application_id()', 'public.my_application()', 'public.my_work_posts()',
    'public.submit_my_work_post(uuid,text,text,text,text[],integer,text[],date,boolean,text)', 'public.remove_my_work_post(uuid)',
    'public.my_customer_profile()', 'public.save_my_customer_profile(text,text,text)', 'public.my_role()',
    'public.list_artisans(text,text)', 'public.artisan_live_posts(uuid)',
    'public.create_booking(uuid,text,text,text,date,text)', 'public.my_bookings()', 'public.customer_update_booking(uuid,text,text)',
    'public.artisan_jobs()', 'public.artisan_update_job(uuid,text,integer,text)',
    'public.admin_kyc_list(text)', 'public.admin_decide_kyc(uuid,text,text)', 'public.admin_posts_list(text)',
    'public.admin_decide_post(uuid,text,text)', 'public.admin_bookings_list()', 'public.admin_update_booking(uuid,text,text)',
    'public.fixam_commission_percent()']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
grant execute on function public.fixam_commission_percent() to service_role;
revoke all on function public.make_admin(text) from public, anon, authenticated;
revoke all on function public.handle_new_customer() from public, anon, authenticated;

-- ---------- Storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kyc-documents', 'kyc-documents', false, 5242880, array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('work-photos', 'work-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Applicants can upload KYC files" on storage.objects;
create policy "Applicants can upload KYC files" on storage.objects as PERMISSIVE for INSERT to anon, authenticated
  with check (((bucket_id = 'kyc-documents'::text) AND ((storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text)));
drop policy if exists "Admins can read KYC files" on storage.objects;
create policy "Admins can read KYC files" on storage.objects as PERMISSIVE for SELECT to authenticated
  using (((bucket_id = 'kyc-documents'::text) AND is_admin()));
drop policy if exists "Artisans can upload work photos" on storage.objects;
create policy "Artisans can upload work photos" on storage.objects as PERMISSIVE for INSERT to authenticated
  with check (((bucket_id = 'work-photos'::text) AND ((storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text)));
