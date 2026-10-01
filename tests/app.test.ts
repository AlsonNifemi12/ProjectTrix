import assert from "node:assert/strict";
import { describe, it } from "node:test";

import request from "supertest";

import { createApp } from "../src/app.js";

describe("application routes", () => {
  const app = createApp();

  it("reports health without requiring the database", async () => {
    const response = await request(app).get("/api/v1/health");
    assert.equal(response.status, 200);
    assert.equal(response.body.data.status, "ok");
  });

  it("serves the interactive API documentation", async () => {
    const response = await request(app).get("/docs/");
    assert.equal(response.status, 200);
    assert.match(response.text, /ProjectTrix API Documentation/);
  });

  it("serves the raw OpenAPI specification", async () => {
    const response = await request(app).get("/openapi.yaml");
    assert.equal(response.status, 200);
    assert.match(response.text, /openapi: 3\.1\.0/);
  });

  it("returns the technology options", async () => {
    const response = await request(app).get("/api/v1/metadata/technologies");
    assert.equal(response.status, 200);
    assert.ok(response.body.data.includes("React"));
    assert.ok(response.body.data.includes("GitLab"));
  });

  it("uses the shared error shape for unknown routes", async () => {
    const response = await request(app).get("/api/v1/does-not-exist");
    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "ROUTE_NOT_FOUND");
  });
});
