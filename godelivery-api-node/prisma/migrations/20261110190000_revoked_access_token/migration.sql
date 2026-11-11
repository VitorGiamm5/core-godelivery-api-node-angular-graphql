CREATE TABLE "RevokedAccessToken" (
    "jti" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RevokedAccessToken_pkey" PRIMARY KEY ("jti")
);

CREATE INDEX "RevokedAccessToken_expiresAt_idx" ON "RevokedAccessToken"("expiresAt");
