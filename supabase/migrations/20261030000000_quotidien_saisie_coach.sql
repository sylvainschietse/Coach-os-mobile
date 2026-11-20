-- Coach OS · suivis du quotidien : le coach peut aussi noter une journée pour son client
-- (pendant une séance, ou quand le client lui donne ses chiffres). Ajout de règles d'accès seulement.

create policy "coach : noter le quotidien de ses clients" on public.suivis_quotidiens for insert
  with check (public.est_mon_client(client_id) and jour <= current_date + 1);
create policy "coach : corriger le quotidien de ses clients" on public.suivis_quotidiens for update
  using (public.est_mon_client(client_id)) with check (public.est_mon_client(client_id) and jour <= current_date + 1);
create policy "coach : effacer le quotidien de ses clients" on public.suivis_quotidiens for delete
  using (public.est_mon_client(client_id));
