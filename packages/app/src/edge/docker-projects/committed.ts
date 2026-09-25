import { join } from "node:path";
import {
  type Container,
  type DockerConfig,
  type Journal,
  journalSchema,
  type Receipt,
  readState,
} from "./state.js";

export async function readCommittedJournal(
  c: DockerConfig,
  receipt: Receipt,
  current: Container | null,
): Promise<Journal> {
  const j = await readState(
    join(c.directory, receipt.transaction, "journal.json"),
    journalSchema,
    c.uid,
  );
  if (
    !j ||
    j.id !== receipt.transaction ||
    j.name !== receipt.name ||
    j.installation !== receipt.installation ||
    j.daemon !== receipt.daemon ||
    j.volume !== receipt.volume ||
    j.volumeIdentity !== receipt.volumeIdentity ||
    j.destination !== receipt.projects ||
    j.signature !== receipt.signature ||
    j.image !== receipt.image ||
    j.user !== receipt.user ||
    j.publishedIdentity?.dev !== receipt.directoryIdentity.dev ||
    j.publishedIdentity.ino !== receipt.directoryIdentity.ino
  )
    throw new Error("Committed activation journal is missing or inconsistent.");
  if (current) {
    const data = current.mounts.find((m) => m.destination === "/data");
    const projects = current.mounts.find((m) => m.destination === "/data/projects");
    const activation = current.mounts.find((m) => m.destination === "/opt/slopify-install");
    if (
      current.id !== j.candidate ||
      current.image !== receipt.image ||
      current.user !== receipt.user ||
      current.signature !== receipt.signature ||
      current.installation !== receipt.installation ||
      data?.type !== "volume" ||
      data.name !== receipt.volume ||
      !data.rw ||
      projects?.type !== "bind" ||
      projects.source !== receipt.projects ||
      !projects.rw ||
      activation?.type !== "bind" ||
      activation.source !== join(c.directory, receipt.transaction) ||
      activation.rw
    )
      throw new Error("Committed container identity or mounts differ from its receipt.");
  }
  return j;
}
