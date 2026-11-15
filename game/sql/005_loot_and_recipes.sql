begin;
insert into con.game_items(id,name,category) values
('first_aid_kit','First Aid Kit','consumable'),
('wooden_chair','Wooden Chair','furniture'),
('steel_bracket','Steel Bracket','material')
on conflict(id) do nothing;
update con.game_task_templates t set rewards=jsonb_set(t.rewards,'{items}',d.items,true)
from (values
('Survey the Surface Perimeter','{"scrap":1}'::jsonb),
('Catalog Abandoned Supplies','{"lumber":2}'::jsonb),
('Inspect Collapsed Passage','{"electrical_parts":1}'::jsonb),
('Check Exposed Cabling','{"electrical_parts":2}'::jsonb),
('Repair Surface Shelter','{"lumber":2}'::jsonb),
('Assemble Temporary Storage Crates','{"lumber":1}'::jsonb),
('Inspect Salvage Tools','{"scrap":2}'::jsonb),
('Sort Recovered Scrap','{"scrap":3}'::jsonb),
('Stock the Surface Infirmary','{"medical_supplies":2}'::jsonb),
('Establish Triage Station','{"medical_supplies":1}'::jsonb),
('Survey Soil Conditions','{"seeds":1}'::jsonb),
('Maintain Food Storage','{"food":2}'::jsonb)
) d(title,items) where t.title=d.title and t.status='published';
insert into con.game_recipes(title,profession_id,skill_xp_required,ingredients,products,duration_minutes,xp,status) values
('Smelt Salvaged Metal','metalworker',0,'{"scrap":3}','{"refined_metal":1}',20,35,'published'),
('Fabricate Structural Bracket','metalworker',25,'{"refined_metal":2}','{"steel_bracket":2}',25,45,'published'),
('Build Wooden Chair','carpenter',0,'{"lumber":2}','{"wooden_chair":1}',15,30,'published'),
('Assemble First Aid Kit','medic',0,'{"medical_supplies":2}','{"first_aid_kit":1}',20,35,'published'),
('Grow Starter Crop','farmer',0,'{"seeds":1}','{"food":2}',30,40,'published'),
('Assemble Repair Kit','engineer',0,'{"electrical_parts":2,"scrap":1}','{"toolkit":1}',25,45,'published')
on conflict do nothing;
commit;