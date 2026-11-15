begin;
insert into con.game_settings(key,value) values
('progression','{"level_xp_base":100,"maximum_level":100,"attribute_training_per_point":250,"maximum_attribute":20}'::jsonb)
on conflict(key) do nothing;

create or replace function con.game_sync_character_level()
returns trigger language plpgsql security invoker set search_path=con,pg_temp as $$
declare v_base integer; v_max integer;
begin
 select greatest(10,least(100000,coalesce((value->>'level_xp_base')::integer,100))),
        greatest(2,least(200,coalesce((value->>'maximum_level')::integer,100)))
 into v_base,v_max from con.game_settings where key='progression';
 new.level:=least(coalesce(v_max,100),1+floor(sqrt(new.xp::numeric/coalesce(v_base,100)))::integer);
 return new;
end $$;
drop trigger if exists game_sync_character_level on con.game_characters;
create trigger game_sync_character_level
before insert or update of xp on con.game_characters
for each row execute function con.game_sync_character_level();

create or replace function con.game_attribute_from_profession_xp()
returns trigger language plpgsql security invoker set search_path=con,pg_temp as $$
declare v_attr text; v_gain bigint; v_rate integer; v_max integer;
begin
 v_gain:=case when tg_op='INSERT' then new.xp else new.xp-old.xp end;
 if v_gain<=0 then return new; end if;
 v_attr:=case new.profession_id
 when 'carpenter' then 'strength'
 when 'metalworker' then 'endurance'
 when 'medic' then 'intelligence'
 when 'farmer' then 'perception'
 when 'engineer' then 'intelligence'
 when 'scavenger' then 'agility'
 else null end;
 if v_attr is null then return new; end if;
 select greatest(20,least(100000,coalesce((value->>'attribute_training_per_point')::integer,250))),
        greatest(10,least(20,coalesce((value->>'maximum_attribute')::integer,20)))
 into v_rate,v_max from con.game_settings where key='progression';
 update con.game_character_attributes
 set score=least(coalesce(v_max,20),score+
   floor((training_xp+v_gain)::numeric/coalesce(v_rate,250))::integer-
   floor(training_xp::numeric/coalesce(v_rate,250))::integer),
 training_xp=training_xp+v_gain
 where character_id=new.character_id and attribute=v_attr;
 return new;
end $$;
drop trigger if exists game_attribute_from_profession_xp on con.game_character_skills;
create trigger game_attribute_from_profession_xp
after insert or update of xp on con.game_character_skills
for each row execute function con.game_attribute_from_profession_xp();
commit;