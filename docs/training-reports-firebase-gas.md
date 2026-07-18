# Training Reports Firebase and GAS Setup

This module stores meeting/training report metadata in Firebase Firestore only. Existing official documents and assignments stay in Supabase and are used only as source references.

## Firebase

Create a new Firebase Web app for this module and add these values to `.env.local`:

```bash
TRAINING_REPORT_FIREBASE_API_KEY=
TRAINING_REPORT_FIREBASE_AUTH_DOMAIN=
TRAINING_REPORT_FIREBASE_PROJECT_ID=
TRAINING_REPORT_FIREBASE_STORAGE_BUCKET=
TRAINING_REPORT_FIREBASE_MESSAGING_SENDER_ID=
TRAINING_REPORT_FIREBASE_APP_ID=
```

Firestore collection:

```text
trainingReports
```

## Google Drive

Root folder:

```text
https://drive.google.com/drive/u/0/folders/1T_XN2LY3Qk4TMZoEvYWf-2OaKOzh1vXm
```

Folder structure created by Apps Script:

```text
2569/<book-number>/<teacher-name>/
```

Example:

```text
2569/33-2569/ครูนครินทร์/
```

## Apps Script

Use the source in `gas-training-reports/` for the dedicated Apps Script.

Set these Script Properties:

```text
TRAINING_REPORT_ROOT_FOLDER_ID=1T_XN2LY3Qk4TMZoEvYWf-2OaKOzh1vXm
TRAINING_REPORT_DRIVE_SECRET=<create-a-long-random-secret>
```

Deploy the Apps Script as a Web App, then add:

```bash
GAS_TRAINING_REPORT_URL=
GAS_TRAINING_REPORT_SECRET=
TRAINING_REPORT_DRIVE_ROOT_FOLDER_ID=1T_XN2LY3Qk4TMZoEvYWf-2OaKOzh1vXm
```

The website saves reports through `/api/training-reports`. When a report is submitted, Apps Script creates a PDF report from the form content, uploads any extra attachments, and Firestore stores only metadata and Drive file links.

Current local setup uses this dedicated Web App:

```text
https://script.google.com/macros/s/AKfycbzDA3kEjuJqBDthx-sFNZoP9b7i4ngRw_ww4JRL2vntXQjQN9LiXxJNk0AxbCPd1L7j/exec
```
