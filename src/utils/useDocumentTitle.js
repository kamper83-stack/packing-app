import { useEffect } from "react";

// App-wide branding. Kept here so the base name lives in one place and every
// page renders a consistent "<Page> | PackPlanner" browser-tab title (Issue #67).
export const APP_NAME = "PackPlanner";
export const APP_TAGLINE = "Smart Suitcase Packing";

// Set the document title for the lifetime of a page/route. Passing a page
// label produces "Dashboard | PackPlanner"; passing nothing falls back to the
// branded default so no route is left showing the stale "React App" title.
// The previous title is restored on unmount so navigating between routes never
// leaves a stale tab label behind.
export default function useDocumentTitle(pageTitle) {
  useEffect(() => {
    const branded = `${APP_NAME} - ${APP_TAGLINE}`;
    const previous = document.title;
    document.title = pageTitle ? `${pageTitle} | ${APP_NAME}` : branded;
    return () => {
      document.title = previous;
    };
  }, [pageTitle]);
}
