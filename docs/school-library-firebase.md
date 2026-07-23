# School Library Firebase Setup

This project uses Firebase only for the school library document metadata. Files stay in Google Drive.

## Firebase console steps

1. Open Firebase Console and create a Firebase project.
2. Register a Web app in the project settings.
3. Create a Firestore database.
4. Copy the Web app Firebase config values.
5. Add these values to `.env.local`:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

Current local Firebase project:

```text
projectId: savedocument-bb8ad
collection: schoolLibraryDocuments
```

For the first local test, create Firestore Database in Firebase Console. If Firebase asks for rules and you are testing only, start in test mode, then tighten rules before real production use.

## Firestore collection

Use this collection name:

```text
schoolLibraryDocuments
```

Document fields:

```text
title
category
subcategory
owner
gradeLevel
subject
academicYear
fileType
status
keywords
driveUrl
createdAt
updatedAt
```

## Google Drive

Use this folder for the actual files:

```text
https://drive.google.com/drive/u/0/folders/1oqa3etlgk5LtqDLRY2SJn1mDinPL0_lJ
```

## Google Drive upload through Apps Script

The web page uploads local files through the Next.js API route:

```text
/api/school-library/upload
```

That route calls a dedicated school library Apps Script from `gas-school-library/`.

Do not reuse the existing profile/student-photo upload Apps Script endpoint for this feature. The deployed endpoint in `.env.local` is image-only and returns a JPG/PNG/WEBP validation error for document files.

Optional override:

```bash
SCHOOL_LIBRARY_DRIVE_ROOT_FOLDER_ID=1oqa3etlgk5LtqDLRY2SJn1mDinPL0_lJ
```

Set these script properties in Apps Script:

```text
SCHOOL_LIBRARY_ROOT_FOLDER_ID=1oqa3etlgk5LtqDLRY2SJn1mDinPL0_lJ
SCHOOL_LIBRARY_DRIVE_SECRET=<create a long random secret>
```

Deploy the Apps Script as a web app, then add these values to `.env.local`:

```bash
SCHOOL_LIBRARY_DRIVE_GAS_URL=
SCHOOL_LIBRARY_DRIVE_GAS_SECRET=
```

The selected file is uploaded to Google Drive first. Firestore stores only metadata such as title, category, file type, file name, file size, Drive file id, and Drive URL.

Files up to 4 MB use the normal `/api/school-library/upload` route. Larger files up to 30 MB are split by the browser and sent through `/api/school-library/upload-chunk`; the Next.js route forwards each chunk to Apps Script, and Apps Script rebuilds the file in Drive after receiving the final chunk.

When updating `gas-school-library/Code.gs`, redeploy the Apps Script web app so actions such as `deleteSchoolLibraryFile` are available to the website.
