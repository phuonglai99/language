-- The "Mistake" folder is a system folder (quiz mistakes are saved there); the old app
-- created it on first use. Seeding it here keeps a freshly built DB usable.
INSERT OR IGNORE INTO note_folders (id, name, is_system) VALUES ('mistake', 'Mistake', 1);
