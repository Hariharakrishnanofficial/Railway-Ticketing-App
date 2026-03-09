# RailAdmin – Railway Ticketing System Frontend

A production-grade React admin dashboard for the Railway Ticketing System Flask/Zoho backend.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + Vite |
| Routing | React Router v6 |
| HTTP | Axios |
| Forms | Formik + Yup (bookings form) |
| Styling | CSS Variables + inline styles (zero dependencies) |
| State | React hooks (useState, useEffect, useCallback) |

## Project Structure

```
src/
├── components/
│   ├── UI.jsx          # Shared design system (Icon, Badge, Button, Input, Modal, …)
│   ├── Layout.jsx      # Sidebar + TopBar + Breadcrumb
│   └── CRUDTable.jsx   # Generic sortable table with actions
├── context/
│   └── ToastContext.jsx # Global toast notifications
├── hooks/
│   └── useApi.js       # useApi / useMutation hooks
├── pages/
│   ├── OverviewPage.jsx  # Dashboard with stats + health
│   ├── TrainsPage.jsx    # Trains CRUD
│   ├── StationsPage.jsx  # Stations CRUD
│   ├── UsersPage.jsx     # Users CRUD
│   ├── BookingsPage.jsx  # Bookings CRUD + confirm
│   └── SearchPage.jsx    # Train search + booking flow
├── services/
│   └── api.js           # Axios client + all API endpoints
└── styles/
    └── global.css       # CSS variables + animations
```

## API Endpoints Used

| Endpoint | Method | Used In |
|----------|--------|---------|
| `/api/stations` | GET, POST | Stations page |
| `/api/stations/:id` | GET, PUT, DELETE | Stations page |
| `/api/trains` | GET, POST | Trains page, Search |
| `/api/trains/:id` | GET, PUT, DELETE | Trains page |
| `/api/users` | GET, POST | Users page |
| `/api/users/:id` | GET, PUT, DELETE | Users page |
| `/api/bookings` | GET, POST | Bookings page, Search |
| `/api/bookings/:id` | GET, PUT, DELETE | Bookings page |
| `/api/bookings/:id/confirm` | POST | Bookings page |
| `/api/health` | GET | Overview page |
| `/api/debug/config` | GET | (available) |

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit VITE_API_BASE_URL if needed

# 3. Start development server
npm run dev

# 4. Open http://localhost:3000
```

> **Vite Proxy**: In development, all `/api/*` requests are proxied to `http://localhost:9000`
> so you don't need CORS configuration. See `vite.config.js`.

## Build for Production

```bash
npm run build
# Output in ./dist – serve with any static file server
```

## Features

- **Overview Dashboard** – live stats, health check panel, recent bookings table
- **Trains CRUD** – list, create, edit, delete trains
- **Stations CRUD** – list, create, edit, delete stations  
- **Users CRUD** – list, create, edit, delete users with email validation
- **Bookings CRUD** – list, filter by status, create, edit, delete, confirm bookings
- **Train Search** – search by route/date, view available trains, book directly with fare summary
- **Collapsible Sidebar** – persistent navigation with active indicators
- **Toast Notifications** – success/error/warning/info feedback
- **Confirm Dialogs** – safe delete confirmation
- **Skeleton Loaders** – loading state for all tables
- **Search + Filter** – instant client-side search on all pages
