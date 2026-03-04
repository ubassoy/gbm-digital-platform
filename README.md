# GBM Digital Platform: B2B Wholesale Jewelry App

## 📌 Project Overview
This project serves as the digital bridge for a successful print media company, transitioning them into a data-driven platform business. It is a B2B "Digital Showroom App" restricted to verified jewelry retailers, designed to track user behavior, prove ROI to advertisers, and connect physical print magazine ads to digital product catalogs.

## 🏗️ Technical Architecture & Features

### 1. The Hybrid Model (Deep Linking & QR)
Built a dynamic routing system to track how users discover products:
* **The Scanner (High Intent):** Users scan a QR code from a physical print ad, which uses deep linking (e.g., `gbm://brand/brandname`) to bypass the home feed and land directly on the wholesaler's catalog.
* **The Browser (General Interest):** Users open the app naturally to browse the "New Arrivals" feed for organic discovery.
* **Analytics Tracking:** Differentiating these sources proves whether the physical magazine ad drove the lead, or if the platform's ecosystem drove the lead.

### 2. Multi-Layer Analytics Funnel
Implemented custom event tracking in Firebase Firestore to provide actionable data reports to wholesalers:
* **Page Views:** Tracks brand awareness ("Who looked?").
* **Favorites (Likes):** Tracks product intelligence via a wishlist system ("Who is interested?").
* **WhatsApp Clicks:** Tracks direct sales leads by generating pre-filled WhatsApp messages to wholesalers ("Who wants to buy?").

### 3. Automated Data Synchronization (`sync_manager.py`)
Developed a custom Python backend script using `firebase_admin` and `pandas` to manage the database:
* Downloads existing Firebase Firestore data to an Excel file for non-technical staff to review/edit.
* Cleans, flattens, and validates data (e.g., checking priority conflicts, formatting arrays).
* Uploads the synchronized Excel sheet back to Firestore, automatically generating sequential document IDs and updating wholesaler profiles.

### 4. Gatekept Security
Implemented Firebase Authentication with a manual admin-approval flow to ensure only verified retailers (via Shop License) can access live pricing and wholesaler contact info.

## 💻 Tech Stack
* **Frontend:** React Native, Expo, React Navigation
* **Backend & Database:** Firebase (Auth, Firestore)
* **Data Management:** Python, Pandas, openpyxl
