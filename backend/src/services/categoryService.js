import { Prisma } from "@prisma/client";
import { getPrisma } from "../lib/prisma.js";
import { PublicHttpError } from "../lib/publicHttpError.js";
import { CATEGORY_LABELS } from "../config/classificationRules.js";

const DEFAULT_CATEGORY_NAMES = Object.values(CATEGORY_LABELS).filter(
  label => label !== CATEGORY_LABELS.uncategorized
);

function requireUserId(userId) {
  const value = Number(userId);
  if (!Number.isInteger(value) || value <= 0) {
    throw new PublicHttpError("INVALID_USER_ID", 400, "A positive userId is required");
  }
  return value;
}

function requireCategoryName(name, message = "Category name is required") {
  const value = String(name ?? "").trim();
  if (!value) throw new PublicHttpError("INVALID_CATEGORY_NAME", 400, message);
  return value;
}

function isUniqueConstraintError(error) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function seedDefaultCategories(userId) {
  userId = requireUserId(userId);
  const prisma = getPrisma();
  if (!prisma) throw new Error("Database not available");

  const seeded = [];
  for (const name of DEFAULT_CATEGORY_NAMES) {
    try {
      const cat = await prisma.managedCategory.create({
        data: { userId, name }
      });
      seeded.push(cat);
    } catch (err) {
      if (!isUniqueConstraintError(err)) {
        throw err;
      }
    }
  }
  return seeded;
}

export async function listManagedCategories(userId) {
  userId = requireUserId(userId);
  const prisma = getPrisma();
  if (!prisma) throw new Error("Database not available");

  const cats = await prisma.managedCategory.findMany({
    where: { userId },
    orderBy: { name: "asc" }
  });
  if (cats.length === 0) {
    return seedDefaultCategories(userId);
  }
  return cats;
}

export async function createManagedCategory(userId, name) {
  userId = requireUserId(userId);
  const prisma = getPrisma();
  if (!prisma) throw new Error("Database not available");

  const trimmed = requireCategoryName(name);

  try {
    return await prisma.managedCategory.create({
      data: { userId, name: trimmed }
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new PublicHttpError("CATEGORY_ALREADY_EXISTS", 400, `Category "${trimmed}" already exists`);
    }
    throw err;
  }
}

export async function renameManagedCategory(userId, oldName, newName) {
  userId = requireUserId(userId);
  const prisma = getPrisma();
  if (!prisma) throw new Error("Database not available");

  const trimmedOld = requireCategoryName(oldName);
  const trimmedNew = requireCategoryName(newName, "New category name is required");

  try {
    await prisma.$transaction(async tx => {
      const category = await tx.managedCategory.findFirst({
        where: { userId, name: trimmedOld }
      });

      if (!category) {
        throw new PublicHttpError("CATEGORY_NOT_FOUND", 400, `Category "${trimmedOld}" not found`);
      }

      await tx.managedCategory.update({
        where: { id: category.id },
        data: { name: trimmedNew }
      });

      await tx.userProject.updateMany({
        where: { userId, category: trimmedOld },
        data: { category: trimmedNew }
      });
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new PublicHttpError("CATEGORY_ALREADY_EXISTS", 400, `Category "${trimmedNew}" already exists`);
    }
    throw err;
  }

  return { oldName: trimmedOld, newName: trimmedNew };
}

export async function deleteManagedCategory(userId, name) {
  userId = requireUserId(userId);
  const prisma = getPrisma();
  if (!prisma) throw new Error("Database not available");
  const trimmedName = requireCategoryName(name);

  const uncategorizedLabel = CATEGORY_LABELS.uncategorized || "未分类 / 待整理";

  await prisma.$transaction(async tx => {
    const category = await tx.managedCategory.findFirst({
      where: { userId, name: trimmedName }
    });

    if (!category) {
      throw new PublicHttpError("CATEGORY_NOT_FOUND", 400, `Category "${trimmedName}" not found`);
    }

    await tx.managedCategory.delete({
      where: { id: category.id }
    });

    await tx.userProject.updateMany({
      where: { userId, category: trimmedName },
      data: {
        category: uncategorizedLabel,
        categorySource: "uncategorized",
        categoryReason: "uncategorized:category-deleted"
      }
    });
  });

  return { deleted: trimmedName, projectsReassigned: true };
}

export async function getAllCategories(userId) {
  if (!userId) {
    return DEFAULT_CATEGORY_NAMES;
  }

  const managed = await listManagedCategories(requireUserId(userId));
  return managed.map(c => c.name);
}
