import React from "react";
import { render, cleanup } from "@testing-library/react";
import useDocumentTitle, { APP_NAME } from "./useDocumentTitle";

function TitledPage({ title }) {
  useDocumentTitle(title);
  return null;
}

afterEach(cleanup);

test("a page label produces '<label> | PackPlanner'", () => {
  render(<TitledPage title="Dashboard" />);
  expect(document.title).toBe(`Dashboard | ${APP_NAME}`);
});

test("no label falls back to the branded default (never 'React App')", () => {
  render(<TitledPage title={undefined} />);
  expect(document.title).toBe(`${APP_NAME} - Smart Suitcase Packing`);
  expect(document.title).not.toMatch(/react app/i);
});

test("the previous title is restored when the page unmounts", () => {
  document.title = "Original";
  const { unmount } = render(<TitledPage title="Admin" />);
  expect(document.title).toBe(`Admin | ${APP_NAME}`);
  unmount();
  expect(document.title).toBe("Original");
});
