-- Políticas de Storage para el bucket "documentos" (crear el bucket
-- manualmente en Supabase > Storage > New bucket "documentos" > Privado,
-- antes de correr esto). Guarda CV, antecedentes y documentos de identidad o
-- migratorios: son datos sensibles, por eso el bucket NO es público. Cada
-- persona sube y lee solo sus propios archivos; un admin puede leer todos
-- para validar identidad y estatus migratorio.

drop policy if exists documentos_select_propio_o_admin on storage.objects;
create policy documentos_select_propio_o_admin on storage.objects for select to authenticated
  using (
    bucket_id = 'documentos'
    and ((storage.foldername(name))[1] = auth.uid()::text or mi_rol() = 'admin')
  );

drop policy if exists documentos_insert_propio on storage.objects;
create policy documentos_insert_propio on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists documentos_update_propio on storage.objects;
create policy documentos_update_propio on storage.objects for update to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);
