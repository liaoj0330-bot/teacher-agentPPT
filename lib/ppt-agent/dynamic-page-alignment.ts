export function limitDynamicTeacherPages<T>(pages: readonly T[], plannedPageCount: number): T[] {
  const safeCount = Number.isFinite(plannedPageCount) ? Math.max(0, Math.floor(plannedPageCount)) : 0;
  return pages.slice(0, safeCount);
}
