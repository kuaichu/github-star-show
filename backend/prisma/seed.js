import { PrismaClient } from "@prisma/client";
import { projects } from "../src/data/projects.js";

const prisma = new PrismaClient();

async function main() {
  for (const project of projects) {
    await prisma.project.upsert({
      where: { id: project.id },
      update: {
        ...project,
        features: JSON.stringify(project.features),
        tags: JSON.stringify(project.tags)
      },
      create: {
        ...project,
        features: JSON.stringify(project.features),
        tags: JSON.stringify(project.tags)
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async error => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
