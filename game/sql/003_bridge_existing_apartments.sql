begin;
-- Bridge the existing 32 Compound apartment records into game storage without changing their existing assignments.
alter table con.game_apartments add column if not exists legacy_apartment_id text unique;
insert into con.game_apartments(id,location_id,label,capacity,state,legacy_apartment_id)
select md5('con-existing-apartment:'||a.id)::uuid,'surface',a.id,a.capacity,
 case when a.locked then 'sealed' else 'available' end,a.id
from con.compound_apartments a
on conflict(id) do nothing;
insert into con.game_storage(storage_type,apartment_id,capacity)
select 'apartment',a.id,100
from con.game_apartments a
where not exists(select 1 from con.game_storage s where s.apartment_id=a.id and s.storage_type='apartment');
insert into con.game_residencies(character_id,apartment_id,status)
select c.id,a.id,'active'
from con.compound_residency r
join con.game_characters c on c.discord_id=r.discord_id
join con.game_apartments a on a.legacy_apartment_id=r.apartment_id
where not exists(select 1 from con.game_residencies gr where gr.character_id=c.id and gr.status='active')
on conflict do nothing;
commit;