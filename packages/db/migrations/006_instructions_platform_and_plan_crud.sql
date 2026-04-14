ALTER TABLE instructions
ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'universal';

ALTER TABLE instructions
DROP CONSTRAINT IF EXISTS instructions_code_lang_key;

ALTER TABLE instructions
ADD CONSTRAINT instructions_code_lang_platform_key UNIQUE (code, lang, platform);
