let writerFenced = false;

export function isBackupWriterFenced(): boolean {
  return writerFenced;
}

export function fenceBackupWriter(): boolean {
  if (writerFenced) return false;
  writerFenced = true;
  return true;
}
