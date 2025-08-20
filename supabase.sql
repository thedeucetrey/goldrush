-- Supabase schema for Pay Dirt MMO (high-level, safe defaults)
-- Run in Supabase SQL editor. Enable Realtime on tables noted below.

-- USERS / PROFILES
create table if not exists profiles(
  id uuid primary key default gen_random_uuid(),
  handle text unique not null check (length(handle) between 2 and 20),
  created_at timestamptz default now()
);

-- CHARACTERS
create table if not exists characters(
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references profiles(id) on delete cascade,
  name text not null,
  money numeric not null default 50,
  stamina int not null default 100,
  max_stamina int not null default 100,
  encumbrance numeric not null default 0,
  max_carry numeric not null default 100,
  pos_x int not null,
  pos_y int not null,
  created_at timestamptz default now()
);

-- SKILLS
create table if not exists skills(
  id bigserial primary key,
  character_id uuid not null references characters(id) on delete cascade,
  key text not null, -- 'prospecting','panning','excavation','trading','fitness'
  xp int not null default 0,
  unique(character_id, key)
);

-- ITEMS / INVENTORY
create table if not exists items(
  key text primary key, -- 'pan','shovel','pickaxe','rocker','sluice','mule','gold_dust'
  name text not null
);

insert into items(key,name) values
  ('pan','Pan'),('shovel','Shovel'),('pickaxe','Pickaxe'),
  ('rocker','Rocker'),('sluice','Sluice'),('mule','Pack Mule'),
  ('gold_dust','Gold Dust')
on conflict do nothing;

create table if not exists inventories(
  character_id uuid references characters(id) on delete cascade,
  item_key text references items(key),
  qty numeric not null default 0,
  primary key(character_id, item_key)
);

-- WORLD TILES (lazy materialization)
create table if not exists tiles(
  x int not null, y int not null,
  terrain text not null check (terrain in ('plains','forest','river','mountain','town')),
  gold_remaining int not null default 0,
  difficulty numeric not null default 1,
  claimed_by uuid references characters(id),
  discovered bool not null default false,
  primary key(x,y)
);
-- Enable Realtime on tiles, claims, orders after creation.

-- CLAIMS (redundant but convenient audit trail)
create table if not exists claims(
  id bigserial primary key,
  x int not null, y int not null,
  character_id uuid not null references characters(id) on delete cascade,
  filed_at timestamptz default now(),
  unique(x,y) -- enforce one claim per tile
);

-- BUSINESSES (prototype: general store only, extensible)
create table if not exists businesses(
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references characters(id) on delete cascade,
  type text not null check (type in ('general_store','assay','blacksmith','freight','saloon')),
  cash numeric not null default 0,
  created_at timestamptz default now()
);

create table if not exists business_inventory(
  business_id uuid references businesses(id) on delete cascade,
  item_key text references items(key),
  qty numeric not null default 0,
  price numeric not null default 0,
  primary key(business_id, item_key)
);

-- MARKET (simplified; you can upgrade to a true order book)
create table if not exists orders(
  id bigserial primary key,
  character_id uuid references characters(id) on delete set null,
  side text not null check (side in ('buy','sell')),
  item_key text not null references items(key),
  qty numeric not null,
  price numeric not null,
  status text not null default 'open' check (status in ('open','filled','cancelled')),
  created_at timestamptz default now()
);

create table if not exists trades(
  id bigserial primary key,
  buy_order_id bigint references orders(id),
  sell_order_id bigint references orders(id),
  item_key text not null,
  qty numeric not null,
  price numeric not null,
  traded_at timestamptz default now()
);

-- ECONOMY METRICS
create table if not exists metrics_spot(
  id bool primary key default true,
  item_key text not null default 'gold_dust',
  price numeric not null default 20,
  last_price numeric not null default 20,
  supply_pressure numeric not null default 0,
  demand_pressure numeric not null default 0,
  updated_at timestamptz default now()
);
insert into metrics_spot(id) values(true) on conflict do nothing;

-- RLS (enable on all tables with safe defaults)
alter table profiles enable row level security;
alter table characters enable row level security;
alter table skills enable row level security;
alter table inventories enable row level security;
alter table tiles enable row level security;
alter table claims enable row level security;
alter table businesses enable row level security;
alter table business_inventory enable row level security;
alter table orders enable row level security;
alter table trades enable row level security;
alter table metrics_spot enable row level security;

-- EXAMPLES (adjust to your auth setup; here we assume auth.uid() maps to profiles.id)
create policy "own profile" on profiles
  for select using ( id = auth.uid() );
create policy "manage own profile" on profiles
  for all using ( id = auth.uid() );

create policy "own characters" on characters
  for all using ( owner = auth.uid() );

create policy "skills of own character" on skills
  for all using ( character_id in (select id from characters where owner = auth.uid()) );

create policy "inv of own character" on inventories
  for all using ( character_id in (select id from characters where owner = auth.uid()) );

create policy "read tiles" on tiles
  for select using ( true );
create policy "edit tile claim" on tiles
  for update using ( claimed_by is null or claimed_by = auth.uid() );

create policy "write claims" on claims
  for all using ( character_id in (select id from characters where owner = auth.uid()) );
create policy "read claims" on claims
  for select using ( true );

create policy "own business" on businesses
  for all using ( owner in (select id from characters where owner = auth.uid()) );
create policy "own business inv" on business_inventory
  for all using ( business_id in (select id from businesses where owner in (select id from characters where owner = auth.uid())) );

create policy "read orders/trades" on orders
  for select using ( true );
create policy "write own orders" on orders
  for all using ( character_id in (select id from characters where owner = auth.uid()) );
create policy "read trades" on trades
  for select using ( true );

create policy "read spot metric" on metrics_spot for select using (true);
create policy "update spot metric" on metrics_spot for update using (auth.uid() = auth.uid()); -- tighten via RPC

-- TODO: Add RPCs for atomic market matches, tile generation, and anti-cheat checks.
