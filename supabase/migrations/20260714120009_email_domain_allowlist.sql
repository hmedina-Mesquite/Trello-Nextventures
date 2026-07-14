-- Restrict signup to approved company domains. Enforced in the same
-- trigger/transaction that creates the profile row, so a rejected domain
-- rolls back the auth.users insert too -- not just a client-side check that
-- a direct API call could skip.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  allowed_domains text[] := array[
    'nextventures.mx',
    'aerotower.mx',
    'binjamovil.com',
    'cordillera.io',
    'mesquite.mx',
    'mintakatech.mx',
    'ranchomiradorestelar.com',
    'rigelabs.mx'
  ];
  email_domain text := lower(split_part(new.email, '@', 2));
begin
  if not (email_domain = any(allowed_domains)) then
    raise exception 'Signups are restricted to approved company email domains.';
  end if;

  insert into public.profiles (id, username, full_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'full_name'
  );
  return new;
end;
$$;
