drop policy if exists "englishshow_public_select" on storage.objects;
drop policy if exists "englishshow_public_insert" on storage.objects;
drop policy if exists "englishshow_public_update" on storage.objects;
drop policy if exists "englishshow_public_delete" on storage.objects;

create policy "englishshow_public_select"
on storage.objects
for select
to public
using (
  bucket_id = 'englishshow'
  and name like any (array[
    'references/%',
    'generated/%',
    'audio/%',
    'videos/%'
  ])
);

create policy "englishshow_public_insert"
on storage.objects
for insert
to public
with check (
  bucket_id = 'englishshow'
  and name like any (array[
    'references/%',
    'generated/%',
    'audio/%',
    'videos/%'
  ])
);

create policy "englishshow_public_update"
on storage.objects
for update
to public
using (
  bucket_id = 'englishshow'
  and name like any (array[
    'references/%',
    'generated/%',
    'audio/%',
    'videos/%'
  ])
)
with check (
  bucket_id = 'englishshow'
  and name like any (array[
    'references/%',
    'generated/%',
    'audio/%',
    'videos/%'
  ])
);

create policy "englishshow_public_delete"
on storage.objects
for delete
to public
using (
  bucket_id = 'englishshow'
  and name like any (array[
    'references/%',
    'generated/%',
    'audio/%',
    'videos/%'
  ])
);
