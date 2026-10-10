import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildFrontendCallbackUrl,
  createOAuthState,
  hashPassword,
  readOAuthState,
  safeReturnTo,
  verifyPassword,
} from "../src/modules/auth/auth.service.js";
import { loginSchema, registerSchema } from "../src/modules/auth/auth.schemas.js";
import {
  createProjectSchema,
  reviewJoinRequestSchema,
  updateProjectSchema,
} from "../src/modules/projects/project.schemas.js";

describe("request validation", () => {
  it("accepts a valid email registration and normalizes identity fields", () => {
    const result = registerSchema.parse({
      displayName: " Ada Lovelace ",
      username: "Ada_Lovelace",
      email: "ADA@EXAMPLE.COM",
      password: "project123",
    });
    assert.equal(result.username, "ada_lovelace");
    assert.equal(result.email, "ada@example.com");
  });

  it("rejects weak registration passwords and invalid usernames", () => {
    assert.equal(registerSchema.safeParse({
      displayName: "Ada",
      username: "not valid!",
      email: "ada@example.com",
      password: "password",
    }).success, false);
    assert.equal(loginSchema.safeParse({ email: "not-an-email", password: "x" }).success, false);
  });

  it("hashes passwords with a unique salt and verifies them safely", async () => {
    const first = await hashPassword("project123");
    const second = await hashPassword("project123");
    assert.notEqual(first, second);
    assert.equal(await verifyPassword("project123", first), true);
    assert.equal(await verifyPassword("wrong-password", first), false);
  });
  it("accepts a valid project payload", () => {
    const result = createProjectSchema.safeParse({
      title: "Accessible Study Planner",
      summary: "A collaborative planner for student study groups.",
      description: "Build a planner with shared schedules, reminders, and accessible controls.",
      technologies: ["React", "Node.js", "PostgreSQL"],
      difficulty: "INTERMEDIATE",
      expectedDuration: "4 to 6 weeks",
      repositoryUrl: "https://gitlab.com/ada/study-planner",
      roles: [{
        name: "Backend Developer",
        skills: ["Node.js", "PostgreSQL"],
        description: "Build the API and database queries.",
      }],
    });
    assert.equal(result.success, true);
  });

  it("validates owner project updates and application decisions", () => {
    assert.equal(updateProjectSchema.safeParse({
      status: "IN_PROGRESS",
      repositoryUrl: "https://gitlab.com/projecttrix/web-app",
    }).success, true);
    assert.equal(updateProjectSchema.safeParse({
      repositoryUrl: "https://github.com/projecttrix/web-app",
    }).success, false);
    assert.equal(reviewJoinRequestSchema.safeParse({ status: "ACCEPTED" }).success, true);
    assert.equal(reviewJoinRequestSchema.safeParse({ status: "INTERVIEW" }).success, true);
    assert.equal(reviewJoinRequestSchema.safeParse({ status: "PENDING" }).success, false);
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

  it("keeps a configured frontend subfolder in the OAuth callback URL", () => {
    const callback = buildFrontendCallbackUrl(
      "https://example.app.github.dev/ProjectTrix-main/",
      "/ProjectTrix-main/create-project.html",
    );
    assert.equal(
      callback.toString(),
      "https://example.app.github.dev/ProjectTrix-main/auth/callback/?returnTo=%2FProjectTrix-main%2Fcreate-project.html",
    );
  });

  it("preserves the allowed initiating frontend in the signed OAuth state", () => {
    const { state, cookieValue } = createOAuthState(
      "/StackMate-main/project-details.html?id=123",
      "http://localhost:5173/StackMate-main/",
    );
    assert.deepEqual(readOAuthState(cookieValue, state), {
      returnTo: "/StackMate-main/project-details.html?id=123",
      frontendUrl: "http://localhost:5173/StackMate-main/",
    });
  });

  it("rejects an unapproved OAuth callback frontend", () => {
    const { state, cookieValue } = createOAuthState("/projects.html", "https://malicious.example/");
    const oauthState = readOAuthState(cookieValue, state);
    assert.notEqual(oauthState?.frontendUrl, "https://malicious.example/");
  });
});
