# ProjectTrix API

Backend API for a developer project discovery and collaboration application. The MVP supports email/password accounts, GitLab sign in, public project discovery, project creation, profiles, role applications, owner review, accepted teams, project lifecycle updates, and optional GitLab repository links.

## Technology

- Node.js and TypeScript
- Express
- PostgreSQL with SQL migrations
- Zod request validation
- Salted scrypt password hashing
- GitLab OAuth 2 authorization code flow
- HttpOnly cookie sessions
- Node test runner and Supertest

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

## Email and password accounts

Native accounts use `POST /api/v1/auth/register` and `POST /api/v1/auth/login`. Passwords are salted and hashed with scrypt before storage. Both native and GitLab accounts receive the same HttpOnly application session cookie.

## Main routes

| Method | Route | Authentication | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | No | Process health check |
| GET | `/api/v1/ready` | No | Health check including PostgreSQL |
| GET | `/api/v1/auth/gitlab` | No | Start GitLab sign in |
| POST | `/api/v1/auth/register` | No | Create an email/password account |
| POST | `/api/v1/auth/login` | No | Sign in with email and password |
| GET | `/api/v1/auth/me` | Yes | Current user |
| POST | `/api/v1/auth/logout` | Cookie | End session |
| GET | `/api/v1/projects` | No | Search and filter projects |
| GET | `/api/v1/projects/:id` | No | Project details |
| POST | `/api/v1/projects` | Yes | Create a project |
| PATCH | `/api/v1/projects/:id` | Owner | Update project status or GitLab repository |
| POST | `/api/v1/projects/:id/join-requests` | Yes | Request an open role |
| GET | `/api/v1/projects/:id/join-requests` | Owner | Review the project's applications |
| PATCH | `/api/v1/projects/:id/join-requests/:requestId` | Owner | Accept or reject an application |
| GET | `/api/v1/users/me` | Yes | Full current-user profile |
| GET | `/api/v1/users/me/applications` | Yes | Track the current user's applications |
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

The Render start command runs every pending SQL migration automatically. Migration `003_collaboration_workflow.sql` adds the GitLab repository field and the durable accepted-member records required by the collaboration dashboard.

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
