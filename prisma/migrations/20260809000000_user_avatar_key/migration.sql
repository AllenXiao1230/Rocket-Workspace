-- Store the private MinIO object key for a user's uploaded profile photo.
ALTER TABLE "User" ADD COLUMN "avatarKey" TEXT;
