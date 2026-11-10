import { startTransition, type FormEvent } from "react";

/**
 * An `onSubmit` that dispatches a form's action without React resetting it.
 *
 * A `<form action={fn}>` has its uncontrolled fields reset once the action
 * finishes — even when the action reported an error rather than throwing. A
 * refused save therefore wiped what had just been typed and put the stored
 * values back, which read as the save having half-happened. Submitting this
 * way keeps the fields; a form that saves closes itself, so there is nothing
 * left over to reset.
 *
 * `useFormStatus` does not see a submission made this way, so pair it with
 * the `isPending` that `useActionState` returns.
 */
export function submitKeepingFields(action: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    // React bubbles a nested form's submit through its parents (the source
    // dialog's Remove sits inside its Save form). That one is not ours.
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  };
}
