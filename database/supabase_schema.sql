-- Create a table for the machine locations
create table
  public.machine_locations (
    id uuid not null default gen_random_uuid (),
    machine_id character varying not null,
    timestamp timestamp with time zone not null,
    latitude double precision not null,
    longitude double precision not null,
    status character varying null,
    raw_event_data jsonb null,
    created_at timestamp with time zone not null default now(),
    constraint machine_locations_pkey primary key (id)
  ) tablespace pg_default;

-- Create an index on machine_id and timestamp for faster map queries
create index idx_machine_locations_machine_timestamp on public.machine_locations using btree (machine_id, timestamp);
