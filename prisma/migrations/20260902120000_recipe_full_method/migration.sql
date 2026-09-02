-- A method you can cook from, alongside the terse summary already held in
-- "method". Empty string means "not written yet": it is filled in the first time
-- a cook is opened, and kept from then on, so a dish costs one API call ever.
--
-- Additive and defaulted, so every existing recipe is immediately valid and the
-- old terse method keeps showing until each dish is opened for the first time.
-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "methodFullJson" TEXT NOT NULL DEFAULT '';
