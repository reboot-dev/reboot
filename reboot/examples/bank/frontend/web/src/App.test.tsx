import { test } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

// This test fails intentionally, you may fix it. :-)
test("renders learn react link", () => {
  render(<App />);
  const linkElement = screen.getByText(/learn react/i);
  expect(linkElement).toBeInTheDocument();
});
