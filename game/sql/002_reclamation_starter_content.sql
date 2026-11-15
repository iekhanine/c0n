-- Project Reclamation starter catalog, configurable by Overseer after UI integration.
begin;
insert into con.game_items(id,name,category) values
('scrap','Scrap Metal','material'),('refined_metal','Refined Metal','material'),
('lumber','Lumber','material'),('electrical_parts','Electrical Components','material'),
('medical_supplies','Medical Supplies','material'),('seeds','Seeds','material'),
('food','Food Rations','consumable'),('toolkit','Tool Kit','equipment')
on conflict(id) do nothing;
insert into con.game_projects(id,location_id,title,phase,state,requirements)
values
('00000000-0000-4000-8000-000000000101','entrance','Survey the Hidden Entrance',1,'active','{"work_units":100,"scrap":50}'::jsonb),
('00000000-0000-4000-8000-000000000102','entrance','Open the Blast Doors',2,'locked','{"work_units":250,"refined_metal":100,"electrical_parts":40}'::jsonb),
('00000000-0000-4000-8000-000000000103','level_one','Secure the First Underground Level',3,'locked','{"work_units":500,"lumber":150,"refined_metal":120,"medical_supplies":60}'::jsonb)
on conflict(id) do nothing;
insert into con.game_task_templates(title,profession_id,project_id,description,completion_type,duration_minutes,character_xp,profession_xp,pay_credits,stamina_cost,status,materials,rewards,cooldown_minutes,daily_limit)
values
('Survey the Surface Perimeter','scavenger','00000000-0000-4000-8000-000000000101','Inspect the perimeter near the abandoned installation','timer',10,25,18,200,8,'published','{}','{"work_units":2}',10,5),
('Catalog Abandoned Supplies','scavenger','00000000-0000-4000-8000-000000000101','Identify salvage opportunities and report findings','timer',15,35,25,300,10,'published','{}','{"work_units":3}',15,4),
('Inspect Collapsed Passage','engineer','00000000-0000-4000-8000-000000000101','Map damaged support structures','timer',20,50,35,450,12,'published','{}','{"work_units":4}',20,3),
('Check Exposed Cabling','engineer','00000000-0000-4000-8000-000000000101','Inspect electrical damage without energizing equipment','timer',15,40,28,375,10,'published','{}','{"work_units":3}',15,4),
('Repair Surface Shelter','carpenter','00000000-0000-4000-8000-000000000101','Fix a broken shelter partition','timer',20,45,32,425,12,'published','{}','{"work_units":3}',20,3),
('Assemble Temporary Storage Crates','carpenter',null,'Construct basic storage for survey teams','timer',15,35,25,350,8,'published','{}','{"work_units":2}',15,4),
('Inspect Salvage Tools','metalworker',null,'Identify damaged cutting and welding equipment','timer',10,25,20,250,8,'published','{}','{"work_units":2}',10,5),
('Sort Recovered Scrap','metalworker','00000000-0000-4000-8000-000000000101','Classify safe reusable scrap materials','timer',15,35,25,350,10,'published','{}','{"work_units":3}',15,4),
('Stock the Surface Infirmary','medic',null,'Organize bandages and first-aid stock','timer',15,35,25,400,8,'published','{}','{"work_units":2}',15,4),
('Establish Triage Station','medic','00000000-0000-4000-8000-000000000101','Prepare a triage post for expedition teams','timer',20,50,35,500,10,'published','{}','{"work_units":3}',20,3),
('Survey Soil Conditions','farmer',null,'Assess soil near the settlement for food production','timer',15,35,25,350,8,'published','{}','{"work_units":2}',15,4),
('Maintain Food Storage','farmer',null,'Inspect and organize shared food supplies','timer',15,35,25,350,8,'published','{}','{"work_units":2}',15,4),
('Blast Door Circuit Diagnosis','engineer','00000000-0000-4000-8000-000000000102','Investigate sealed entry control circuit','dm_approval',30,90,65,850,15,'draft','{}','{"work_units":5}',60,2),
('Recover Sealed Entrance Blueprints','scavenger','00000000-0000-4000-8000-000000000102','An exploration adventure requiring a DM','dice',45,120,80,1000,20,'draft','{}','{"work_units":6}',120,1),
('Fabricate Door Brackets','metalworker','00000000-0000-4000-8000-000000000102','Requires refined metal and workshop facilities','timer',30,75,55,700,15,'draft','{"refined_metal":2}','{"work_units":4}',30,3),
('Reinforce Access Corridor','carpenter','00000000-0000-4000-8000-000000000103','Requires lumber and structural access','collaborative',60,130,95,1200,20,'draft','{"lumber":4}','{"work_units":8}',120,2),
('Prepare Emergency Medical Kits','medic','00000000-0000-4000-8000-000000000103','Requires secure medical supplies','timer',25,60,45,600,12,'draft','{"medical_supplies":2}','{"work_units":3}',30,3),
('Start a Surface Greenhouse','farmer',null,'A long-term agricultural community project','collaborative',90,180,120,1600,25,'draft','{"lumber":5,"seeds":2}','{"work_units":10}',180,1)
on conflict do nothing;
commit;