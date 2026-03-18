# Deployment Guide

This guide covers deploying OltraHMS to various cloud providers.

## Prerequisites

- Node.js 18+
- PostgreSQL database
- Redis (optional, for caching)
- Cloudinary account (for file storage)
- Jitsi Meet server (optional, for telemedicine)

## Environment Variables

Create a `.env` file in the `backend` directory:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/oltrahms"

# JWT (REQUIRED - must be a strong secret)
JWT_SECRET="your-super-secret-jwt-key"

# Email (SMTP)
EMAIL_USER="your-email@gmail.com"
EMAIL_PASS="your-app-password"

# Frontend URL
FRONTEND_URL="http://localhost:5173"

# Cloudinary
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_API_KEY="your-api-key"
CLOUDINARY_API_SECRET="your-secret"

# 2FA Encryption Key (32 hex characters for AES-256)
TWO_FACTOR_KEY="your-32-char-hex-key-here"

# Node Environment
NODE_ENV="development"

# Jitsi Meet (Optional - for telemedicine)
# If not set, uses meet.jit.si without authentication
JITSI_APP_ID="your-app-id"
JITSI_SECRET="your-jitsi-secret"
JITSI_URL="https://meet.yourdomain.com"

# Optional: Custom passwords for seed data
ADMIN_PASSWORD="your-admin-password"
SEED_PASSWORD="your-seed-password"
```

---

## Option 1: Railway

### Backend Deployment

1. **Create Railway Project**
   ```bash
   npm i -g @railway/cli
   railway login
   railway init
   ```

2. **Add PostgreSQL Plugin**
   ```bash
   railway add postgresql
   ```

3. **Set Environment Variables**
   ```bash
   railway variables set JWT_SECRET="your-secret"
   railway variables set EMAIL_USER="your-email"
   railway variables set EMAIL_PASS="your-app-password"
   railway variables set NODE_ENV="production"
   railway variables set FRONTEND_URL="https://your-frontend-app.railway.app"
   ```

4. **Deploy**
   ```bash
   cd backend
   npm install
   npx prisma generate
   npm run build
   railway up
   ```

### Frontend Deployment

1. **Build for Production**
   ```bash
   cd frontend
   npm install
   npm run build
   ```

2. **Deploy to Railway**
   ```bash
   railway init
   railway up
   ```

---

## Option 2: Render

### Backend Deployment

1. **Create Web Service**
   - Connect your GitHub repository
   - Set root directory to `backend`
   - Build command: `npm install && npx prisma generate && npm run build`
   - Start command: `npm start`

2. **Add PostgreSQL**
   - Create new PostgreSQL instance in Render dashboard
   - Copy connection string to `DATABASE_URL`

3. **Environment Variables**
   ```
   DATABASE_URL="postgresql://..."
   JWT_SECRET="your-secret"
   EMAIL_USER="your-email"
   EMAIL_PASS="your-app-password"
   NODE_ENV="production"
   FRONTEND_URL="https://your-frontend.onrender.com"
   ```

### Frontend Deployment

1. **Create Static Site**
   - Connect your GitHub repository
   - Set root directory to `frontend`
   - Build command: `npm install && npm run build`
   - Publish directory: `dist`

2. **Environment Variables**
   ```
   VITE_API_URL="https://your-backend.onrender.com/api"
   ```

---

## Option 3: Vercel (Frontend) + Railway/Render (Backend)

### Frontend (Vercel)

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Deploy**
   ```bash
   cd frontend
   vercel
   ```

3. **Set Environment Variable**
   - In Vercel dashboard, add: `VITE_API_URL=https://your-backend-url/api`

---

## Option 4: DigitalOcean App Platform

### Backend

1. **Create App**
   - Connect GitHub repository
   - Source directory: `backend`
   - Build command: `npm install && npx prisma generate && npm run build`
   - Run command: `npm start`

2. **Database**
   - Create managed PostgreSQL
   - Add database connection string as environment variable

### Frontend

1. **Static Site**
   - Source directory: `frontend`
   - Build command: `npm install && npm run build`
   - Output directory: `dist`

---

## Database Setup

### Running Migrations

```bash
cd backend
npx prisma migrate deploy
```

### Seeding Database

```bash
cd backend
npx prisma db seed
```

---

## Health Checks

Add a health check endpoint to your backend:

```typescript
// Add to backend/src/server.ts
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
```

Configure your cloud provider to hit `/health` for health checks.

---

## SSL/HTTPS

Most cloud providers provide free SSL certificates:

- **Railway**: Automatic with custom domain
- **Render**: Automatic with custom domain  
- **Vercel**: Automatic with custom domain
- **DigitalOcean**: Automatic with App Platform

---

## Monitoring

### Recommended Services

| Service | Purpose | Free Tier |
|---------|---------|-----------|
| Sentry | Error tracking | Yes |
| LogRocket | Session replay | Yes (limited) |
| PM2 | Process monitoring | Yes |

### Setting Up PM2

```bash
cd backend
pm2 start dist/server.js
pm2 save
pm2 startup
```

---

## Troubleshooting

### Common Issues

1. **CORS Errors**
   - Ensure `FRONTEND_URL` is set correctly in production
   - Check that `NODE_ENV=production` is set

2. **Database Connection**
   - Verify `DATABASE_URL` is correct
   - Check that database is accessible from your cloud network

3. **Static Files Not Loading**
   - Ensure frontend is built with correct API URL
   - Check that `VITE_API_URL` points to production backend

4. **Prisma Errors**
   - Run `npx prisma generate` after environment changes
   - Ensure migration was run: `npx prisma migrate deploy`

---

## Security Checklist

- [ ] Set strong `JWT_SECRET`
- [ ] Set strong `TWO_FACTOR_KEY` (32 hex characters)
- [ ] Enable rate limiting
- [ ] Configure CORS for production domain only
- [ ] Use environment variables for all secrets
- [ ] Enable database connection pooling
- [ ] Set up SSL certificate
- [ ] Configure backup for PostgreSQL
- [ ] Set up log monitoring
