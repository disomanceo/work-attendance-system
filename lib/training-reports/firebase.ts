import "server-only";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

type TrainingReportFirebaseClient = {
  app: FirebaseApp;
  db: Firestore;
};

export const TRAINING_REPORTS_COLLECTION = "trainingReports";

function getConfig() {
  return {
    apiKey: process.env.TRAINING_REPORT_FIREBASE_API_KEY,
    authDomain: process.env.TRAINING_REPORT_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.TRAINING_REPORT_FIREBASE_PROJECT_ID,
    storageBucket: process.env.TRAINING_REPORT_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.TRAINING_REPORT_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.TRAINING_REPORT_FIREBASE_APP_ID,
  };
}

export function isTrainingReportFirebaseConfigured() {
  const config = getConfig();

  return Boolean(
    config.apiKey &&
      config.authDomain &&
      config.projectId &&
      config.storageBucket &&
      config.messagingSenderId &&
      config.appId,
  );
}

export function getTrainingReportFirebaseClient(): TrainingReportFirebaseClient {
  if (!isTrainingReportFirebaseConfigured()) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า Firebase สำหรับโมดูลรายงานผลการประชุม/อบรม",
    );
  }

  const config = getConfig();
  const appName = "training-reports";
  const app =
    getApps().find((item) => item.name === appName) ??
    initializeApp(config, appName);

  return {
    app,
    db: getFirestore(app),
  };
}
