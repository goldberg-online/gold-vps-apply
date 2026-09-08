alter table service_collections add column if not exists receipt_no text;

update service_collections
set receipt_no = 'DIS-SVC-' || upper(substr(replace(id, '-', ''), 1, 11))
where receipt_no is null or btrim(receipt_no) = '';

create unique index if not exists service_collections_receipt_no_key
  on service_collections (receipt_no);
