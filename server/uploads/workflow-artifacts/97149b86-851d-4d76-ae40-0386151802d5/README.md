# DinGaming Technical Documentation

**Generated**: March 14, 2026
**Project**: DinGaming - Danish Digital Game Keys Marketplace
**URL**: https://dingaming.dk/

---

## Documentation Overview

This technical documentation provides comprehensive coverage of the DinGaming platform architecture, APIs, data models, user flows, and deployment infrastructure.

### Document Structure

1. **[Architecture Overview](./01-architecture-overview.md)**
   - Technology stack (React, Vite, Supabase)
   - System components and layers
   - Security architecture
   - Scalability strategy
   - Service level objectives

2. **[Authentication System](./02-authentication-system.md)**
   - Supabase Auth integration
   - User registration and login flows
   - Password reset functionality
   - Session management
   - Protected routes
   - Security considerations

3. **[API Endpoints & Integration](./03-api-endpoints.md)**
   - Supabase REST API endpoints
   - Authentication API
   - Database operations (products, orders, profiles)
   - Payment integration (MobilePay, PayPal, Card)
   - Analytics API (Flock)
   - Error handling and rate limits

4. **[Data Models & Database Schema](./04-data-models.md)**
   - Entity relationship diagram
   - Core tables (users, profiles, products, orders)
   - Shards transaction system
   - Casino games data model
   - Database functions and triggers
   - Row-level security (RLS)
   - Backup and retention policies

5. **[User Flows & Features](./05-user-flows.md)**
   - Authentication flows (signup, login, password reset)
   - Shopping and purchase flow
   - Customer Club features
   - Shards rewards system
   - Casino games (Blackjack, Roulette, Dice, Hi-Lo, Lines, Mines)
   - Support flow
   - Navigation structure

6. **[Deployment & Infrastructure](./06-deployment-infrastructure.md)**
   - Cloud infrastructure architecture
   - Frontend hosting (Vite static build)
   - Backend infrastructure (Supabase)
   - CDN & asset delivery (Cloudflare R2)
   - CI/CD pipeline (GitHub Actions)
   - Database management and migrations
   - Monitoring and observability
   - Security and compliance (GDPR, PCI DSS)
   - Disaster recovery procedures

---

## Quick Start

### For Developers

1. **Read Architecture Overview** to understand the tech stack
2. **Review API Endpoints** for backend integration
3. **Study Data Models** to understand the database schema
4. **Check Deployment Guide** for infrastructure setup

### For Product Managers

1. **User Flows** document for feature understanding
2. **Architecture Overview** for technical capabilities
3. **Authentication System** for security overview

### For DevOps/SRE

1. **Deployment & Infrastructure** for operational procedures
2. **Monitoring** section in deployment docs
3. **Disaster Recovery** procedures

---

## Key Features

### E-Commerce Platform
- Multi-platform game key marketplace (Steam, PlayStation, Xbox, Nintendo)
- Instant delivery via email (30-second SLA)
- Multiple payment methods (MobilePay, Card, PayPal)
- Daily deals with up to 70% discounts

### Customer Loyalty Program
- **Shards Rewards**: Virtual currency system
- 500 Shards welcome bonus
- 1% cashback on all purchases
- Daily login bonuses (10-50 Shards based on streak)
- Loyalty tiers (Bronze, Silver, Gold, Platinum)

### Gamification
- **Club Games**: Reward-based gaming
- **Club Cases**: Loot box mechanics
- **Club Casino**: Six casino games
  - Blackjack
  - Roulette
  - Dice
  - Hi-Lo
  - Lines
  - Mines

---

## Technology Stack Summary

| Component | Technology |
|-----------|------------|
| Frontend | React + Vite |
| Routing | Client-side SPA |
| Backend | Supabase (PostgreSQL) |
| Authentication | Supabase Auth (Email/Password) |
| Static Hosting | Web Hosting |
| CDN | Cloudflare R2 |
| Analytics | Flock (GDPR-compliant) |
| Payments | MobilePay, PayPal, Stripe |
| PWA | Enabled |
| Locale | Danish (da) |

---

## API Base URLs

| Service | URL |
|---------|-----|
| Production Site | https://dingaming.dk |
| Supabase API | https://[project-id].supabase.co |
| Supabase Auth | https://[project-id].supabase.co/auth/v1 |
| Analytics | /~api/analytics (proxied) |
| CDN Assets | https://r2.dingaming.dk |

---

## Database Schema Overview

**Core Tables**:
- `auth.users` - User credentials (managed by Supabase Auth)
- `profiles` - Extended user information
- `products` - Game catalog
- `orders` - Purchase transactions
- `order_items` - Line items for orders
- `shards_transactions` - Loyalty points ledger
- `casino_games` - Casino game history
- `support_tickets` - Customer support requests

**Key Relationships**:
- Users (1:1) Profiles
- Users (1:N) Orders
- Orders (1:N) Order Items
- Products (1:N) Order Items
- Users (1:N) Shards Transactions
- Users (1:N) Casino Games

---

## Deployment Environments

| Environment | URL | Purpose |
|-------------|-----|---------|
| Production | https://dingaming.dk | Live site |
| Staging | https://staging.dingaming.dk | Pre-production testing |
| Preview | https://preview-[pr-id].dingaming.dk | PR reviews |

---

## Support & Contact

- **Support Email**: support@dingaming.dk
- **Response SLA**: Within 24 hours
- **Uptime Target**: 99.9%

---

## Metrics & Performance

### Key Performance Indicators (KPIs)
- **Delivery Time**: < 30 seconds (game keys)
- **Page Load**: < 2 seconds
- **Uptime**: 99.9% target
- **Customer Rating**: 4.9/5 (Trustpilot)
- **User Base**: 50,000+ customers

### Core Web Vitals Targets
- **LCP** (Largest Contentful Paint): < 2.5s
- **FID** (First Input Delay): < 100ms
- **CLS** (Cumulative Layout Shift): < 0.1

---

## Security & Compliance

- **GDPR Compliant**: EU data residency
- **PCI DSS**: Through payment providers
- **HTTPS**: SSL/TLS 1.2+ only
- **Authentication**: Supabase Auth with JWT
- **Data Protection**: Row-level security (RLS)

---

## Documentation Maintenance

This documentation is generated from:
- Project analysis of https://dingaming.dk/
- Captured user flows and screenshots
- Technical infrastructure analysis
- Best practices and industry standards

**Last Updated**: March 14, 2026
**Generated By**: Paperclip Tech Docs Generator (Visual Project Documenter)

---

## Additional Resources

- **Supabase Documentation**: https://supabase.com/docs
- **React Documentation**: https://react.dev
- **Vite Documentation**: https://vitejs.dev
- **Cloudflare R2 Documentation**: https://developers.cloudflare.com/r2

---

## Change Log

### March 14, 2026
- Initial comprehensive technical documentation
- All core documents generated:
  - Architecture Overview
  - Authentication System
  - API Endpoints
  - Data Models
  - User Flows
  - Deployment Infrastructure
