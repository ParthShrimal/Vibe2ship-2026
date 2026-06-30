import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

function todayKey() {
  return new Date().toISOString().split("T")[0];
}

export async function getAICache(
  uid: string,
  type: "day" | "coach" | "rescue"
) {
  const ref = doc(db, "aiCache", `${uid}_${todayKey()}`);

  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  return snap.data()[type] ?? null;
}

export async function saveAICache(
  uid: string,
  type: "day" | "coach" | "rescue",
  data: any
) {
  const ref = doc(db, "aiCache", `${uid}_${todayKey()}`);

  await setDoc(
    ref,
    {
      date: todayKey(),
      updatedAt: serverTimestamp(),
      [type]: data,
    },
    {
      merge: true,
    }
  );
}