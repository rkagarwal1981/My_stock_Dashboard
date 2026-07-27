# Antigravity Trading Dashboard — Architectural Documentation

Welcome to the **Antigravity Unified Stock Trading Dashboard** curriculum blueprint. This document defines the structural architecture, component layers, data pipelines, schema mappings, and deployment topology of the application.

---

## 1. High-Level Architecture Overview

The system uses a **decoupled Full-Stack Client-Server Architecture** adopting MVC (Model-View-Controller) structural design rules:
* **View (Frontend Browser)**: Decoupled Single Page Application (SPA) managing local state and rendering dynamic, responsive widgets.
* **Controller (Backend API Server)**: High-performance ASGI service acting as the middleware controller to process business logic, run LIFO settlements, fetch live stock prices, and validate credentials.
* **Model (Database & Storage)**: Persistent relational store managing schemas, indices, and file assets.

### System Data Flow and Component Topology

```
+-----------------------------------------------------------------------------------+
|                                 FRONTEND BROWSER                                  |
|  +---------------------+   +---------------------+   +-------------------------+  |
|  |     React UI        |<->|   Redux Store       |<->|      Axios API          |  |
|  | (Vite Ecosystem SPA)|   | (Portfolio Slices)  |   | (Token Authentication)  |  |
|  +---------------------+   +---------------------+   +-------------------------+  |
+----------------------------------------^--------------------------|---------------+
                                         |                          |
                               WebSockets / HTTP                    | HTTP REST Requests
                                         |                          v
+----------------------------------------|------------------------------------------+
|                              BACKEND API SERVER                                   |
|  +-------------------------------------|---------------------------------------+  |
|  |                           Uvicorn ASGI Server                               |  |
|  |                          FastAPI Engine Router                              |  |
|  +--+------------------------+--------------------------+-------------------+--+  |
|     |                        |                          |                   |     |
|     v                        v                          v                   v     |
|  +--+------+              +--+------+                +--+------+         +--+------+  |
|  | LIFO    |              | Scrapers|                | Parser  |         | static  |  |
|  | Engine  |              | (Dhan,  |                | Engine  |         | Router  |  |
|  | (PnL    |              | Zerodha,|                | (open-  |         | (Static |  |
|  | Buckets)|              | mStock) |                | pyxl)   |         | PDFs)   |  |
|  +---------+              +---------+                +---------+         +---------+  |
+-----+-----------------------------------------------------------------------|-----+
      |                                                                       |
      | Database Queries (SQLAlchemy ORM)                                     | Stream File
      v                                                                       v
+-----+----------------------------------+                              +-----+-----+
|         DATABASE STORAGE               |                              |   LOCAL   |
|  +----------------------------------+  |                              | RESEARCH  |
|  | SQLite Local (portfolio.db) /    |  |                              |  FOLDER   |
|  | PostgreSQL Remote (Supabase Cloud)|  |                              |  (PDFs)   |
|  +----------------------------------+  |                              +-----------+
+----------------------------------------+
```

---

## 2. Frontend Layer (The User Interface)

The client application is built to load instantly, keep layouts smooth, and animate data transitions dynamically.

* **Primary Language**: TypeScript (strict type checking, typed states, and interface definitions).
* **Build System & Tooling**: **Vite** (hot-reloading build environment).
* **State Management Layout**: **React-Redux Toolkit**. 
  - Slices are modularized (e.g., [`portfolioSlice.ts`](file:///c:/My_work_RA/Antigravity/frontend/src/store/portfolioSlice.ts)) to track user sessions, holdings arrays, LIFO transactions history, target configurations, scraper sync states, and watchlist actions.
* **UI & Styling Libraries**:
  - **Material UI (MUI v9)**: Direct visual components framework styled with dark themes, utilizing clean Grid layouts (`size`), Popovers, Drawers, and Dialogs (`slotProps`).
  - **Recharts**: Responsive charting widgets for transaction flow distribution and historical performance trends.

---

## 3. Backend Layer (The Core Brain)

The backend handles security, file imports, background scraping routines, and standard mathematical transformations.

* **Primary Language**: Python.
* **API Framework**: **FastAPI** running on a **Uvicorn** ASGI server (asynchronous endpoints, automatic Swagger docs, and fast CORS middleware).
* **Key Internal Sub-Modules & Libraries**:
  - **LIFO Settlement Engine**: Runs calculation threads using `pandas` and `numpy` arrays to reconstruct stock purchase/sell groupings by scrip, compute net holding days, and track holding returns.
  - **Data Analytics Engine**: Day-bucket aggregators calculating monthly PnL, churn ratios, sector weights, tax drag, and portfolio volatility indexes.
  - **File Parsers**: Automated spreadsheets scanner loading local contract notes, Dhan csv files, and Zerodha spreadsheets utilizing `pandas` and `openpyxl`.
  - **Web Scrapers (Automation)**: Browser automation engine that logs into broker endpoints (Zerodha Console, mStock, Dhan) to capture live holdings snapshots.
  - **Static Files Mount**: High-speed local folder mounting to serve static research files:
    `app.mount("/static/research", StaticFiles(directory=uploads_dir), name="research")`

---

## 4. Database & Storage Layer (The Memory Bank)

The memory system models financial transactions, user keys, and stock metrics.

* **ORM**: **SQLAlchemy** (declarative mapping base providing database independence).
* **Database Management Engines**:
  - **Local Workspace**: SQLite database engine storing data locally at [`database/portfolio.db`](file:///c:/My_work_RA/Antigravity/database/portfolio.db).
  - **Cloud Environment**: Cloud-hosted PostgreSQL instance (clustered on Supabase).
* **Core Entity Tables**:
  - `User`: Handles credential hashing, authentication salts, and logins.
  - `Holding`: Caches current stocks held, quantities, buy prices, and Yahoo Finance live prices.
  - `Transaction`: Log of all buy/sell transactions (dates, quantities, transaction prices, and brokerage fees).
  - `ExecutedOrder`: Caches raw transaction streams retrieved during scrape automation.
  - `StockComment` & `StockNote`: Caches text commentary, bookmarks, and analysis logs.
  - `StockAttachment`: Relates uploaded PDFs with actual stored files on the server disk.
  - `TargetSetting`: Tracks target prices, categories, and buy/sell alerts.
  - `WatchlistAction` & `WatchlistManualScript`: Handles watchlist flags and custom scrips.

---

## 5. Deployment Infrastructure (The Cloud Network)

Deployment pipelines hook into repository check-ins for continuous deployment:

* **Frontend Web Application Hosting (Vercel)**:
  - Deploys frontend build chunks to global CDN nodes.
  - Proxy rules configured through `vercel.json` or custom domains routing `/api` paths straight to API services.
* **Backend API Engine Hosting (Render)**:
  - Managed Linux web service instances compiling dependency environments from `requirements.txt`.
  - Persistent volume disks mounted locally to ensure uploaded research PDFs survive server rebuilds and redeployments.
