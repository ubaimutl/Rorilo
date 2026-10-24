import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export async function saveActiveCv(data: Prisma.CVCreateInput, client: PrismaClient = prisma) {
  return client.$transaction(async tx => {
    const cv = await tx.cV.create({
      data: { ...data, isActive: true },
      select: {
        id: true,
        originalFilename: true,
        mimeType: true,
        fileSize: true,
        extractedText: true,
        structuredData: true,
        isActive: true,
        uploadDate: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    await tx.cV.updateMany({ where: { id: { not: cv.id } }, data: { isActive: false } });
    return cv;
  });
}
