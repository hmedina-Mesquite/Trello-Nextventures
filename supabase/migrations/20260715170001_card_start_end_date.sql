-- T070: cards need to represent either a plain deadline (a single date, no
-- specific end) or a real meeting (a start and end time), not just one
-- bare due_date. Renaming due_date -> start_date to match its new meaning
-- as "the date/time this card starts", plus a new nullable end_date --
-- null keeps the exact old single-date behavior; set makes it a timed event
-- for calendar/Google Calendar sync purposes.
alter table cards rename column due_date to start_date;
alter table cards add column end_date timestamptz;
