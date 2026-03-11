import { Router } from "express";
import { eq, and } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companySkills } from "@paperclipai/db";
import { assertCompanyAccess } from "./authz.js";

export function skillRoutes(db: Db) {
  const router = Router();

  // List all shared skills for a company
  router.get("/companies/:companyId/skills", async (req, res) => {
    const { companyId } = req.params;
    assertCompanyAccess(req, companyId);
    const rows = await db
      .select()
      .from(companySkills)
      .where(eq(companySkills.companyId, companyId))
      .orderBy(companySkills.name);
    res.json(rows);
  });

  // Get a single skill
  router.get("/companies/:companyId/skills/:skillId", async (req, res) => {
    const { companyId, skillId } = req.params;
    assertCompanyAccess(req, companyId);
    const [row] = await db
      .select()
      .from(companySkills)
      .where(and(eq(companySkills.id, skillId), eq(companySkills.companyId, companyId)));
    if (!row) {
      res.status(404).json({ error: "Skill not found" });
      return;
    }
    res.json(row);
  });

  // Create a skill
  router.post("/companies/:companyId/skills", async (req, res) => {
    const { companyId } = req.params;
    assertCompanyAccess(req, companyId);
    const { name, description, content, files, metadata } = req.body;
    if (!name || !content) {
      res.status(400).json({ error: "name and content are required" });
      return;
    }
    // Check uniqueness
    const [existing] = await db
      .select({ id: companySkills.id })
      .from(companySkills)
      .where(and(eq(companySkills.companyId, companyId), eq(companySkills.name, name)));
    if (existing) {
      res.status(409).json({ error: `A skill named "${name}" already exists` });
      return;
    }
    const [row] = await db
      .insert(companySkills)
      .values({
        companyId,
        name,
        description: description ?? null,
        content,
        files: files ?? {},
        metadata: metadata ?? {},
      })
      .returning();
    res.status(201).json(row);
  });

  // Update a skill
  router.patch("/companies/:companyId/skills/:skillId", async (req, res) => {
    const { companyId, skillId } = req.params;
    assertCompanyAccess(req, companyId);
    const updates: Record<string, unknown> = {};
    for (const key of ["name", "description", "content", "files", "metadata"]) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }
    updates.updatedAt = new Date();
    const [row] = await db
      .update(companySkills)
      .set(updates)
      .where(and(eq(companySkills.id, skillId), eq(companySkills.companyId, companyId)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Skill not found" });
      return;
    }
    res.json(row);
  });

  // Delete a skill
  router.delete("/companies/:companyId/skills/:skillId", async (req, res) => {
    const { companyId, skillId } = req.params;
    assertCompanyAccess(req, companyId);
    const [row] = await db
      .delete(companySkills)
      .where(and(eq(companySkills.id, skillId), eq(companySkills.companyId, companyId)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Skill not found" });
      return;
    }
    res.json({ deleted: true });
  });

  return router;
}
