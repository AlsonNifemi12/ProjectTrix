# ProjectTrix API

Backend API for a developer project discovery and collaboration application. The MVP supports GitLab sign in, public project discovery, project creation, profiles, technology options, and join requests.

## Technology

- Node.js and TypeScript
- Express
- PostgreSQL with SQL migrations
- Zod request validation
- GitLab OAuth 2 authorization code flow
- HttpOnly cookie sessions
- Vitest and Supertest

## Run locally

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL with `docker compose up -d`.
3. Run `npm install`.
4. Run `npm run db:migrate` and `npm run db:seed`.
5. Run `npm run dev`.

The API starts at `http://localhost:4000`. Check `GET /api/v1/health` before integrating the frontend.

## GitLab sign in

Create a GitLab OAuth application with this development callback URL:

```text
http://localhost:4000/api/v1/auth/gitlab/callback
```

Use only the `read_user` scope for this MVP. Put the Application ID and secret in `.env` as `GITLAB_CLIENT_ID` and `GITLAB_CLIENT_SECRET`. Never commit `.env` or send the client secret to the frontend.

The browser begins sign in at:

```text
GET /api/v1/auth/gitlab?returnTo=/projects
```

After authorization, the backend creates the local user, sets an HttpOnly session cookie, and redirects to the frontend `/auth/callback` route.

## Main routes

| Method | Route | Authentication | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | No | Process health check |
| GET | `/api/v1/ready` | No | Health check including PostgreSQL |
| GET | `/api/v1/auth/gitlab` | No | Start GitLab sign in |
| GET | `/api/v1/auth/me` | Yes | Current user |
| POST | `/api/v1/auth/logout` | Cookie | End session |
| GET | `/api/v1/projects` | No | Search and filter projects |
| GET | `/api/v1/projects/:id` | No | Project details |
| POST | `/api/v1/projects` | Yes | Create a project |
| POST | `/api/v1/projects/:id/join-requests` | Yes | Request an open role |
| GET | `/api/v1/users/me` | Yes | Full current-user profile |
| PATCH | `/api/v1/users/me` | Yes | Update bio or skills |
| GET | `/api/v1/metadata/technologies` | No | Allowed technologies |

Interactive Swagger documentation is available at `/docs`. The raw OpenAPI file is available at `/openapi.yaml`.

## Commands

```bash
npm run dev
npm run typecheck
npm test
npm run build
npm run db:migrate
npm run db:seed
```

## Render deployment

Create a Render PostgreSQL database and a Node web service connected to this repository.

- Build command: `npm ci && npm run build`
- Start command: `npm run start:render`
- Health check path: `/api/v1/health`

After deployment, Swagger is available at `https://YOUR-SERVICE.onrender.com/docs`.

## Deployment checklist

- Set `NODE_ENV=production`.
- Use a long random `JWT_SECRET`.
- Set the managed PostgreSQL `DATABASE_URL`.
- Set `FRONTEND_URL`, `CORS_ORIGINS`, `API_URL`, and the exact GitLab callback URL.
- When the frontend and API are on different sites, set `COOKIE_SAME_SITE=none` and use HTTPS.
- Run `npm run db:migrate` before starting the deployed API.

## Error shape

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please correct the highlighted fields.",
    "fields": {
      "title": "Title must contain at least 5 characters."
    }
  }
}
```
