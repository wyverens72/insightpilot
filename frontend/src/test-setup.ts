import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
afterEach(cleanup);
Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
  value() {
    this.open = true;
  },
});
Object.defineProperty(HTMLDialogElement.prototype, "close", {
  value() {
    this.open = false;
  },
});
