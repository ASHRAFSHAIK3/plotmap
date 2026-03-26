# PlotMap — Land Layout Manager

Full-stack web app for creating and managing real estate plot layouts.

## Features
- Draw land boundaries (rectangle or freehand)
- Auto-fill with plots, manually reshape any plot
- Draw roads on canvas
- Team roles: Admin (create/edit) & Viewer (read-only)
- Multiple projects per team
- Save/load from PostgreSQL database
- Export layout as PNG

---

## Local Development

### 1. Backend setup

```bash
cd backend
cp .env.example .env
# Edit .env — set DATABASE_URL to your local postgres
npm install
npm run dev
```

Your `.env` should look like:
```
DATABASE_URL=postgresql://postgres:password@localhost:5432/plotmap
JWT_SECRET=any-long-random-string-here
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

Create the database:
```bash
psql -U postgres -c "CREATE DATABASE plotmap;"
```

The app auto-creates all tables on first run.

### 2. Frontend setup

```bash
cd frontend
cp .env.example .env
# .env already points to http://localhost:5173 via Vite proxy — no change needed locally
npm install
npm run dev
```

Open http://localhost:5173

---

## Deploy to Railway (Backend + DB) + Vercel (Frontend)

### Step 1 — Deploy backend to Railway

1. Go to https://railway.app and sign up/login
2. Click **New Project** → **Deploy from GitHub repo**
3. Connect your GitHub and push this repo
4. Select the `backend` folder as the root
5. Railway auto-detects Node.js and runs `npm start`

**Add PostgreSQL:**
1. In Railway project → click **+ New** → **Database** → **PostgreSQL**
2. Railway auto-sets `DATABASE_URL` in your backend service env vars

**Add remaining env vars** (Railway dashboard → your backend service → Variables):
```
JWT_SECRET=generate-a-long-random-string
NODE_ENV=production
FRONTEND_URL=https://your-app.vercel.app   ← fill after Vercel deploy
```

6. Click **Deploy** — Railway gives you a URL like `https://plotmap-backend.up.railway.app`

### Step 2 — Deploy frontend to Vercel

1. Go to https://vercel.com and sign up/login
2. Click **New Project** → import your GitHub repo
3. Set **Root Directory** to `frontend`
4. Add Environment Variable:
   ```
   VITE_API_URL=https://plotmap-backend.up.railway.app/api
   ```
5. Click **Deploy** — Vercel gives you a URL like `https://plotmap.vercel.app`

### Step 3 — Update CORS on Railway

Go back to Railway → backend service → Variables:
```
FRONTEND_URL=https://plotmap.vercel.app
```
Redeploy the backend.

---

## First Run

1. Open your Vercel URL
2. Click **Create account** → choose **Admin**
3. Create a project → start drawing!

To invite teammates:
- They register at your Vercel URL (as Viewer or Admin)
- You open a project → click **Share** → enter their email

---

## Architecture

```
frontend/          React + Vite (deployed on Vercel)
  src/
    pages/         LoginPage, RegisterPage, DashboardPage, EditorPage
    components/    CanvasEditor (the drawing canvas)
    context/       AuthContext (JWT auth state)
    utils/         api.js (axios with auth headers)

backend/           Node.js + Express (deployed on Railway)
  src/
    index.js       Express app entry
    db/init.js     PostgreSQL schema + pool
    middleware/    JWT auth, role check
    routes/
      auth.js      /api/auth — login, register, me
      projects.js  /api/projects — CRUD + save-layout + members
      plots.js     /api/plots — update single plot
      users.js     /api/users — admin user management
```

## Database Schema

- `users` — id, name, email, password_hash, role (admin/viewer)
- `projects` — id, name, description, owner_id, boundary (JSONB)
- `project_members` — project_id, user_id, role
- `roads` — id, project_id, pts (JSONB)
- `plots` — id, project_id, plot_number, pts (JSONB), area, facing, customer_name, status, price, notes
