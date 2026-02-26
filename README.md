# SAIKOKU STUDIO AI Agent Platform

A modern, autonomous legal AI platform powered by LangGraph, FastAPI, ChromaDB, and Next.js.

## 🌟 Core Features (Phase 1 Complete)

1. **e-Gov Law Sync & Vectorization (RAG)**
   * Automatically fetches the latest Japanese laws from the e-Gov API.
   * Chunks and embeds XML legal documents into a local ChromaDB vector store.
   * Background CRON jobs keep the database updated with daily law amendments.
2. **Dynamic Agent Memory (RAM Allocation)**
   * UI to create distinct AI profiles (e.g., Tax Agent, Labor Agent).
   * Assign specific laws to specific agents dynamically without duplicating vector space.
3. **Context-Aware Conversational AI**
   * Uses `gemini-2.5-flash-lite` to answer questions based strictly on the agent's assigned legal RAM.
   * Retains conversational memory (chat history) across turns for natural interactions.
4. **Embeddable JS Widget (SaaS Integration)**
   * A standalone, dependency-free vanilla JavaScript widget (`widget.js`).
   * Uses **Shadow DOM** for strict CSS isolation (immune to host website styles).
   * Supports both "Floating Bubble" and "Inline Embedded" UI layouts.

---

## 💻 SaaS Integration Guide (For Frontend Developers)

You can easily embed the AI Agent into any external web application (e.g., your customer SaaS dashboard) by including our widget script.

### Step 1: Include the Script Hook
Place this somewhere in your HTML body:
```html
<script src="http://localhost:8000/widget/widget.js"></script>
```

### Step 2: Initialize the Widget
Call the `init()` function with your desired configuration. You can run multiple instances on the same page.

**Option A: Floating Chat (Standard)**
Appears as a floating bubble in the bottom right corner.
```javascript
window.SaikokuWidget.init({
    agentId: 'tax_01',             // The ID of the Backend Agent to connect to
    title: 'Tax Expert AI',        // Display Title
    themeColor: '#00D1B2',         // Brand primary color (HEX)
    displayMode: 'floating',       // Set to 'floating'
    
    // (Optional) Pass proprietary SaaS data to the AI's "Service RAM"
    serviceRAM: {
        userId: "U12345",
        companySize: "SME",
        plan: "Premium"
    }
});
```

**Option B: Inline Embedded (Sidebars & Dashboards)**
Renders the chat interface permanently inside a specific div container.
```html
<div id="my-saas-sidebar" style="width: 100%; height: 600px;"></div>

<script>
    // Note: If you want *multiple* widgets on one page, instantiate a new ChatWidget,
    // otherwise just use window.SaikokuWidget.init() for a single widget.
    const inlineWidget = new window.SaikokuWidget.constructor();
    
    inlineWidget.init({
        agentId: 'labor_01',
        title: 'HR Support',
        themeColor: '#3b82f6',
        displayMode: 'inline',         // Set to 'inline'
        containerId: 'my-saas-sidebar' // ID of the target DOM element
    });
</script>
```

---

## 🛠 Local Development Setup

Since the Japanese Law database is over 1GB, we do not commit the raw database to GitHub.
Follow these steps to instantly scaffold your local environment with lightweight Seed Data.

### 1. Prerequisites
- Node.js (v18+)
- Python (3.9+)
- A [Google Gemini API Key](https://aistudio.google.com/)

### 2. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Create your .env file
echo "GOOGLE_API_KEY=your_key_here" > .env

# Restore the Seed Database (approx 50 laws)
python seed_db.py

# Start the server (API + Static file hosting)
uvicorn main:app --reload
```
*Note: The backend runs on `http://localhost:8000`. The widget script is hosted at `/widget/widget.js`.*

### 3. Frontend Setup (Admin View)
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000` to access the AI Agent Management Workspace.
