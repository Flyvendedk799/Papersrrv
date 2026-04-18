# Deployment & Infrastructure

## Overview

This document outlines the deployment architecture, infrastructure components, CI/CD pipeline, monitoring, and operational procedures for the DinGaming platform.

---

## Infrastructure Architecture

### Cloud Services Stack

```
┌─────────────────────────────────────────────────────────┐
│                    Production Environment                │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Frontend   │  │   Backend    │  │     CDN      │  │
│  │              │  │              │  │              │  │
│  │  Static Web  │  │  Supabase    │  │ Cloudflare   │  │
│  │   Hosting    │  │  - Database  │  │      R2      │  │
│  │              │  │  - Auth API  │  │              │  │
│  │  - Vite SPA  │  │  - REST API  │  │  - Images    │  │
│  │  - React     │  │              │  │  - Assets    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Analytics   │  │   Payments   │  │    Email     │  │
│  │              │  │              │  │              │  │
│  │    Flock     │  │  MobilePay   │  │   Provider   │  │
│  │  /~api/...   │  │   PayPal     │  │   (SMTP)     │  │
│  │              │  │   Stripe     │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Hosting & Deployment

### 1. Frontend Hosting

#### Static Web Hosting

**Provider**: Standard web hosting (likely Netlify, Vercel, or traditional hosting)

**Build Process**:
```bash
# Install dependencies
npm install

# Build production bundle
npm run build
# Output: dist/ directory with optimized static files

# Deploy
# Option A: Netlify
netlify deploy --prod --dir=dist

# Option B: Vercel
vercel --prod

# Option C: Traditional hosting
rsync -avz dist/ user@server:/var/www/dingaming.dk/
```

**Build Configuration**:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

**Vite Build Output**:
- Minified JavaScript bundles
- Code splitting by route
- Optimized CSS
- Asset fingerprinting (cache busting)
- Source maps for debugging

#### Deployment Environments

| Environment | URL | Purpose | Deploy Trigger |
|-------------|-----|---------|----------------|
| Production | https://dingaming.dk | Live site | Main branch merge |
| Staging | https://staging.dingaming.dk | Pre-production testing | Develop branch push |
| Preview | https://preview-[pr-id].dingaming.dk | PR reviews | Pull request creation |

---

### 2. Backend Infrastructure (Supabase)

#### Supabase Configuration

**Project**: DinGaming Production
**Region**: EU Central (for GDPR compliance)
**Plan**: Pro or higher (for production workloads)

**Components**:
1. **PostgreSQL Database**
   - Version: 15.x
   - Connection pooling enabled
   - Auto-scaling enabled
   - Daily backups

2. **Authentication Service**
   - Email/password provider enabled
   - Session management
   - JWT token issuance
   - Rate limiting configured

3. **REST API**
   - Auto-generated from database schema
   - Row-level security (RLS) enabled
   - API rate limiting

4. **Storage** (optional for future use)
   - User avatars
   - Product images (currently on R2)

#### Environment Variables

```bash
# Frontend (.env.production)
VITE_SUPABASE_URL=https://[project-id].supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_ANALYTICS_ENDPOINT=/~api/analytics
VITE_R2_CDN_URL=https://r2.dingaming.dk

# Backend (Supabase Dashboard)
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[project-id].supabase.co:5432/postgres
JWT_SECRET=[auto-generated]
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=[sendgrid-user]
SMTP_PASS=[sendgrid-password]
```

---

### 3. CDN & Asset Delivery (Cloudflare R2)

#### Configuration

**Bucket**: `dingaming-assets`
**Region**: Auto (Cloudflare's global network)
**Access**: Public read, authenticated write

**Directory Structure**:
```
r2.dingaming.dk/
├── products/
│   ├── [product-slug].jpg (main images)
│   └── thumbs/
│       └── [product-slug].jpg (thumbnails)
├── platform-icons/
│   ├── steam.svg
│   ├── playstation.svg
│   ├── xbox.svg
│   └── nintendo.svg
└── static/
    ├── logo.svg
    └── favicon.ico
```

**Upload Process**:
```bash
# Using Wrangler CLI
wrangler r2 object put dingaming-assets/products/fifa-24.jpg --file=./fifa-24.jpg

# Batch upload
for file in ./products/*.jpg; do
  wrangler r2 object put dingaming-assets/products/$(basename $file) --file=$file
done
```

**Cache Configuration**:
- Cache-Control: `public, max-age=31536000` (1 year for versioned assets)
- Immutable assets (fingerprinted): `immutable` flag
- CDN edge caching enabled globally

---

## CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}

      - name: Deploy to Production
        if: github.ref == 'refs/heads/main'
        run: |
          npm run deploy:prod
        env:
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_TOKEN }}
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}

  database:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v3

      - name: Run database migrations
        run: |
          npx supabase db push
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
```

### Deployment Steps

1. **Code Push**: Developer pushes to `main` branch
2. **Build Trigger**: GitHub Actions workflow triggered
3. **Install Dependencies**: `npm ci` for reproducible builds
4. **Run Tests**: Unit and integration tests
5. **Build Production Bundle**: `npm run build`
6. **Deploy Frontend**: Static files to hosting provider
7. **Database Migrations**: Apply schema changes (if any)
8. **Smoke Tests**: Verify deployment health
9. **Notify Team**: Slack/Discord notification of deployment status

---

## Database Management

### Migrations

**Tool**: Supabase CLI or raw SQL migrations

```bash
# Create migration
supabase migration new add_casino_stats_view

# Edit migration file
# supabase/migrations/[timestamp]_add_casino_stats_view.sql

# Apply migration (local)
supabase db push

# Apply migration (production)
supabase db push --db-url $PRODUCTION_DB_URL
```

### Backup Strategy

**Automated Backups**:
- **Frequency**: Daily at 02:00 UTC
- **Retention**: 30 days
- **Storage**: Supabase built-in backup
- **Point-in-Time Recovery**: Available (7-day window)

**Manual Backups**:
```bash
# Backup entire database
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Backup specific tables
pg_dump $DATABASE_URL -t profiles -t orders > critical_tables.sql

# Restore
psql $DATABASE_URL < backup_20240314.sql
```

---

## Monitoring & Observability

### 1. Application Monitoring

#### Flock Analytics
- **Page views**: Track user navigation
- **Custom events**: Purchase completion, signup, login
- **Session tracking**: User session duration and paths
- **Privacy-focused**: GDPR compliant, no PII collection

**Key Metrics**:
- Daily active users (DAU)
- Conversion rate (visitor → purchase)
- Average order value
- Cart abandonment rate

#### Error Tracking

**Tool**: Sentry or similar

```javascript
// Frontend error tracking
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "https://[key]@sentry.io/[project-id]",
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.1,
});
```

**Tracked Errors**:
- JavaScript exceptions
- API request failures
- Payment errors
- Authentication failures

---

### 2. Infrastructure Monitoring

#### Supabase Dashboard
- Database CPU and memory usage
- API request rate and latency
- Connection pool status
- Query performance insights

#### Uptime Monitoring

**Tool**: UptimeRobot, Pingdom, or similar

**Endpoints Monitored**:
- `https://dingaming.dk/` (every 5 minutes)
- `https://dingaming.dk/health` (API health check)
- Supabase API endpoint

**Alerts**:
- Slack notification on downtime
- Email to on-call engineer
- SMS for critical outages

---

### 3. Performance Monitoring

#### Core Web Vitals

**Metrics Tracked**:
- **LCP (Largest Contentful Paint)**: Target < 2.5s
- **FID (First Input Delay)**: Target < 100ms
- **CLS (Cumulative Layout Shift)**: Target < 0.1

**Tools**:
- Google Analytics
- Lighthouse CI in GitHub Actions
- Real User Monitoring (RUM)

#### Database Performance

**Query Optimization**:
- Slow query log enabled (queries > 1s)
- Index usage analysis
- Connection pool monitoring

```sql
-- Find slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0;
```

---

## Security & Compliance

### 1. SSL/TLS Configuration

- **Certificate**: Let's Encrypt (auto-renewal)
- **Protocol**: TLS 1.2+ only
- **HSTS**: Enabled with 1-year max-age
- **Certificate Transparency**: Enabled

### 2. Secrets Management

**GitHub Secrets** (for CI/CD):
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY` (backend only)
- `NETLIFY_TOKEN`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

**Environment Variables** (runtime):
- Never commit to git
- Stored in hosting provider dashboard
- Rotated quarterly

### 3. GDPR Compliance

**Data Protection**:
- User data stored in EU region
- Right to access: API endpoint for user data export
- Right to deletion: User account deletion function
- Cookie consent banner
- Privacy policy and terms of service

### 4. Payment Security

- **PCI DSS**: Compliant through payment providers
- **No card storage**: Tokenized payments only
- **Secure redirects**: HTTPS for all payment flows
- **Fraud detection**: Provider-level fraud screening

---

## Scaling Strategy

### Horizontal Scaling

**Frontend**:
- Static assets: Automatically scaled via CDN
- Edge caching reduces origin requests
- Cloudflare's global network

**Backend (Supabase)**:
- Auto-scaling database instances
- Read replicas for high-read workloads
- Connection pooling (PgBouncer)

### Vertical Scaling

**Database**:
- Current: 2 vCPU, 4GB RAM
- Scale up: 4 vCPU, 8GB RAM (if needed)
- Max: 16 vCPU, 64GB RAM

### Caching Strategy

**Application-Level Caching**:
```javascript
// Cache product catalog (5 minutes)
const cachedProducts = await cache.get('products:all');
if (!cachedProducts) {
  const products = await supabase.from('products').select('*');
  await cache.set('products:all', products, 300);
}
```

**Database-Level Caching**:
- Materialized views for aggregated data
- Query result caching in Supabase

---

## Disaster Recovery

### Recovery Time Objective (RTO)
- **Target**: 4 hours
- **Maximum acceptable downtime**: 4 hours

### Recovery Point Objective (RPO)
- **Target**: 1 hour
- **Maximum acceptable data loss**: 1 hour of transactions

### Disaster Recovery Plan

1. **Database Failure**:
   - Supabase auto-failover to standby
   - Manual failover: Switch to latest backup (30min)

2. **Frontend Hosting Failure**:
   - DNS switch to backup hosting provider
   - Re-deploy from git (15min)

3. **Payment Provider Outage**:
   - Fallback to alternative payment method
   - Display maintenance notice

4. **Complete Outage**:
   - Activate backup infrastructure
   - Restore from latest backup
   - Verify data integrity
   - Resume operations

### Runbook: Database Restore

```bash
# 1. Stop application (prevent new writes)
# Update DNS to maintenance page

# 2. Identify backup to restore
supabase db backups list

# 3. Restore backup
supabase db restore --backup-id [backup-id]

# 4. Verify data integrity
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM orders;"

# 5. Resume application
# Update DNS back to production

# 6. Monitor for issues
tail -f logs/application.log
```

---

## Operational Procedures

### Deployment Checklist

- [ ] Run tests locally: `npm test`
- [ ] Build passes: `npm run build`
- [ ] Database migrations prepared (if needed)
- [ ] Environment variables updated
- [ ] Staging deployment successful
- [ ] Smoke tests passed
- [ ] Team notified of deployment
- [ ] Rollback plan ready
- [ ] Deploy to production
- [ ] Monitor logs for errors
- [ ] Verify key flows (login, purchase)
- [ ] Update deployment log

### Rollback Procedure

```bash
# Option 1: Revert to previous deployment (hosting provider)
netlify rollback

# Option 2: Revert git commit and redeploy
git revert HEAD
git push origin main
# CI/CD will auto-deploy

# Option 3: Database migration rollback
supabase db reset --version [previous-version]
```

### On-Call Rotation

**Schedule**: 24/7 coverage with weekly rotation
**Primary Contact**: Engineering lead
**Escalation**: CTO after 30 minutes

**Common Issues**:
1. Payment gateway timeout → Check provider status page
2. High error rate → Check Sentry dashboard
3. Database slow → Check connection pool, analyze queries
4. Site down → Check hosting provider status, verify DNS

---

## Cost Optimization

### Current Monthly Costs (Estimate)

| Service | Plan | Monthly Cost |
|---------|------|--------------|
| Supabase | Pro | $25 |
| Cloudflare R2 | Pay-as-you-go | $5-10 |
| Hosting (Netlify/Vercel) | Pro | $20 |
| Flock Analytics | Startup | $0-15 |
| Domain & SSL | - | $2 |
| **Total** | | **~$52-72** |

### Optimization Strategies

1. **Image Optimization**:
   - Compress images before upload
   - Use WebP format
   - Lazy loading for below-fold images

2. **Database Query Optimization**:
   - Add indexes for frequently queried columns
   - Use materialized views for complex aggregations
   - Limit query results with pagination

3. **CDN Caching**:
   - Maximize cache hit ratio
   - Long cache TTLs for static assets
   - Stale-while-revalidate for API responses

---

## Future Infrastructure Enhancements

### Planned Improvements

1. **Redis Caching Layer**:
   - Cache product catalog
   - Session storage
   - Rate limiting

2. **GraphQL API**:
   - Replace REST with GraphQL
   - Reduce over-fetching
   - Better client flexibility

3. **Microservices Architecture**:
   - Separate casino games into service
   - Dedicated payment service
   - Email service decoupled

4. **Advanced Monitoring**:
   - Distributed tracing (OpenTelemetry)
   - APM (Application Performance Monitoring)
   - Custom dashboards (Grafana)

5. **CI/CD Enhancements**:
   - Automated E2E tests
   - Visual regression testing
   - Canary deployments

---

## Summary

DinGaming's infrastructure is designed for:
- **Reliability**: 99.9% uptime target with automated failover
- **Scalability**: Auto-scaling backend and global CDN
- **Security**: GDPR compliance, SSL/TLS, secure payments
- **Performance**: < 2s page load, optimized database queries
- **Cost-efficiency**: ~$60/month operational costs

The deployment pipeline ensures rapid iteration with minimal downtime and comprehensive monitoring enables proactive issue resolution.
