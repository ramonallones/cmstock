alter table public.orders
  add column if not exists nomor_resi text,
  add column if not exists ekspedisi text;

create index if not exists orders_nomor_resi_idx
  on public.orders (nomor_resi)
  where nomor_resi is not null;
