-- The authority row is seeded by 0005. After that, all changes must
-- pass the UPDATE transition guard, including when recursive triggers are off.
CREATE TRIGGER platform_writer_authority_insert_guard
BEFORE INSERT ON platform_writer_authority
BEGIN SELECT RAISE(ABORT, 'writer_authority_insert_denied'); END;
