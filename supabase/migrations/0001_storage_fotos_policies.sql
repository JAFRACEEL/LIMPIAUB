-- Políticas de Storage para el bucket "fotos" (crear el bucket manualmente en
-- Supabase > Storage > New bucket "fotos" > Public, antes de correr esto).
-- Permite lectura pública y que cada usuario autenticado suba/actualice solo
-- los archivos dentro de su propia carpeta (<user_id>/...).

drop policy if exists fotos_select_publico on storage.objects;
create policy fotos_select_publico on storage.objects for select
  using (bucket_id = 'fotos');

drop policy if exists fotos_insert_propio on storage.objects;
create policy fotos_insert_propio on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists fotos_update_propio on storage.objects;
create policy fotos_update_propio on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
