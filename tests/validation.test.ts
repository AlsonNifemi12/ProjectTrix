import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { safeReturnTo } from "../src/modules/auth/auth.service.js";
import { createProjectSchema } from "../src/modules/projects/project.schemas.js";

describe("request validation", () => {
  it("accepts a valid project payload", () => {
    const result = createProjectSchema.safeParse({
      title: "Accessible Study Planner",
      summary: "A collaborative planner for student study groups.",
      description: "Build a planner with shared schedules, reminders, and accessible controls.",
      technologies: ["React", "Node.js", "PostgreSQL"],
      difficulty: "INTERMEDIATE",
      expectedDuration: "4 to 6 weeks",
      roles: [{
        name: "Backend Developer",
        skills: ["Node.js", "PostgreSQL"],
        description: "Build the API and database queries.",
      }],
    });
    assert.equal(result.success, true);
  });

  it("rejects invalid technologies and incomplete content", () => {
    const result = createProjectSchema.safeParse({
      title: "Test",
      summary: "Short",
      description: "Short",
      technologies: ["Unknown Framework"],
      difficulty: "EXPERT",
      roles: [],
    });
    assert.equal(result.success, false);
  });

  it("allows only local return paths after GitLab sign in", () => {
    assert.equal(safeReturnTo("/projects/123"), "/projects/123");
    assert.equal(safeReturnTo("https://malicious.example"), "/projects");
    assert.equal(safeReturnTo("//malicious.example"), "/projects");
  });
});
