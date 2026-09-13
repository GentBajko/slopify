export interface UploadOwner {
  readonly draftId: string;
  readonly attachmentId: string;
}
export function sameUploadOwner(current: UploadOwner | undefined, sent: UploadOwner): boolean {
  return current?.draftId === sent.draftId && current.attachmentId === sent.attachmentId;
}
