import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// The form imports the action module, which reaches server-only code.
const { declareAgeRange } = vi.hoisted(() => ({
  declareAgeRange:
    vi.fn<(prev: unknown, formData: FormData) => Promise<unknown>>(async () => ({
      message: "Saved.",
    })),
}));
vi.mock("@/app/actions/age", () => ({ declareAgeRange }));

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}));

import { AgeRangeForm } from "@/components/settings/age-range-form";

afterEach(() => {
  cleanup();
  declareAgeRange.mockClear();
  toastError.mockClear();
  toastSuccess.mockClear();
});

const picker = () => screen.getByLabelText("Your age range");

describe("<AgeRangeForm>", () => {
  it("says so when nothing has been confirmed", () => {
    render(<AgeRangeForm current={null} />);

    expect(screen.getByText("You have not told us your age yet."))
      .toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveTextContent("Confirm");
  });

  it("reports the stored bracket back in words", () => {
    render(<AgeRangeForm current="16_to_17" />);

    // Scoped to the sentence above the form: the same words are also one of
    // the <option>s, which is not what this is asking about.
    expect(
      screen.getByText(/You told us you are/),
    ).toHaveTextContent("You told us you are 16 to 17.");
    expect(screen.getByRole("button")).toHaveTextContent("Update");
  });

  it("offers every bracket", () => {
    render(<AgeRangeForm current={null} />);

    const labels = screen
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(labels).toEqual([
      "Choose an age range…",
      "Under 13",
      "13 to 15",
      "16 to 17",
      "18 or over",
    ]);
  });

  it("submits the chosen bracket", async () => {
    render(<AgeRangeForm current={null} />);

    await userEvent.selectOptions(picker(), "18_or_over");
    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(declareAgeRange).toHaveBeenCalled());
    const formData = declareAgeRange.mock.calls[0][1];
    expect(formData.get("age_range")).toBe("18_or_over");
    // The method is never sent from here — it is hard-coded server-side so a
    // self-declaration cannot be posted as a verified platform signal.
    expect(formData.get("age_assurance_method")).toBeNull();
  });

  it("surfaces a failure rather than looking saved", async () => {
    declareAgeRange.mockResolvedValueOnce({ error: "That couldn't be saved." });
    render(<AgeRangeForm current={null} />);

    await userEvent.selectOptions(picker(), "13_to_15");
    await userEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("That couldn't be saved."),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
