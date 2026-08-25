ALTER TABLE settings ADD COLUMN IF NOT EXISTS printer_name text DEFAULT 'Default Printer';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS printer_type text DEFAULT 'thermal';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS printer_paper_width text DEFAULT '80mm';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS printer_interface text DEFAULT 'browser';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS auto_print_receipt boolean DEFAULT true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS auto_print_kitchen boolean DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS print_copies integer DEFAULT 1;
