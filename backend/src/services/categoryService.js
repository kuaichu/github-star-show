import { getPrisma } from "../lib/prisma.js";
import { CATEGORY_LABELS } from "../config/classificationRules.js";

const DEFAULT_CATEGORY_NAMES = Object.values(CATEGORY_LABELS).filter(
  label => label !== CATEGORY_LABELS.uncategorized
);

export async function seedDefaultCategories(userId) {
  const prisma = getPrisma();
  if (!prisma) return [];

  const seeded = [];
  for (const name of DEFAULT_CATEGORY_NAMES) {
    try {
      const cat = await prisma.managedCategory.create({
        data: { userId, name }
      });
      seeded.push(cat);
    } catch (err) {
      if (err.code !== "P2002") {
        throw err;
      }
    }
  }
  return seeded;
}

export async function listManagedCategories(userId) {
  const prisma = getPrisma();
  if (!prisma) return [];

  try {
    const cats = await prisma.managedCategory.findMany({
      where: { userId },
      orderBy: { name: "asc" }
    });
    if (cats.length === 0 && userId) {
      return await seedDefaultCategories(userId);
    }
    return cats;
  } catch {
    return [];
  }
}

export async function createManagedCategory(userId, name) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("Database not available");

  const trimmed = String(name || "").trim();
  if (!trimmed) throw new Error("Category name is required");

  try {
    return await prisma.managedCategory.create({
      data: { userId, name: trimmed }
    });
  } catch (err) {
    if (err.code === "P2002") {
      throw new Error(`Category "${trimmed}" already exists`);
    }
    throw err;
  }
}

export async function renameManagedCategory(userId, oldName, newName) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("Database not available");

  const trimmedNew = String(newName || "").trim();
  if (!trimmedNew) throw new Error("New category name is required");

  const category = await prisma.managedCategory.findFirst({
    where: { userId, name: oldName }
  });

  if (!category) {
    throw new Error(`Category "${oldName}" not found`);
  }

  try {
    await prisma.managedCategory.update({
      where: { id: category.id },
      data: { name: trimmedNew }
    });
  } catch (err) {
    if (err.code === "P2002") {
      throw new Error(`Category "${trimmedNew}" already exists`);
    }
    throw err;
  }

  await prisma.project.updateMany({
    where: { category: oldName },
    data: { category: trimmedNew }
  });

  await prisma.userProject.updateMany({
    where: { category: oldName },
    data: { category: trimmedNew }
  });

  return { oldName, newName: trimmedNew };
}

export async function deleteManagedCategory(userId, name) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("Database not available");

  const category = await prisma.managedCategory.findFirst({
    where: { userId, name }
  });

  if (!category) {
    throw new Error(`Category "${name}" not found`);
  }

  await prisma.managedCategory.delete({
    where: { id: category.id }
  });

  const uncategorizedLabel = CATEGORY_LABELS.uncategorized || "未分类 / 待整理";

  await prisma.project.updateMany({
    where: { category: name },
    data: { category: uncategorizedLabel, categorySource: "uncategorized", categoryReason: "uncategorized:category-deleted" }
  });

  await prisma.userProject.updateMany({
    where: { category: name },
    data: { category: uncategorizedLabel, categorySource: "uncategorized", categoryReason: "uncategorized:category-deleted" }
  });

  return { deleted: name, projectsReassigned: true };
}

export async function getAllCategories(userId) {
  if (!userId) {
    return DEFAULT_CATEGORY_NAMES;
  }

  const managed = await listManagedCategories(userId);
  return managed.map(c => c.name);
}
